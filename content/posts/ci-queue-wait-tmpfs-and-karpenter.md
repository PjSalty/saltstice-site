---
title: "Cutting CI queue wait with tmpfs builds and a Karpenter pool"
date: 2026-10-19
summary: "p95 queue wait was 3398 seconds because the runner was capped at 3 jobs. Lifting the cap safely took tmpfs builds, a helper memory fix, and autoscaled CI nodes."
tags: [ci, kubernetes, karpenter, performance]
types: ["build"]
topics: ["Karpenter", "Kubernetes", "Operations"]
slug: ci-queue-wait-tmpfs-and-karpenter
---

The 95th percentile of CI job queue wait over 30 minutes was 3398 seconds. The shared runner was set to `concurrent = 3` and the build runner to 1.

The cap had a reason. On 2026-06-09, eight parallel `npm ci` jobs wrote to node disks backed by the host's single SSD mirror and froze every VM for about five hours. I didn't want to raise the limit without fixing that.

## Keep the disk churn off the mirror

The host has 80 threads at about 20% busy. RAM is the scarce resource. So builds moved to memory: `/builds` as a 4 GiB tmpfs, `$HOME` as a 2 GiB tmpfs, a job request of 1Gi with a 6Gi limit and 250m CPU, and `concurrent = 8`. I added a PrometheusRule that fires when p95 queue wait stays over 120 seconds for 15 minutes.

## What went wrong in the first seven minutes

tmpfs pages are charged to the cgroup of whatever writes them. The runner's helper container, limited to 512Mi, is the one that checks out sources and restores caches into `/builds`. Jobs with big caches died with:

```
Error in container helper: exit code 137 (OOMKilled)
```

39 jobs failed that way in seven minutes. Raising the helper's memory limit to 4Gi fixed it.

When you move a volume to tmpfs, size every container that writes to it, not just the build container.

## Autoscaled CI nodes

Karpenter was installed on the Proxmox provider but had never made a node. I added a tainted, scale-to-zero `ci-pool` and steered job pods to it. The first launches created VMs, but no Node ever appeared.

The agent install and server handshake were fine. The cause was a kubelet flag for the graceful-node period: the Kubernetes 1.36 that RKE2 ships rejected it with `failed to parse kubelet flag: unknown flag`, and the kubelet exited every five seconds. The settings moved into a `kubelet.conf.d` drop-in, and the first node joined.

I could only see that because cloud-init now installs and starts `qemu-guest-agent`. The Debian cloud image doesn't ship it, and without it there was no way to read the VM's logs.

## Two more things that only showed up under load

- Karpenter nodes booted without open-iscsi, so the storage driver's node pod sat in `ContainerCreating` with `/etc/iscsi is not a directory`. That failed the main-branch verify job whenever a burst node was alive. cloud-init now installs open-iscsi and nfs-common.
- No CPU overcommit. I right-sized idle guests instead, because the provider's shared-CPU mode is undocumented and I didn't want to depend on it.

## State

The default runner now allows 16 concurrent jobs, with a 2Gi memory request, the ci-pool toleration and `karpenter.sh/do-not-disrupt` on job pods. The first real CI bursts ran on ci-pool nodes. On 2026-11-01 the cluster has three of them alive.
