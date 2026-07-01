---
title: "All image and chart versions in one ConfigMap"
date: 2026-06-12
summary: "Every image and chart version in the cluster lives in a single SSOT ConfigMap. HelmReleases reference placeholders, Flux substitutes at reconcile time, Renovate bumps one file."
tags: [flux, renovate, gitops, kubernetes, versioning]
types: ["build"]
topics: ["Kubernetes", "Flux"]
---

A single `image-versions` ConfigMap holds every image and chart version in the cluster. Nothing else in git states a version directly.

Forty apps with image tags in their own HelmRelease values means forty places for a version to drift. Before I did this, two deployments of the same database image had already drifted onto different tags.

## The pattern

The ConfigMap holds every version as plain keys:

```yaml
data:
  VERSION_TRAEFIK: "3.x"
  VERSION_POSTGRES: "16.x"
  IMAGE_JELLYFIN_REPO: "jellyfin/jellyfin"
  IMAGE_JELLYFIN_TAG: "10.x"
```

HelmReleases and Deployments reference placeholders instead of literal versions:

```yaml
image:
  repository: ${IMAGE_JELLYFIN_REPO}
  tag: ${IMAGE_JELLYFIN_TAG}
```

Flux resolves the placeholders from the ConfigMap at reconcile time with `postBuild.substituteFrom`. The manifests in git carry no versions, the ConfigMap is the source of truth, and "what version is X running" has one answer and one `git blame`.

## Renovate drives the one file

Renovate won't parse a bare `VERSION_TRAEFIK: "3.2.1"` line on its own, so custom regex managers handle it. Each key gets an annotation comment naming the datasource and the package. Renovate opens one MR per bump against the single ConfigMap, the diff is a single line, and every consumer of that version rolls forward on merge.

## The fine print

- **Escape what Flux shouldn't touch.** postBuild substitution eats every `${VAR}` it sees. Anything that needs a literal `${VAR}` at runtime, like shell in a CronJob or a Go template, has to be written `$${VAR}`. Forget it and Flux substitutes an empty string, and the failure surfaces far from the cause.
- **Split repo and tag for charts that need it.** Some charts take a single image string, others want registry, repository, and tag as separate values. The ConfigMap keeps the `_REPO` and `_TAG` keys separate so both shapes compose. A chart upgrade once flipped which shape it wanted, and the split absorbed it with a values edit.
- **CI images are pinned to digests.** The ConfigMap pattern doesn't apply to pipeline images, because CI doesn't go through Flux. Those are pinned to sha256 digests in the templates, and Renovate bumps the digests.

A bad bump rolls back with one revert, and auditing what's running is one file read. After an incident, I can answer "did the version change" from the ConfigMap history alone.
