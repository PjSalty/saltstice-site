---
title: "Kubernetes backups with Velero on self-hosted SeaweedFS S3"
date: 2026-06-12
summary: "Velero with the Kopia uploader, backed by in-cluster SeaweedFS S3 on iSCSI, with ZFS underneath. Three independent recovery tiers and no cloud bill."
tags: [velero, backup, seaweedfs, kubernetes, zfs]
types: ["build"]
topics: ["Backup", "Storage", "Kubernetes"]
---

Velero v{{< lab "velero_version" >}} with the Kopia uploader backs up the cluster to an in-cluster SeaweedFS S3 gateway. The SeaweedFS volumes persist over iSCSI to the NAS, and ZFS underneath handles durability. My constraint was zero recurring spend. Velero only needs an S3-compatible API, so I run that API myself on SeaweedFS.

A few choices I made:

- Kopia over Restic. Velero dropped Restic, so a new deployment gets Kopia from the start and skips the migration later.
- SeaweedFS for the S3 endpoint. It runs on a single node, and its S3 gateway is a separate process from the volume server, so the two restart independently. MinIO wants 4 or more nodes before erasure coding is on the table.
- A pre-upgrade hook. Flux fires a one-shot backup whenever a HelmRelease is about to upgrade, so every change gets its own restore point and rolling back a bad upgrade is a `velero restore`.

## Three tiers

1. Velero plus Kopia for cluster state and PVCs. Daily fulls, hourly on the stateful core (identity and the password vault), short retention.
2. Per-database `pg_dump` to a separate bucket. A volume snapshot of a running Postgres is unreliable, but a dump restores anywhere. I added this tier after a power loss corrupted a database whose volume was supposedly backed up ([postmortem]({{< relref "/incidents/2026-04-17-full-site-power-loss.md" >}})).
3. ZFS snapshots under all of it. If Velero's own state is lost, the SeaweedFS volume rolls back to a known-good snapshot. It has also recovered individual files that automation mangled.

A verify job restores samples and runs `pg_restore --list` against the dumps on a schedule.

## The gap

All of it lives in one building. A fire takes the cluster, the NAS, and the backups in one go.
