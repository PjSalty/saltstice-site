---
title: "Split-horizon DNS for the homelab"
date: 2026-06-12
summary: "Cloudflare authoritative for the zone outside, AdGuard rewriting to the internal ingress VIP inside, acme-dns for DNS-01 challenges, and the search-domain bleed that crashed pods for months."
tags: [dns, adguard, cloudflare, kubernetes, acme, guide]
types: ["build"]
topics: ["DNS", "Networking"]
---

Every service answers at the same name, `service.example.com`, whether I'm inside the network or out on the internet. Inside, the name resolves to the internal ingress VIP, and outside, it resolves to the public edge. That is split-horizon DNS.

![Split-horizon DNS: LAN clients resolve via AdGuard to the internal ingress VIP, internet clients resolve via Cloudflare to the WAN IP](/diagrams/split-horizon-dns.svg)

Without it, internal clients resolve the public IP and traffic hairpins out through the router's NAT and back in. That is slower, and some NAT setups break on the hairpin outright. The [Jellyfin LAN-client problem]({{< relref "/posts/jellyfin-lan-clients-published-url.md" >}}) is the same issue.

## The four resolvers and their jobs

- Cloudflare is authoritative for the zone and answers the internet. I manage the records in Terraform, and a CronJob keeps the apex pointed at the dynamic WAN IP.
- AdGuard Home is the internal resolver every LAN client gets over DHCP. It holds the rewrite rules: `*.example.com` answers with the internal ingress VIP. It also does the ad-blocking, which is why the family puts up with the arrangement.
- CoreDNS runs inside Kubernetes. It owns `cluster.local` service discovery and forwards everything else upstream to AdGuard.
- acme-dns is a small authoritative server that holds one record type, the `_acme-challenge` TXTs, delegated to it by CNAME. cert-manager runs DNS-01 wildcard issuance against it without ever holding credentials to the real zone. If the cert pipeline gets compromised, the blast radius is the challenge records and nothing else. It cannot reach the zone.

external-dns keeps the per-service records in sync from IngressRoute annotations, so a new service gets its DNS straight from the manifest like everything else.

## Lessons

**Search-domain bleed broke pods for months.** The K8s nodes' cloud-init left a domain in the `resolv.conf` search line, and with Kubernetes' default `ndots:5`, a pod lookup for a short external name got that search domain appended first. Most software shrugs off the NXDOMAIN and retries, but CrowdSec and Falco did not, so their months of intermittent crashes looked like app bugs.

**Wildcard rewrites eat NXDOMAIN.** With `*.example.com` rewritten internally, a typo'd hostname resolves fine and then 404s at the ingress. A genuinely external lookup that should fail fast hits the wildcard trap instead. I put `ndots:1` on the workloads that talk to the outside a lot, which cuts the search expansions and the wildcard hits.

**The DNS proxy is a policy point.** Cilium can intercept DNS and enforce per-pod FQDN egress policy, so a workload gets "you may resolve and reach this one vendor domain and nothing else." The catch is CNAME chains. Allowing `api.vendor.com` buys nothing if it CNAMEs to `edge.cdn.net`. The policy has to cover the whole chain.

**Internal DNS is tier-zero.** When AdGuard is down, everything looks down. So it gets the same monitoring weight as the ingress, and the recovery runbook assumes name resolution is one of the things that might be broken: every step uses raw IPs. The [power-loss runbook]({{< relref "/incidents/2026-04-17-full-site-power-loss.md" >}}) exists because of exactly this kind of dependency stack.
