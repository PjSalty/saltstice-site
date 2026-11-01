---
title: "Every Ansible converge briefly broke the pod network"
date: 2026-09-20
summary: "Two roles owned the same sysctl with different values. One wrote it live, and Cilium's reconciler quietly put it back ten minutes later."
tags: [postmortem, ansible, cilium, sysctl, kubernetes]
types: ["incident"]
topics: ["Ansible", "Cilium", "Networking"]
slug: 2026-09-20-converge-broke-pod-network
---

Every full Ansible converge wrote strict reverse-path filtering onto all six Kubernetes nodes. Cilium needs it off. For months nobody noticed, because something else quietly undid it.

## The defect

`roles/common` applies its sysctl list with `sysctl_set: true`, so values take effect live. It owned `net.ipv4.conf.all.rp_filter: 1`. The k8s prerequisites role and Cilium require `0`. Cilium runs in native routing mode with host legacy routing on, so pod traffic crosses the kernel stack and strict RPF drops it.

## Why it stayed hidden

The prerequisites role doesn't repair it. In two job logs it reported `conf.all.rp_filter` as already `ok` and changed only `default.rp_filter`. What restores the value is Cilium's own sysctl reconciler, on a 10 minute refresh cycle. Each node healed itself 0 to 10 minutes later and no Ansible task showed the repair.

The daily cadence only started on 2026-09-08, when a new nightly backup schedule began triggering a full converge through a path my deploy-scope script didn't classify.

While it ran, 145 of 168 scrape targets were down, SYN retransmits hit about 44k per 30 minutes, and containers restarted 300 to 550 times an hour against a baseline near 15. It also explains Jellyfin's 114 restarts in 13 days and the Authentik autoscaler pinned at its maximum.

## The general trap

When two roles own the same key with different values and one applies it live, the node runs the wrong value for as long as the other takes to catch up. A `sysctl -n` assertion after the write can't catch it, because by the time it runs the reconciler has put the value back.

The fix asserts on the merged desired dict before anything is written. Values now come from `common_sysctl_overrides`, merged per group, and a small script in the lint job fails if two sources disagree.

## Checking that a converge is clean

Two queries, both green after the fix:

```promql
count(up == 0)
sum(increase(node_netstat_TcpExt_TCPSynRetrans{job="node-exporter"}[2m]))
```

The first stays near 2. It hit 114 to 148 during every earlier converge. The second stays under about 100. The `job=` selector is required, because other jobs have a noisy baseline.
