---
title: "Routing cluster image pulls through Harbor with containerd mirrors"
date: 2026-06-12
summary: "Every image pull in the cluster routes through Harbor proxy-cache projects, configured in containerd on each node rather than per Helm chart."
tags: [containerd, harbor, kubernetes, helm, registry]
types: ["runbook"]
topics: ["Kubernetes", "Harbor"]
---

Every container pull in the cluster routes through Harbor proxy-cache projects, configured in containerd on each node. Docker Hub rate limits stop applying. An upstream registry outage degrades to cache hits instead of failed scheduling. Registry egress narrows to one point I can watch.

The rewrite can happen in two places: Helm values per chart, or containerd per node. I run it in containerd, and here's why per-chart didn't hold.

## Helm value overrides

The first thing I tried was setting `image.registry` (or `image.repository`, or `global.imageRegistry`, depending on the chart) on every HelmRelease. It breaks because charts don't agree on what those values mean.

Some charts put a bare image name in `image.repository` and join it with `image.registry`. Some bake the full `registry/path/image` string into `image.repository`. Some use a separate `image.repo` sub-key. Prepend the proxy to the wrong shape and you get refs like:

```
harbor.example.com/dockerhub-proxy/quay.io/jetstack/trust-manager
```

That gave me ImagePullBackOff on eighteen pods at once. The [postmortem]({{< relref "/incidents/2026-04-09-helm-image-registry-override.md" >}}) has the full timeline.

You can patch around each chart's quirks. I started to. But every chart upgrade can refactor values.yaml and break the override, and every new chart needs the same archaeology. Sub-chart images, init containers, and operator-deployed images never pass through values I control at all.

## containerd mirrors

containerd sees every pull, no matter who wrote the manifest. Configure it to mirror and the override problem goes away.

On RKE2 that's `/etc/rancher/rke2/registries.yaml` on every node:

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
  registry.k8s.io:
    endpoint:
      - "https://harbor.example.com/v2/k8s-proxy"
```

RKE2 renders that into containerd mirror config on agent restart. On vanilla containerd the same config lives in `/etc/containerd/certs.d/` as per-registry `hosts.toml` files.

Harbor side: one proxy-cache project per upstream registry, each pointing at its upstream. Pulls hit Harbor, Harbor fetches and caches on a miss, then serves from cache.

Manifests keep saying `docker.io/library/redis:7`. Charts keep writing whatever image strings they want. containerd fetches from Harbor behind the scenes, with no overrides anywhere.

## Operational notes

- Rollout is an Ansible role: write the file on every node and restart the agent, serial across nodes.
- If the mirror endpoint is down, containerd falls through to the upstream registry, so a Harbor outage degrades me to rate-limited direct pulls instead of broken scheduling.
- `kubectl describe pod` still shows the upstream ref, so to confirm pulls route through Harbor I check the project quotas and access logs. Climbing cache-hit counts confirm the route.
- Mirroring is ref-level, so pinned `image@sha256:...` refs resolve identically through the proxy.
