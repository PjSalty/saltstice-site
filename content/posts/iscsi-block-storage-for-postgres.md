---
title: "iSCSI block storage for Postgres"
date: 2026-04-12
summary: "Postgres fsync semantics don't survive NFS. iSCSI presents a block device, so fsync becomes a real durable write."
tags: [postgres, storage, kubernetes, zfs]
types: ["build"]
topics: ["Storage", "Database", "Kubernetes"]
---

I ran Postgres on NFS for the better part of a year and it worked. Backups and snapshots were fine, and the cluster restarted cleanly when I drained nodes for maintenance.

Then a power blip. Postgres came back with corrupted WAL on two of three replicas. Neither could crash-recover, and the last good backup was 4 hours stale.

## Why NFS loses writes

NFS lets the client ack `fsync()` before the server has committed to stable storage. The protocol permits it. Even with the `sync` mount option, NFSv3 only forces a server-side commit on file close, not per block. Postgres expects per-block durability. When `fsync()` returns, it should mean the byte is on disk for good, but on NFS it can mean the byte is still in the server's page cache.

In steady state nobody notices. When the server loses power mid-write, or the network drops a window of packets and the client retransmits with a stale view, you lose WAL blocks Postgres thought were committed. Postgres uses the WAL to crash-recover, so if the WAL is the corrupted file, there is no recovery.

## iSCSI path

iSCSI presents a block device. The Linux block layer handles `fsync()` exactly like a local SCSI disk. The flush goes to the storage server, ZFS commits the transaction group, and the ack comes back. Postgres `fsync()` calls become real durable writes.

## Storage classes

The cluster has two storage classes:

- `truenas-iscsi` for RWO block. Every Postgres, MongoDB, MySQL, SQLite PVC.
- `nfs-client` for RWX file. Media library, shared static assets, app config that is checkpoint-style rather than transactional.

Both land on the same TrueNAS box. What differs is the protocol on the wire and the durability guarantee at the syscall layer.

The iSCSI class runs on truenas-csi, the official WebSocket-native driver for TrueNAS SCALE.

## RWO and Recreate

iSCSI is RWO, so Postgres deployments need `strategy: Recreate`. That fits Postgres. Replication runs between distinct database instances, each with its own storage, so nothing needs a shared filesystem.

Full ADR with the failure-mode reproducer: [saltstice-homelab/docs/adrs/iscsi-for-databases.md](https://github.com/PjSalty/saltstice-homelab/blob/main/docs/adrs/iscsi-for-databases.md).
