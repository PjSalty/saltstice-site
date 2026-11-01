---
title: jellyfin-pgsql
date: 2026-07-11
lastmod: 2026-11-01
summary: PostgreSQL as Jellyfin's database, with an EF Core second level cache in Valkey.
tags: [jellyfin, postgres, valkey, csharp]
slug: jellyfin-pgsql
---

[jellyfin-pgsql](https://github.com/PjSalty/jellyfin-pgsql) is [JPVenson/Jellyfin.Pgsql](https://github.com/JPVenson/Jellyfin.Pgsql) plus a cache. Repeated queries come from Valkey (or Redis) through an EF Core second level cache interceptor instead of hitting the database. GPL-3.0.

It's an overlay build: `UPSTREAM_REF` pins the upstream plugin, `patches/` holds small patches, and `overlay/` holds the new code, which is the cache and the PostgreSQL migrations that 12.1 needs.

## Behavior worth knowing

- The cache fails open. When Valkey dies, requests already in flight can error until a probe marks it down (5 second re-probe), then everything runs uncached with a warning.
- Security tables are never cached by default: users, permissions, preferences, devices, API keys. Token revocation reads the database.
- `CACHE_ENABLED` is off by default, and then the plugin acts like upstream.
- Run Valkey as a cache, not a datastore: `--maxmemory-policy volatile-lru`, persistence off, a `--maxmemory` bound.

Release tags read `<server>-<upstream plugin release>-salty.<rev>`. The latest is `12.2-0-salty.1`. The older 10.11 line was `10.11.11-1-salty.N`.

The write-up of the original design is [Jellyfin on Postgres with a Valkey cache](/posts/jellyfin-on-postgres-with-a-valkey-second-level-cache/).

## Source

- GitHub: <https://github.com/PjSalty/jellyfin-pgsql>
- License: GPL-3.0
