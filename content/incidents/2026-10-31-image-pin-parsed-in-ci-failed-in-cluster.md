---
title: "An image pin passed CI and broke the pod"
date: 2026-10-31
summary: "A script wrote sha256: twice into an image reference. CI only lints YAML, so the first parser was the kubelet, and Jellyfin was down for about half an hour."
tags: [postmortem, ci, flux, jellyfin, kubernetes]
types: ["incident"]
topics: ["Kubernetes", "Flux", "Operations"]
slug: 2026-10-31-image-pin-parsed-in-ci-failed-in-cluster
---

I merged a change that added fallback metadata plugins to Jellyfin. It wrote this pin into the image-versions ConfigMap:

```
IMAGE_JELLYFIN_PLUGINS: .../jellyfin-plugins:stable@sha256:sha256:537f1df5...
```

Two `sha256:` in a row isn't an image reference. The init container that installs the plugins stopped at `InvalidImageName` ("invalid reference format"), the single leader pod was replaced, and Jellyfin stayed down from about 21:57Z until a one-line fix went green at 22:28Z. Nothing was streaming, so no playback broke, but the whole server was dark.

## How the script got it wrong

It grepped `tools/jellyfin-plugins@sha256:<64 hex>` out of the promote job's log and kept everything after the `@`. The digest already began with `sha256:`, and the script then wrote `...:stable@sha256:` in front of it.

## Why CI missed it

The manifests repo's merge request pipelines lint YAML and check that each declared image has a registry entry. They don't check that a pin parses as an image reference. The scheduled canary HEADs the pins, but only on its schedule, which hadn't come around.

## What I changed

A script that writes an image pin now validates the reference before committing: `registry/path:tag@sha256:<64 hex>`, with exactly one `sha256:`. A CI check that every `IMAGE_*` value in the SSOT file parses is queued as its own change.

Also: an init container that copies into a single-replica leader is load-bearing for start-up. It should land together with a pin that has been pulled at least once.

When it broke I reported it and waited for a go-ahead before touching anything, then shipped the one-line fix.
