---
title: "A switch restart cut iSCSI and corrupted two ext4 journals"
date: 2026-09-05
summary: "A 3m54s switch restart outlasted the iSCSI session timeout. Two database volumes came back with journal errors, and the CSI driver's unstage did nothing."
tags: [postmortem, iscsi, mikrotik, storage, kubernetes]
types: ["incident"]
topics: ["Storage", "Networking", "Kubernetes"]
slug: 2026-09-05-switch-upgrade-cut-iscsi
---

On 2026-09-05 the access switch restarted for 3 minutes 54 seconds. All four host uplinks hang off that switch, so every Kubernetes node lost its iSCSI path to TrueNAS for longer than the session's replacement timeout. Two database volumes came back with ext4 journal errors.

## The cause, corrected

My first write-up blamed the switch's new weekly self-upgrade scheduler. The switch log said otherwise: `router rebooted by tcp-msg(winbox):admin/upgrade`. That was my own manual package upgrade from WinBox. The upgrade scripts and the weekly scheduler were added about 15 minutes later.

The mechanism is the same either way. An uplink outage longer than `node.session.timeo.replacement_timeout` makes the initiator give up on the session, and the filesystems above it start failing writes.

The weekly scheduler is a real risk anyway. The other switch is the only path between the host uplinks and the router, so its restart severs every inter-VLAN path, iSCSI and NFS included. I left the schedulers on. The fix belongs on the node side: a replacement timeout longer than a switch boot, and alerts on ext4 error counts and iSCSI session state.

## Recovery without a restore

An identity provider's Postgres and a second database were affected. Neither needed a backup restore. For each volume:

1. Suspend the Flux owner, then scale the StatefulSet to 0.
2. Unmount the stale global mount on the node by hand.
3. Log the iSCSI session out, only when no mounts remain.
4. Run a read-only `e2fsck -f -n` against the zvol from TrueNAS while no initiator is attached.
5. Scale back to 1 and let the database replay its own log.

Postgres came back with a 278 kB WAL redo and no restarts. The other database replayed its log in 1.4 seconds and rolled back to its last stable checkpoint.

## The unstage that did nothing

Step 2 is by hand because the CSI driver's node unstage was a no-op for iSCSI volumes. On scale-to-0 the driver logged:

```
NodeUnstageVolume ... "NFS Unstage (no-op)"
```

for an iSCSI volume, and returned success in 186 microseconds. It never unmounted the global mount or logged the session out. Kubelet only unmounts the pod's publish path, so the device stayed mounted with the stuck superblock and the session stayed logged in. A re-stage without the manual unmount would have bind-mounted the same dead filesystem and crash-looped again.

That was driver v1.1.2. The cluster runs a newer release now, and I haven't checked whether it fixes this.

Checking `mount | grep -c <pvc-id>` is the wrong test for the global mount, because its path is a hash. Look for `/globalmount` in the path.

## Two controls, same day

A host cold-start and a switch upgrade both fired unattended on the same day, and a third control was armed. I now check the calendar against the switch's maintenance slots before any host window.
