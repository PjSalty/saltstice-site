---
title: jellyfin-fork
date: 2026-09-27
lastmod: 2026-11-01
summary: Jellyfin plus a short patch series so more than one replica can run against PostgreSQL.
tags: [jellyfin, kubernetes, csharp, postgres]
slug: jellyfin-fork
---

[jellyfin-fork](https://github.com/PjSalty/jellyfin-fork) is an overlay build, not a diverged fork. `UPSTREAM_REF` pins an upstream release (production is on the {{< lab "jellyfin_version" >}} line right now), `patches/` holds the changes with their intent and drop-when conditions in the commit messages, and CI reassembles from pristine upstream on every run. GPL-2.0, same as upstream.

## What the patches do

| Concern | Without | With |
|---|---|---|
| DB migrations | every replica races the migration path at boot | a Job runs `--mode MigrateSystem` once, replicas skip it and fail fast if the schema is behind |
| Scheduled tasks, scans, DVR | every replica arms every trigger | only where `JELLYFIN_ROLE=leader` |
| Auth tokens | a token minted on one replica 401s on the others | cache misses read through to the database |
| Concurrent saves | duplicate-key aborts under parallel writers | conflict-safe upserts |
| Paging a library | items with the same sort name repeat or vanish across pages on PostgreSQL | every ordering ends on the item id |
| Migration Job result | a failed pass logs the error and still exits 0 | exits 1 |

Leave `JELLYFIN_ROLE` unset and it behaves like stock Jellyfin.

The image optionally bundles rffmpeg, so transcodes can run on a remote GPU worker over ssh.

## Releases

12.1-salty.1, .2 and .3 shipped 2026-09-27 and 2026-09-28. 12.2-salty.1 shipped 2026-10-12. The 12.2 upgrade had two surprises: the bundled hls.js 1.6.16 demuxer worker breaks under jellyfin-web's minifier (the workaround is `enableWorker=false`), and the `MigrateRatingLevels` migration cleared parental scores. Later releases are on the [releases page](https://github.com/PjSalty/jellyfin-fork/releases).

The design notes are in [running more than one Jellyfin pod](/posts/making-jellyfin-horizontally-scalable/). The database provider is [jellyfin-pgsql](/projects/jellyfin-pgsql/).

## Source

- GitHub: <https://github.com/PjSalty/jellyfin-fork>
- License: GPL-2.0
