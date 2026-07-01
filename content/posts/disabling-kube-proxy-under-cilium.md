---
title: "Disabling kube-proxy under Cilium on RKE2"
date: 2026-06-22
summary: "RKE2 kept kube-proxy running under Cilium's replacement. Both programmed service NAT, and one node would break on restart."
tags: [kubernetes, cilium, rke2, networking]
types: ["runbook"]
topics: ["Cilium", "Kubernetes"]
---

I run Cilium's kube-proxy replacement on the cluster, and it programs service NAT, ClusterIP to pod, in eBPF maps. RKE2 ships kube-proxy enabled by default, and turning on Cilium's replacement doesn't turn RKE2's kube-proxy off. So both ran. kube-proxy kept writing its iptables NAT while Cilium held the eBPF maps. In steady state Cilium wins.

## What broke

On a node restart, kube-proxy reinstalls its iptables NAT. After that, which datapath owns that node's ClusterIP path is undefined. Sometimes kube-proxy's rules shadowed the eBPF path on a node, and that node's ClusterIP traffic went nowhere.

The symptom was one node quietly going bad: apps scheduled there couldn't reach services. The rest of the cluster was fine, with no error in any obvious log. Cordon, drain, and recycle the pods cleared it, but then it came back on a different node a week or two later.

## The fix

I set `disable-kube-proxy=true` in the RKE2 server config.

## Server-only flag

`disable-kube-proxy` is a server-only flag in RKE2. Set it on an agent and RKE2 logs this, then keeps running kube-proxy:

```
Unknown flag --disable-kube-proxy, skipping
```

So the config template gates the flag to the server group only.

RKE2 runs kube-proxy as a static pod from `/var/lib/rancher/rke2/agent/pod-manifests/kube-proxy.yaml`. With the flag set on servers, RKE2 stops generating that manifest.

## After

No kube-proxy static pod on any node, verified, and eBPF is the only thing programming service NAT now. The single-node degradation stopped.
