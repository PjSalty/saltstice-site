---
title: "Cilium evaluates egress policy before kube-proxy DNAT"
date: 2026-04-09
summary: "The :6443 rule didn't match because the policy engine saw :443. Three outages before I traced it to kube-proxy DNAT firing later."
tags: [postmortem, kubernetes, cilium, networking]
types: ["incident"]
topics: ["Cilium", "Networking"]
---

A pod connects to `kubernetes.default.svc.cluster.local`, which resolves to the
ClusterIP `10.43.0.1:443`. My egress rule allows `:6443`, where the API server
actually listens but I was running into an issue where Cilium was dropping the packet.

Policy evaluation happens at packet egress. The destination port at that moment
is the ClusterIP port `:443`. kube-proxy DNAT rewrites it to the node port
`:6443` later, after the policy had already evaluated the traffic. Cilium sees `:443`
while the rule says `:6443`, so nothing matches and the packet drops.

It took three outages to trace.

First outage, I "fixed" an unrelated policy. Drained the namespace and restarted
Flux.

Second outage, same symptom in a different namespace. I added a rule for
`toEntities: kube-apiserver` with port 6443. Still dropping. I spent time digging into Cilium's policy cache as it was stale before I ran `cilium policy trace` from
inside the failing pod, the trace was right there: `DENY :443`.

## Fix

Allow both ports.

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
```

Third outage, five minutes later. I rolled the policy out without bouncing the
affected pods, so the new rule didn't apply to already-open connections. I
bounced the pods and traffic flowed.

The "destination port = service port" model is wrong for in-cluster ClusterIP
traffic, since the policy decision happens before DNAT fires. Calico and Weave
evaluate at egress the same way.
