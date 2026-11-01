---
title: "Running more than one Jellyfin pod"
date: 2026-10-14
summary: "Postgres removed the SQLite single writer. It didn't remove the dozen places Jellyfin assumes it is the only process alive. Each one, what it costs, and why it runs as one pod today."
tags: [jellyfin, kubernetes, postgres, rffmpeg, gpu]
types: ["build"]
topics: ["Jellyfin", "Kubernetes", "Database", "Storage"]
slug: making-jellyfin-horizontally-scalable
---

Moving Jellyfin onto Postgres killed the SQLite single writer. It did not make Jellyfin horizontally scalable. Those are different problems, and the space between them is a pile of assumptions the code makes about being the only process alive.

The [Postgres and Valkey backend](/posts/jellyfin-on-postgres-with-a-valkey-second-level-cache/) is the floor: shared truth, shared cache, no more one-writer file lock. Above it, the moment two Jellyfins share one database they start fighting over things neither knows the other exists. What follows is every one of those fights and what it cost to end it.

## One leader, N replicas

Not every pod is equal. One pod, the leader (a 1-replica Deployment, strategy Recreate), owns everything a singleton has to own: scans, scheduled tasks, DVR, UDP discovery. The rest are replicas (RollingUpdate) that only browse, serve API, direct-play, and stream HLS. The leader is named, not elected by a lock query, because a 1-replica Deployment already is the election: Kubernetes reschedules exactly one of it. That reduces "who's the leader" to a scheduling fact instead of a distributed-consensus problem I'd have to write.

Everything below is a place where that split isn't free.

## Scheduled tasks run everywhere by default

Jellyfin's `TaskManager` arms its cron on startup. `LibraryManager` tracks whether a scan is running in a process-local bool. Run two pods and you get two schedulers firing the same jobs, two scanners writing the same tables, two DVR recorders fighting one tuner.

Closed with a fork patch: cron, LiveTV, and DVR arm only when the pod's role is leader and it holds a Postgres advisory lock. The role env-gate alone isn't enough. During a Recreate overlap or a brief partition, two pods can both believe they're the leader for a few seconds, which is plenty of time to double-arm DVR. `pg_try_advisory_lock` closes that window because Postgres hands the lock to exactly one connection. The scan entry point takes the same lock, and every scan trigger (the media drop-watcher, the user-sync job, the audit CronJob) targets the leader Service, never a random pod.

## Sessions live in one pod's memory

This is the one that turns a load-balancer detail into a correctness requirement. `SessionManager` keeps active connections in a process-local dictionary. `TranscodeManager` holds live ffmpeg process handles. QuickConnect codes and the SSO plugin's OIDC state sit in memory on whichever pod started the flow.

So stickiness stops being a latency optimization and becomes correct-or-not. If a client's requests scatter across pods, its transcode spawns twice, its QuickConnect code is unknown to the pod that gets the confirm, its OIDC callback lands on a pod that never saw the auth request.

The routing gets sticky at the ingress. The serving Service carries the cookie-stickiness annotations Traefik reads (from the Service, not the Ingress, the ingress-level ones turned out to be decorative). UDP discovery answers from a leader-only Service so N pods don't all reply to one broadcast. And `/sso` pins to a dedicated leader ClusterIP, because the callback has to hit the pod that owns the in-flight state.

What doesn't close: SyncPlay groups and the cross-pod sessions dashboard. Those need a real shared session store, a 9.9k-line road with one author that stalled several versions back, and the payoff didn't justify the fork surface. They degrade to single-pod behavior, and that's written down in the runbook, not hidden.

## A transcode is a live OS process

`TranscodeManager` doesn't hold a job record you can hand to another pod. It holds a live ffmpeg process with a kill timer, a throttler, and seek and bitrate restart semantics all bound to that process. You can't distribute that. So don't.

rffmpeg: the ffmpeg a serving pod spawns is a shim. It ssh's to one worker that owns the GPU exclusively, runs the real NVENC ffmpeg there, and writes HLS segments to a shared scratch volume. The origin pod still serves every segment GET, so the in-process kill timer and throttler keep ticking as if ffmpeg were local. The job never leaves the pod that owns it; only the encode does.

The failure modes are real, and I hit them. Under load, sshd's per-source penalty rate-limiting started refusing dispatch connections and killing transcodes mid-stream. When the worker is unreachable the shim falls back to capped local CPU ffmpeg on the serving pod, with a Loki alert on any ffmpeg spawn on a serving pod so a silent misroute fails loud instead of slow.

## Migrations race at startup

Every Jellyfin runs its EF Core migrations on boot. N pods booting together race to migrate one schema. So there is exactly one writer. A migrate Job runs the server with `--mode MigrateSystem` and exits; serving pods set `JELLYFIN_SKIP_MIGRATIONS` and fail fast if the schema isn't already current. The Job's name carries a revision, so a new migration pass is a new immutable Job, and CI refuses a merge that bumps either image without bumping that rev.

## A token cache that never re-reads

`DeviceManager` caches API tokens and device tokens in memory and never re-reads the row. Mint an API key on the leader and a replica keeps 401ing it forever. The patch is small: read through to Postgres on a cache miss. The canary is per-pod 401 rate.

## The fork stays small

It's an overlay, not a fork that drifts: [jellyfin-fork](https://github.com/PjSalty/jellyfin-fork) pins an upstream release (v12.2 now) and keeps a series of small patches on top, 19 files at the time of writing. Each one says why it exists and when it can be dropped. CI rebuilds the whole thing from pristine upstream on every run, so the patches either apply or the build fails.

The groups are the ones above: the `MigrateSystem` mode and the fail-fast skip-gate, conflict-safe upserts for the insert races, leader-gated background work with the advisory lock, the token read-through, and a few PostgreSQL fixes for the 12.x migrations. The Postgres provider itself is [jellyfin-pgsql](https://github.com/PjSalty/jellyfin-pgsql), which is upstream's plugin plus the Valkey cache from the last post.

## Where it stands

The split shipped, ran, and then collapsed back to one pod. On July 14 the replica Deployment and its HPA came out, and the GPU worker folded back into a single pod that owns the A2000 directly, no ssh hop.

The reason is in the design's own words: one GPU is a capacity budget, not a scaling axis. The A2000 does roughly six concurrent 4K streams, and there is exactly one card. The worker existed to un-pin the server from the GPU node, and dispatching over ssh bought that un-pinning at the price of a new failure mode (see: sshd penalties). For a single-GPU homelab that never saturates the card, folding it back into the pod is the cheaper correct answer.

What stays: the fork patches, the advisory lock, the leader-only Services, the cookie stickiness and the migrate Job. They cost nothing at one pod, and they're what makes a second pod safe the day the card count changes.
