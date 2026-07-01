---
title: "Karpenter on Proxmox"
date: 2026-05-03
summary: "Three NodePools on a weight ladder with the sergelogvinov Proxmox provider, alpha and single-maintainer."
tags: [karpenter, kubernetes, proxmox, autoscaling]
types: ["build"]
topics: ["Karpenter", "Kubernetes", "Proxmox"]
---

Karpenter provisions nodes by matching what the pods actually request against the cheapest node it can build across all NodePools, every reconcile cycle. I run a handful of NodePools at different vCPU:memory ratios, so most pods land on a near-optimal node.

## NodePools

| pool | vCPU:memory | caps | weight | consolidate | expireAfter |
|---|---|---|---|---|---|
| `standard-pool` | 1:4 | 16 vCPU / 64gi | 50 | 10m | 720h |
| `memory-pool` | 1:8 | 8 vCPU / 64gi | 30 | 15m | 720h |
| `compute-pool` | 1:2 | 16 vCPU / 32gi | 20 | 5m | 168h |

`compute-pool` consolidates aggressively at 5m because CI runners and ad-hoc batch jobs land there. Builds burst, finish fast, then tear down, so anything longer leaves nodes paid for and idle between runs. `expireAfter: 168h` (one week) keeps OS patches landing through re-provisioning instead of in-place upgrades.

`standard-pool` and `memory-pool` get 720h (30 days) because those workloads are steady-state, and a weekly forced reschedule would churn the stateful apps.

## Provider

The provider is `sergelogvinov/karpenter-provider-proxmox`, and it's alpha and single-maintainer. The Proxmox interface is small: clone a VM template, wait for it to register, drain and `qm destroy` on removal. If the provider stops, I rebuild on Cluster Autoscaler over a weekend, and the blast radius stays inside the autoscaling layer.

## Taint pattern

The taint is what makes it safe to run alpha software in the provisioning path. Every node Karpenter provisions carries:

```
homelab.example.com/karpenter=true:NoSchedule
```

Workloads that want an autoscaled node have to tolerate it explicitly. That keeps DaemonSets, Flux controllers, MetalLB, Cilium, and anything always-on off the transient nodes. If Karpenter starts thrashing, only the transient pool takes the hit.

## Drain

Drain behavior is stock. Karpenter cordons, drains, waits for evictions, honors PDBs, then runs `qm shutdown` and `qm destroy` on the Proxmox side. If a pod hangs the drain, it's almost always a PDB violation or a stuck finalizer, and the node won't be removed. Investigate the pod, don't delete the node by hand: Karpenter's model assumes the node leaves cleanly.

## Disruption budgets bug

For the first month the `disruption.budgets` on the NodePools were too generous. Karpenter would consolidate across all three pools at once, drain three nodes in parallel, and a StatefulSet with maxUnavailable=1 would block on the second pod and stall the whole consolidation. Per-NodePool budgets fixed it.

Full ADR with the provider risk analysis: [saltstice-homelab/docs/adrs/karpenter-on-proxmox.md](https://github.com/PjSalty/saltstice-homelab/blob/main/docs/adrs/karpenter-on-proxmox.md).
