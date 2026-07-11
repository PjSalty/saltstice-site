---
title: "Jellyfin on Postgres with a Valkey second-level cache"
date: 2026-07-11
summary: "Zero server patches: the DB provider plugin seam takes an EF Core cache interceptor. An overlay repo keeps it rebaseable, and one smoke test found eight real bugs before prod ever saw it."
tags: [jellyfin, postgres, valkey, ef-core, kubernetes, ci]
---

Jellyfin keeps everything in SQLite, which makes it a forced singleton: one
writer, one pod, no replicas. I wanted it on Postgres with a shared cache in
front, and I wanted to stay close enough to upstream that a security release
costs me a version bump, not an afternoon of merge archaeology.

## The seam nobody advertises

Since 10.11, Jellyfin loads its database provider from a plugin
(`DatabaseType: PLUGIN_PROVIDER` in database.xml). The maintainer who built
that abstraction also ships the Postgres provider as a plugin:
[Jellyfin.Pgsql](https://github.com/JPVenson/Jellyfin.Pgsql).

The part that made this project small: the provider's `Initialise` receives
the live `DbContextOptionsBuilder`, and the server builds its pooled context
factory around whatever you do there. Call `options.AddInterceptors(...)`
inside the plugin and every query the server ever runs goes through your
interceptor. That's a whole-application second-level cache with **zero
patches to Jellyfin itself**.

I wired in
[EFCoreSecondLevelCacheInterceptor](https://github.com/VahidN/EFCoreSecondLevelCacheInterceptor)
backed by Valkey: no per-instance memory layer, the dependency graph lives in
Valkey itself, so a write on any instance invalidates for all of them.
Security-relevant tables (users, permissions, device tokens, API keys) are
never cached. Everything else is cached for 30 minutes and evicted on write,
including bulk `ExecuteUpdate`/`ExecuteDelete`, which the interceptor parses
table names out of. Playback progress churns its table every few seconds
during active streams, so those queries degrade to a micro-cache; browse
queries between library scans hit Valkey almost every time.

## An overlay, not a fork

The repo is [PjSalty/jellyfin-pgsql](https://github.com/PjSalty/jellyfin-pgsql)
and it contains no forked history at all: a pinned `UPSTREAM_REF`, two small
patches with intent and drop-when conditions in their messages, an `overlay/`
directory for the new cache code, and CI that reassembles from pristine
upstream on every run. When upstream releases, the bump is one line; if a
patch stops applying, `git am` names it. `DIVERGENCE.md` is the whole
contract: if it's not listed there, I didn't change it.

## What the smoke test caught

The compose smoke test (Jellyfin + Postgres 16 + Valkey, startup wizard
driven over the API, browse twice, assert cache hits, write, assert fresh
reads, kill Valkey, assert recovery) found eight real bugs before anything
touched production. The highlights:

- **Assembly collision inside the host.** Jellyfin ships AsyncKeyedLock
  7.1.8; newer cache library versions reference 8.x, and the plugin loads
  into the host's context, so the higher bind fails at bootstrap. The
  library pin is chosen so the plugin's AsyncKeyedLock exactly equals the
  server's. No standalone review could catch this; only running the
  assembled container did.
- **First boot crashed on a missing binary.** The provider shells out to
  `pg_dump` for pre-migration backups, and the stock Jellyfin image has no
  postgres client. Upstream's own docker packaging installs one for the
  same reason. Guaranteed production crash, caught in CI.
- **Fail-open is eventual, not instant.** The interceptor consumes the data
  reader to cache rows, so requests in flight when Valkey dies error until
  the availability probe trips (I bound it to 5 seconds). The docs now say
  what's true: a cache outage costs seconds of errors and then latency,
  never availability.
- **`pipefail` + `grep -q` eats its own success.** `compose logs | grep -q`
  closes the pipe at first match, `docker compose logs` dies with SIGPIPE,
  and pipefail fails the pipeline even though the line was found. Races on
  log volume, so it passes on short logs and fails on long ones.
- **Debug logging that destroys debugging.** Forwarding per-statement cache
  events during first-boot migrations flooded Serilog's bounded async queue,
  which silently drops lines, including the one line the test asserted on.

Every one of those is the same lesson wearing different clothes: the unit
you have to test is the assembled system, because that's the only place
these failure modes exist.

## Where it ends up

Releases are tagged to the upstream plugin version
(`10.11.11-1-salty.1`), built by CI from pristine upstream plus the
patches, scanned, smoke-tested, and published with checksums. The cache
interceptor is small enough that the plan is to offer it upstream once it
has some runtime behind it.
