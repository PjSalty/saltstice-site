---
title: "Taking apps off the Kubernetes control plane nodes"
date: 2026-11-01
summary: "A NoSchedule taint instead of RKE2's NoExecute example, an Ansible play to apply it, and a Kyverno policy that keeps apps from landing there again."
tags: [kubernetes, rke2, kyverno, ansible, scheduling]
types: ["build"]
topics: ["Kubernetes", "Ansible", "Security"]
slug: control-plane-runs-no-apps
---

My three RKE2 server nodes were scheduling application pods. An app landed on a control plane node and I decided that shouldn't be possible. As of 12:48 AM CDT on 2026-11-01 it isn't: zero application pods run on the masters, and a policy stops new ones.

## Counting first

Before touching anything I measured what had to move. 38 pods, requesting 1904m CPU and 6.0 GiB of memory, with real use of 0.68 cores and 1.9 GiB. After the move the workers sit at 68% CPU requests and 94% memory requests (54.8 of 58.1 GiB), with about 3.3 GiB free. That costs some CI fallback room and the N+1 headroom, and I accepted both.

## NoSchedule, not NoExecute

RKE2's HA docs show this taint:

```
CriticalAddonsOnly=true:NoExecute
```

I used this instead:

```
node-role.kubernetes.io/control-plane:NoSchedule
```

`NoExecute` evicts everything that doesn't tolerate it immediately. Here that meant all 38 apps plus node-exporter, the MetalLB speaker, the canary, the Velero node agent, and Karpenter, whose nodeSelector would have left it Pending. And Velero 1.18 copies a `CriticalAddonsOnly` toleration onto every data-mover pod it creates, which would have put backup work back on the masters.

`NoSchedule` stops new placement and lets the drain during a rolling restart do the moving politely.

## RKE2 only applies taints at registration

The `node-taint` setting takes effect when a node registers, so editing config on running masters changes nothing. An Ansible play applies the taint to the registered Node objects, and the rolling upgrade play checks for drift on it. Rollback is moving the entry into `rke2_server_node_taints_absent`.

The window itself: the merge queued the RKE2 upgrade play, which tainted all three masters, then drained, re-rendered config, restarted and uncordoned them one at a time. Drains respected PDBs on the first try. Afterwards:

- `kube_node_spec_taint` was 1 on all three masters.
- 0 non-exempt pods were running or pending on them, down from 38.
- etcd had 3 of 3 members with a leader, 6 of 6 nodes were ready, and Flux showed 51 of 51 healthy.

## The guard

Kyverno 1.19 deprecates `ClusterPolicy` and 1.20 removes it, so the guard is a `ValidatingPolicy` (`policies.kyverno.io/v1`). It runs in Audit first, then Deny once the moves are done. It's still in Audit as I write this. The policy report went from pass 280 / fail 61 before the window to pass 297 / fail 0 after.

Details that bit:

- `failurePolicy: Ignore`, so the guard can't wedge the API.
- Autogen covers Deployments, StatefulSets, Jobs and CronJobs, not DaemonSets.
- Autogen rewrites `object.metadata` to the pod template's metadata. Jobs and CronJobs without it produced an error that `Ignore` silently swallowed, so the check was skipped. Writing `object.?metadata` fixed it.
- The nodeName check needs `get nodes` RBAC.

## The alert that wasn't deployed

I wrote a PrometheusRule for this and it merged, but it never reached the cluster. It was listed only in a sub-kustomization nothing reconciled. A second small change wired it in, and I confirmed it live: the rule group existed with two rules and no evaluation failures.

Merged is not deployed. I check the rule group in Prometheus.
