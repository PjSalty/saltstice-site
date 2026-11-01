---
title: "Trivy scanned none of the images I build"
date: 2026-08-22
summary: "The cluster scan job had no registry credentials, so it skipped every private image. Then the summary counted zero findings because jq wasn't in the image. Both reported success."
tags: [postmortem, trivy, security, kubernetes, harbor]
types: ["incident"]
topics: ["Security", "Kubernetes", "Observability"]
slug: 2026-08-22-trivy-scanned-no-private-images
---

The vulnerability scan in the cluster had been passing for months. It was passing because it never looked at the images that matter most.

I found it while working through the last ~20 alerts. Once a corrupted jsonpath was fixed, a full run finally completed, and the failures weren't random. Of 113 images, 6 failed, and all 6 were in the private registry. Every public image scanned clean. The six were the ones I build: the CLI, a media tool, the Jellyfin fork, the CI tooling image and two more.

## No credentials

Trivy pulls each image itself, and the scan job had no registry credentials. I proved it with a one-image A/B job in the cluster. With `DOCKER_CONFIG` set the pull returned rc 0. Without it:

```
UNAUTHORIZED: authentication required, action: pull
```

The fix mounts the pull secret that already existed in the namespace as a docker config. One catch: `DOCKER_CONFIG` names a directory, not a file. Pointing it at the file path fails the same way.

## A failure that looked like a hang

Before the fix, the run never seemed to finish. The script exits 1 if any single image fails, and the pod's `restartPolicy: OnFailure` then restarts the container, which scans all 113 from the top. I watched the counter hit `[102/113]`, exit, and come back at `[35/113]` with `restarts=5`. It wasn't an OOM kill. The exit code was 1.

I'd also written down that the gate only trips when zero images scan. That was wrong, and reading the script settled it: the per-image check sits above the zero-scan check.

After the fix the run finished in 3m12s, 114 of 114 scanned, 0 failed.

## The summary said zero

That run reported 0 critical, 0 high, 0 medium. I almost believed it. The counts were read with `jq`, and `jq` isn't in the Trivy image. Each read fell through to the `|| echo "0"` next to it, so the totals were the sum of nothing. The reports on disk from the same run held 307 critical, 6426 high and 9705 medium findings.

I replaced `jq` with `trivy convert --format template`, which renders its own report with one severity per line. I also added the gate that was missing: a counter that can't count has to exit non-zero, never print zero.

```sh
# grep -c prints 0 and exits 1 when nothing matches; set -e treats that as failure,
# so only its status gets discarded, never its output
crit=$(grep -c CRITICAL "$report" || true)
```

## The limits weren't in git either

Scan jobs were also getting OOM killed at a 500M default. `git grep trivy-operator-trivy-config` returned nothing: the operator creates that ConfigMap itself, so nothing in the repo described the limits the scan jobs ran under. I codified them at 2G.

Three layers were each reporting success. No credentials, a counter that couldn't count, and limits nobody had written down. Reading the script and the on-disk reports found all three, and the dashboard didn't.
