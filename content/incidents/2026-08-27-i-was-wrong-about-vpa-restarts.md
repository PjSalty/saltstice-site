---
title: "I blamed VPA for Kyverno restarts and I was wrong"
date: 2026-08-27
summary: "I claimed in-place resize restarts containers and bypasses the PDB. A live check showed neither. The restarts were crashes, and the real risk was five fail-closed webhooks on single replicas."
tags: [postmortem, vpa, kyverno, kubernetes, webhooks]
types: ["incident"]
topics: ["Kubernetes", "Observability"]
slug: 2026-08-27-i-was-wrong-about-vpa-restarts
---

On 2026-08-22 I asserted a failure mechanism. On 2026-08-27 I re-checked it against live state and it was wrong. I'm keeping the wrong version visible, because the way it was wrong is the useful part.

## What I claimed

**"In-place resize restarts the container."** False. `resizePolicy` is unset on every Kyverno container, so it defaults to no restart, and the kubelet changes cgroup limits in place. I proved it live: `traefik-dmz` was resized in place twice on 2026-08-27 and both pods still show `restartCount 0` at three days old.

**"The PDB never applies."** False. VPA 1.7 only bypasses disruption budgets with `--in-place-skip-disruption-budget`, and it isn't set on this updater. The updater says so itself: `replica count below minimum while in-place-skip-disruption-budget is disabled`.

**"The webhook is fail-closed and a 502 broke Flux."** True, but not VPA's doing.

## The mistake

I saw a high restart count on a pod with a VPA that could evict, and I inferred causation. But eviction deletes a pod, and the replacement gets a new name with `restartCount 0`. A count that climbs on a pod whose name doesn't change can't be eviction. The counts I read (admission 17 to 21, cleanup 21 to 61) sat on stable pod names with `last_terminated_reason="Error"`. Those were crashes. One command would have killed the theory.

The VPAs were inert anyway. The admission controller's `minAllowed` clamps the target above the uncapped recommendation, so the updater logs `resource diff too low` every cycle. The one-replica components hit `Too few replicas`. Over 72 hours of updater logs: 2 in-place updates cluster-wide, both on Traefik, and zero evictions.

## The real finding

Five fail-closed admission webhooks run as single-replica Deployments with no PDB:

| Webhook | Failure policy | Blocks when down |
|---|---|---|
| cert-manager | Fail, 30s | all Certificate, Issuer and CertificateRequest writes |
| external-secrets | Fail, 5s | all ExternalSecret and SecretStore writes |
| metallb-controller | Fail, 10s | IPAddressPool and BGP resource writes |
| trust-manager | Fail, 5s | all Bundle writes |
| kyverno-cleanup-controller | Fail, 10s | CleanupPolicy writes |

A node drain, an RKE2 upgrade, a Karpenter reclaim or an OOM moves one of those pods, and the API server rejects every matching request until it's back.

Here's the trap. The only thing keeping the VPA updater off those five is its default `--min-replicas=2`. Scaling one to 2 replicas as an HA improvement arms the updater to evict it. Replicas, PDB and VPA settings have to land in one change.

## What not to do

- Don't set `updateMode` to Initial, Off or Recreate. `InPlaceOrRecreate` is GA since VPA 1.6.0 and exists to avoid eviction. Recreate always evicts.
- Never add `--in-place-skip-disruption-budget` to the updater. That flag would make my original claim true.
- A PDB with `minAvailable: 1` on a one-replica Deployment allows zero disruptions and blocks drains. Alone it's a partial trap too.

## Still open

I never found what crashed the old Kyverno pods before the 2026-08-23 rollout. It stopped on its own and I haven't confirmed why, so it can come back. There are also no `vpa_*` series in Prometheus, so nothing would have told me about evictions or in-place updates either way.
