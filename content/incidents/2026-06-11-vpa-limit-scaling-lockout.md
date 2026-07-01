---
title: "VPA ratio scaling pushed a CPU limit past the namespace quota"
date: 2026-06-11
summary: "VPA preserved a 1:50 request:limit ratio, recommended a 25 CPU limit, and the namespace quota rejected it. Pod unschedulable until controlledValues: RequestsOnly"
tags: [postmortem, kubernetes, vpa, autoscaling]
types: ["incident"]
topics: ["Kubernetes", "Observability"]
---

The media watcher Deployment sat at desired 1, ready 0, and the ReplicaSet could not create the pod:

```
Error creating: pods "media-drop-watcher-..." is forbidden:
exceeded quota: media-quota, requested: limits.cpu=25,
used: limits.cpu=2, limited: limits.cpu=16
```

The error says quota, so my first move was to go bump the quota, but then I actually read the number. VPA wanted a 25 CPU limit for a file watcher, on a node with 16 cores total. Raising `media-quota` to fit that would have meant letting one watcher claim more CPU than the whole node has. The quota was doing its job but the 25 was the bug, and it took me a while to stop blaming the quota and start asking where 25 came from.

## Root cause

Every workload here runs under a VerticalPodAutoscaler in Auto mode, with `minAllowed` and `maxAllowed` caps per container. The watcher pod spec asked for a 10m CPU request and a 500m limit, a 1:50 request:limit ratio.

VPA defaults to `controlledValues: RequestsAndLimits`. In that mode it scales the limit along with the request and preserves the ratio from the original pod spec.

The watcher picked up a heavy scanning feature, so VPA recommended more CPU. The recommendation hit the `maxAllowed` cap of 500m, and then the ratio math ran: 500m request times 50 is a 25 CPU limit. The namespace ResourceQuota caps `limits.cpu` at 16, so admission rejected the pod. A VPA-evicted pod does not come back once admission says no, so the workload stayed down until I noticed.

That last part is the issue. `maxAllowed` caps the request, but it does not cap the limit VPA writes. The caps fence the request only, and I had assumed they fenced both.

## Fix

```yaml
resourcePolicy:
  containerPolicies:
    - containerName: watcher
      controlledValues: RequestsOnly
      minAllowed:
        cpu: 10m
      maxAllowed:
        cpu: 500m
```

`RequestsOnly` makes VPA manage requests and leave limits exactly as the pod spec wrote them. The limit stays 500m and the quota passes, and the request still floats on real usage.

Audit the request:limit ratio on anything VPA touches in `RequestsAndLimits` mode. A skinny request with a generous limit becomes a multiplier the moment VPA recommends against the cap. New VPAs here now default to `RequestsOnly`.
