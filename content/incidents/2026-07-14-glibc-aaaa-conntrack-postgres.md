---
title: "The glibc A/AAAA conntrack race that killed my Postgres connections"
date: 2026-07-14
summary: "Jellyfin threw 500s on artwork under load. The driver wasn't broken and Postgres was fine. glibc firing the A and AAAA lookups in parallel over one socket collided on a conntrack DNAT tuple, one packet got dropped, the resolver returned EAGAIN, and it killed the connection open mid-flight. The fix was three resolver tweaks, not code."
tags: [postmortem, jellyfin, dns, postgres, kubernetes]
types: ["incident"]
slug: 2026-07-14-glibc-aaaa-conntrack-postgres
---

Jellyfin started throwing 500s on `/Items/*/Images` whenever the library
got busy. Not every request, not any one poster. A steady trickle that got
worse the more people browsed at once. Half the artwork on a page would come
back broken.

The database was fine. Postgres logs were clean: no slow queries, no
connection limit, headroom to spare. The driver wasn't throwing anything
shaped like a query error. What it was throwing, buried in the provider
plugin's logs, was `EAGAIN` ("Resource temporarily unavailable"), out of the
resolver while opening a connection.

## The lookup is the failure, not the query

The fork talks to Postgres through the PostgreSQL provider plugin, which
opens connections with Npgsql, the .NET driver. Opening a connection means
resolving the database host first. That resolution runs through glibc inside
the container, against CoreDNS on the DNS ClusterIP.

glibc's default is to fire the A and the AAAA query for a hostname at the
same time, on the same UDP socket, so they share a source port. Two packets,
one 5-tuple, back to back to the DNS service. That service is a ClusterIP, so
every packet gets DNAT'd to a CoreDNS pod on the way out.

Here's where it comes apart. Two UDP packets with an identical 5-tuple hit
conntrack at almost the same instant. conntrack tries to insert a NAT entry
for each, the two inserts race, one loses, and its packet is dropped on the
floor. glibc sat waiting for a reply that was never coming and handed the
caller `EAGAIN`. This is the old racy-conntrack DNS bug. It only shows up
under enough concurrency to line two lookups up inside the same conntrack
window.

Npgsql has no retry on the query path. A connection open that fails DNS
doesn't get quietly redialed. It fails, and Jellyfin turns that into a 500.
So a kernel-level packet drop on a DNS reply surfaced, four layers up, as a
broken poster in someone's browser. Nothing in between logged anything that
pointed at DNS.

## Three tweaks, no code

The instinct is to reach for the driver. Add a retry, wrap the open. Wrong
layer. The driver is behaving correctly; the resolver is the thing racing.
The fix is three changes to how names get resolved, and not a line of code.

**Serialize the two lookups.** The pod carries a `dnsConfig` option:

```yaml
# apps/jellyfin/base/deployments/leader.yaml
dnsConfig:
  options:
    - name: single-request-reopen
```

`single-request-reopen` tells glibc to send the A query, then the AAAA query
on a *fresh* socket, instead of both at once on a shared one. Different
source port each time, so the two lookups never present the same 5-tuple to
conntrack, and the race that was dropping packets simply can't fire. (`use-vc`,
which forces the resolver onto TCP, is the bigger hammer for the same
problem. Serializing the UDP lookups was enough and cheaper.)

**Warm the pool so you barely resolve at all.** This is the load-bearing
half. Every request that opens a fresh connection is another roll of the dice
on that DNS race. Keeping a warm pool of connections open
(`POSTGRES_MIN_POOL_SIZE`, read by the plugin) means the hot path reuses an
established connection and never touches the resolver. `single-request-reopen`
covers the residual opens on startup and scale-up. The warm pool removes
almost all of the opens in the first place. Fewer lookups, fewer chances to
lose.

**Make the name absolute.** The host was a short name, `jellyfin-postgres`.
The default Kubernetes `resolv.conf` ships `ndots:5` and a stack of search
domains, so a short name gets expanded into up to four candidate FQDNs, and
glibc tries each one, each an A+AAAA pair, until one resolves. That's up to
four times the lookup volume per open, all of it feeding the race. Pinning
the host to an absolute FQDN with a trailing dot skips search-domain
expansion entirely:

```yaml
# apps/jellyfin/base/deployments/leader.yaml
- name: POSTGRES_HOST
  value: <postgres-service>.<namespace>.svc.cluster.local.
```

The trailing dot is the whole point. It tells glibc the name is already
absolute, so no `ndots` walk. On its own this one is marginal, the first
search candidate already resolves, but it's zero cost and it removes the tail
risk of the resolver doing four times the work under load.

## Why it hid

`EAGAIN` out of `getaddrinfo` means a DNS packet went missing. It doesn't mean the query or the database is wrong. The driver has no retry on the lookup path, so a transient resolver failure became a hard 500 that looked like an application fault all the way up.

The race needs two lookups inside the same conntrack window, so it only shows under load. Open one connection by hand and it resolves fine.

None of the three changes touch application code. They serialize the lookups, cut the number of connection opens, and stop the resolver from multiplying each open into four. The cheapest way to fix a packet-level race is to stop generating the packets that race.
