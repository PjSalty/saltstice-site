---
title: "Helm image.registry override caused ImagePullBackOff, fixed in containerd"
date: 2026-04-09
summary: "Set image.registry on every HelmRelease and got ImagePullBackOff from double-prefixed refs. Fixed it in containerd instead."
tags: [postmortem, helm, kubernetes, registry, containerd]
types: ["incident"]
topics: ["Flux", "Kubernetes"]
---

I set `image.registry: harbor.example.com/dockerhub-proxy` on a batch of
HelmReleases to route every container pull through Harbor's proxy projects.
Flux reconciled the lot and eighteen pods went ImagePullBackOff in under a
minute.

`kubectl describe pod` showed it right away:

```
harbor.example.com/dockerhub-proxy/quay.io/jetstack/trust-manager
```

Double-prefixed. The trust-manager chart already had `image.repository:
quay.io/jetstack/trust-manager` with the registry baked in, so prepending my
proxy just produced garbage.

What threw me was cert-manager, the next chart over. Same override there
worked fine, because it splits registry and repository cleanly. Charts have no standard, some put the bare
image name in `image.repository`, some stuff the whole `registry/path/image`
in there, some split it out with a separate `image.repo` sub-key.

## Root cause

Helm has no contract for how a chart builds its image ref, so anything I do at the `image.registry` or
`image.repository` level only works for the charts that happen to split the
fields the way I expect. The moment a chart bakes the registry into
`image.repository`, my prefix double-stacks and the pull fails.

## Fix

Move the registry rewriting into containerd, which sees every pull regardless of
how the manifest got built.

`/etc/rancher/rke2/registries.yaml` on every node:

```yaml
mirrors:
  docker.io:
    endpoint:
      - "https://harbor.example.com/v2/dockerhub-proxy"
  ghcr.io:
    endpoint:
      - "https://harbor.example.com/v2/ghcr-proxy"
  quay.io:
    endpoint:
      - "https://harbor.example.com/v2/quay-proxy"
```

Charts can write whatever image string they want and containerd fetches from Harbor. No manifest changes and no per-chart overrides.
