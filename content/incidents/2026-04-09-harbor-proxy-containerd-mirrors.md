---
title: "Routing image pulls through Harbor proxy with containerd mirrors"
date: 2026-04-09
summary: "Routing all upstream image pulls through Harbor proxy projects with containerd mirrors"
tags: [postmortem, harbor, kubernetes, helm, registry, containerd]
types: ["incident"]
topics: ["Harbor", "Kubernetes"]
---

Docker Hub has rate-limits. Over half a dozen HelmReleases failed to pull during a Renovate update batch. Anything with `imagePullPolicy: Always` started crashing within the hour as cached images aged out.

Short-term fix was a Harbor admin login and a manual `docker pull` / `docker push` of the failed images. The cluster came back, but Docker Hub rate-limiting still needed a permanent.

The plan: route every upstream pull through Harbor's proxy projects. First pull hits upstream, the rest come from Harbor's cached copy where rate limits don't apply.

## Attempt 1: Helm-side image.registry

Set `image.registry: harbor.example.com/dockerhub-proxy` on every HelmRelease pulling from Docker Hub. This produced a double-prefixed image-ref incident in five minutes. `image.repository` already had a registry baked in, so prepending "proxy/" gave garbage like `harbor.example.com/dockerhub-proxy/quay.io/jetstack/trust-manager`. Reverted.

## Attempt 2: per-chart jsonpatches

A postrenderer per broken chart that rewrites `image.repository` to the proxied path, this worked for a handful of charts. The maintenance shape was bad: every chart upgrade risked breaking my patches if upstream refactored their values.yaml. Three weeks in I had patches for 14 charts and was burning time debugging Renovate PRs against them.

## Attempt 3: registry-rewriting admission webhook

A ValidatingAdmissionPolicy that rewrites every `image:` field in pod specs to route through Harbor. Same maintenance shape as attempt 2: someone maintains the rewrite rules, and the rules have to know about every upstream registry.

## Attempt 4: containerd mirrors

On every node, in `/etc/rancher/rke2/registries.yaml`:

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
  mcr.microsoft.com:
    endpoint:
      - "https://harbor.example.com/v2/mcr-proxy"

configs:
  "harbor.example.com":
    auth:
      username: "robot$<pull-account>"
      password: <sops-encrypted-in-private-repo>
    tls:
      insecure_skip_verify: false
```

I deployed via the Semaphore template that wraps the `harbor-runtime-mirrors` Ansible role. RKE2 picks it up on next agent restart, and charts can write `image: docker.io/library/postgres:16` and containerd fetches from the proxy, with no per-chart patches. The existing HelmRelease overrides were reverted and Renovate stopped fighting the patches.

## Why this layer

I didn't start with containerd mirrors because I'd convinced myself the Kubernetes layer was the right place for cluster policy. Helm has no contract for how charts construct image refs, so image-pull routing has to sit lower.

The container runtime sees every pull. One config file per node, one set of rules, and touching every node.
