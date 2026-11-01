---
title: "Harbor had lost five months of images"
date: 2026-09-07
summary: "A pod went ImagePullBackOff on a tag the pipeline had verified two days earlier. The registry's newest push was from April, and node caches had hidden it."
tags: [postmortem, harbor, registry, kubernetes]
types: ["incident"]
topics: ["Kubernetes", "Harbor"]
slug: 2026-09-07-harbor-lost-five-months-of-images
---

A routine Renovate merge bumped the media tooling image. The pod went `ImagePullBackOff` with containerd reporting `NotFound`, although the build pipeline had pushed and verified that exact tag and digest two days earlier.

## What the database said

Harbor's own database is the proof. A select over repository, artifact and tag for that image returned 51 tags, and the newest push, apart from the same day's sha tag, was 2026-04-26. On disk the registry directory (27 GB, the only registry path) held version tags only up to v1.5.52.

Retrying the promote job failed too, because the `sha-` tag it copies from was gone. I compared every private pin in the image-versions ConfigMap against the database. Four of six were missing, including the Jellyfin fork and the Postgres plugin.

## Why nothing was down

Node image caches. Jellyfin was running only because two workers still had the image on disk. A reschedule would have failed.

Running pods prove nothing about what's in a registry. A tagged image with the default pull policy is served from the node's cache without contacting the registry at all.

## Probable cause

The registry container was recreated on 2026-09-06 during certificate work, which was itself "certificate written to a path the container doesn't mount". I can't prove the recreate lost the data. It's the best fit for a registry that was fine in April and empty of anything newer.

Two of the four missing images repaired themselves, only because an unrelated merge auto-tagged a fresh build that pushed them again.

## The rule I use now

After any Harbor container recreate or upgrade, verify the registry from the database, not from running pods:

Join the tag, artifact and repository tables, sort by push time, and look at the newest push for each repository.

Compare every private pin in the SSOT against that output.

## The same month, same registry

Harbor got a few more of these in a row, and they share a shape:

- On 2026-08-28 an auto-merge chain upgraded Harbor 2.12.2 to 2.15.2. Core returned 500s, and because the CI runner pulls its helper images through Harbor, the repair path deadlocked.
- On 2026-09-23 Renovate's timestamp requirement and a 100-push retention policy aged out the first-party pins. Pins for my own images fell out of the retention window.
- On 2026-10-19 the registry's root disk filled.

Everything pulls from the registry, including the machinery that would repair it.
