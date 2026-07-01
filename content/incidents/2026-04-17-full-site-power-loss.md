---
title: "Full site power loss and five failures exposed on cold boot"
date: 2026-04-17
summary: "The rack lost power"
tags: [postmortem, power, kubernetes, harbor, traefik, recovery]
types: ["incident"]
topics: ["Hardware", "Storage", "Database"]
---

Power dropped to the whole rack. Everything came up at once and everything looked down. Every FQDN returned 503, so my first read was that the cluster hadn't survived the power loss. Five separate things broke when starting, and each one masked the one behind it. With Traefik down every service looks down, so I couldn't tell Harbor auth was broken until the ingress was back. With Harbor down, pods crash for reasons that look like app failures.

## Root cause

All five were already latent in the system before the outage. A normal reboot sequences startup and hides them, but the dirty parallel boot exposed all five at the same time.

**1. Traefik couldn't start because the internet wasn't ready.** The CrowdSec bouncer plugin downloads from `plugins.traefik.io` on every pod start. Cilium's identity cache wasn't warm yet, so DNS failed, the plugin retry loop pegged the CPU, the liveness probe timed out, and the pod went into CrashLoopBackOff. This is the one that cost me the most, because with the ingress down every FQDN behind it returned 503 and the whole site looked dead. The ingress controller had a runtime dependency on external DNS that only bites when the whole site boots at once.

**2. Harbor's Postgres ate its own auth.** The powerloss corrupted the admin password hash and dropped project rows. Every robot account got 401, so anything with `imagePullPolicy: Always` went ImagePullBackOff as its cached images aged out. The backup job had snapshotted the registry volume but not Harbor's internal Postgres, so the blobs survived while the metadata that made them reachable did not.

**3. Proxmox lost its route to the ingress VIP.** Config management applied that route at runtime and it wasn't reboot-safe, so after the cold boot the SSO callbacks from the hypervisor died with connection refused.

**4. The Authentik outpost couldn't reconcile itself.** Its ServiceAccount had token automount disabled, so the outpost controller couldn't recreate its own Deployment after the restart. Every forward-auth protected app returned 503, which looked like yet another ingress problem and sent me back to Traefik for a while before I realized it was separate.

**5. CrowdSec agents got locked out by their own stale registrations.** The LAPI keeps machine registrations forever. The restarted agents tried to register, got 403 "user already exists" from their own stale entries, and crash-looped.

The fix order mattered, and I derived it live during the recovery. The runbook exists now, written from the actual recovery: [power-outage-recovery runbook](https://github.com/PjSalty/saltstice-homelab/blob/main/runbooks/power-outage-recovery.md). Every step in it cost real downtime to learn.

## Fix

- Traefik image now ships the plugin pre-baked, so there's no runtime download and no internet dependency on the boot path.
- Harbor backups gained a nightly `pg_dump` of the internal Postgres, verified with `pg_restore --list` in the backup-verify job. Volume snapshots didn't capture the Postgres state.
- The Proxmox VIP route became a systemd oneshot that retries until the VIP pings, ordered before `pvedaemon`.
- Authentik outpost RBAC went into git as a namespace-scoped Role on a dedicated ServiceAccount. It reconciles itself now.
- CrowdSec machines get pruned weekly by CronJob.
- A UPS with NUT and a tiered shutdown cascade is designed and written up as an [ADR](https://github.com/PjSalty/saltstice-homelab/blob/main/docs/adrs/ups-auto-recovery-plan.md): workers drain first, storage flushes last, and Proxmox startup ordering reverses it on cold boot. Not implemented yet.

All five only show up during a cold parallel boot, which normal operations never exercise.
