---
title: "Migrating Kubernetes volumes from democratic-csi to truenas-csi"
date: 2026-06-22
summary: "TrueNAS 26 removes the REST API. My CSI driver only spoke REST. Moving seven live volumes to the official WebSocket-native driver with no data loss"
tags: [kubernetes, storage, truenas, csi, zfs]
types: ["build"]
topics: ["Storage", "TrueNAS", "Kubernetes"]
---

TrueNAS 26 removes the REST API. The release notes say REST endpoints do not function in 26 and later. [democratic-csi](https://democratic-csi.github.io/) hands my Kubernetes cluster its block and file storage, and it only speaks REST.

So the driver had to change before I could move the NAS to 26. iX ships a first-party driver, [truenas-csi](https://github.com/truenas/truenas-csi), that talks JSON-RPC 2.0 over a WebSocket at `/api/current`. I moved seven live volumes onto it without losing data.

## Why now

REST was deprecated in 25.04. 25.10 fires a daily alert every time something hits a deprecated endpoint. 26 deletes it. democratic-csi has no WebSocket support, and the upstream issue for it has sat open with no code for months. I wasn't going to bet on the community driver catching up before a hard removal date.

## Migrating the Deployment-backed apps

Both drivers run side by side. Existing volumes stay on democratic-csi while truenas-csi serves a new `StorageClass`.

For each Deployment-backed app the move is mechanical: provision a new PVC on the new driver, stop the workload, `cp -a` the data from old to new, repoint the `claimName` in git, and let Flux reconcile. The old PVC stays on `Retain`, so rollback is a one-line revert. Postgres needs one extra step: `PGDATA` wants `0700` and the copy lands it `0770`, so I `chmod` before the database starts.

Verify by content. Count the rows. For the databases I diffed table counts against a pre-migration snapshot. For the media server I confirmed it served a file.

## The MongoDB StatefulSet

One workload is a MongoDB replica set running as a `StatefulSet` from a Helm chart. Two things complicate it.

`StatefulSet` `volumeClaimTemplates` are immutable. You can't change the storageClass in place, Kubernetes rejects the update. The generated PVC name is fixed by the template, so the new volume has to claim the exact same name the old one had.

The sequence that worked:

- dump the data while the database is still up, onto a holding volume
- scale the workload to zero
- set the `StatefulSet` `persistentVolumeClaimRetentionPolicy.whenScaled` to `Delete` (the default is `Retain`) so the controller deletes the old PVC on scale-down. That is declarative cleanup, no manual `kubectl delete pvc`
- get Helm to recreate the `StatefulSet` on the new storageClass by toggling the chart's `mongodb.enabled` off, reconcile, then on. Helm `--force` delete-and-recreates every resource in the release and dies on the bound PVCs it can't replace
- restore the dump into the fresh, empty database

The app uses Mongo client-side field encryption. The data-encryption key, the DEK, lives in a key vault collection inside the database. If the app boots against an empty database before the restore lands, its setup path sees no DEK and mints a new one. Every field encrypted under the original DEK is then permanently unreadable.

So the restore has a hard gate. Before the app reconnects, I assert that the key vault document's `_id` matches the value I captured before the migration. If it doesn't match, stop. It matched. The app came up and read its own encrypted data.

## Decommissioning the old zvols

The old zvols would not delete, and every attempt failed with `filesystem has dependent snapshots`.

A recursive periodic snapshot task on the parent dataset was snapshotting the dead volumes alongside the live ones, and those snapshots held the zvols hostage. Disabling the task would drop backups on the volumes still in use. The fix is to re-scope the task to the live child dataset, then let the old snapshots age out on their own retention. No hand-deleting snapshots on a production pool.
