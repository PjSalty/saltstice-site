---
title: "Cilium egress rules and pre-DNAT policy evaluation"
date: 2026-05-05
summary: "Why Cilium egress policy evaluates at pre-DNAT, the ClusterIP vs node-IP ports for kube-apiserver, and a working baseline policy."
tags: [cilium, kubernetes, networking]
types: ["runbook"]
topics: ["Cilium", "Networking"]
---

Every CiliumNetworkPolicy bug I've debugged is the same one. The destination my app connects to is not the destination Cilium's policy engine evaluates. Obvious in hindsight, written down nowhere. I've ranked them by how much pain each one cost me.

## Policy evaluates at egress, before any in-cluster DNAT

A pod connects to a ClusterIP, and the destination Cilium sees is that ClusterIP's IP and port. Kube-proxy DNAT, or Cilium's eBPF replacement, fires after the policy check, so a kube-apiserver egress rule has to allow port **443** (the ClusterIP path) and port **6443** (the direct node-IP path). Allow both.

[Three outages in one session]({{< relref "/incidents/2026-04-09-cilium-pre-dnat-policy.md" >}}) because I assumed the policy engine saw the post-DNAT port. It doesn't.

Calico and Weave behave the same way. CNI policy engines run in the pod's network namespace at egress, where the ClusterIP is still the destination.

## `toEntities: kube-apiserver` matches only the direct path

The `kube-apiserver` entity matches the node IPs of the API server, but it does not match the Kubernetes service ClusterIP. If your egress goes to `kubernetes.default.svc.cluster.local`, you need a separate rule for the ClusterIP range and the service port (`:443`). The docs make it look like one rule covers both. It doesn't.

## Don't use `toCIDR: 0.0.0.0/0` as a workaround

`toCIDR: 0.0.0.0/0` punches through almost any policy bug. It also gives every pod egress to the entire internet, which is exactly what the policy exists to stop. Fix the actual rule.

## `toServices` is real, narrow when you need it

`toServices` targets a service by namespace and name, so you don't have to chase down the ClusterIP and port yourself. It covers the ClusterIP path, where `toEndpoints` matches pods. Handy when the upstream service has a stable name but its pods move.

## `cilium policy trace` from inside the failing pod

When something's blocked and you don't know why, `cilium-dbg policy trace` from the agent tells you which rule didn't match and why. The first time I used it I'd already burned an hour on the YAML. It's my first move now.

```bash
# from the cilium agent pod on the node hosting the failing app pod
cilium-dbg policy trace --src-k8s-namespace=$NS --src-k8s-pod=$POD \
  --dst-ip=10.43.0.1 --dport=443 --protocol=TCP
```

## A working baseline

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: allow-egress-to-kube-apiserver
spec:
  endpointSelector: {}
  egress:
    - toEntities: [kube-apiserver]
      toPorts:
        - ports:
            - { port: "6443", protocol: TCP }
            - { port: "443", protocol: TCP }
    - toEndpoints:
        - matchLabels:
            "k8s:io.kubernetes.pod.namespace": kube-system
            "k8s-app": kube-dns
      toPorts:
        - ports:
            - { port: "53", protocol: UDP }
            - { port: "53", protocol: TCP }
```

This is the floor every namespace gets before any app-specific rules. Without DNS allowed, every service-name lookup fails before the egress to the real service even starts.
