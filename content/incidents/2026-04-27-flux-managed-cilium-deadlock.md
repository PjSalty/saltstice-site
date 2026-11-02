---
title: "Moving Cilium under Flux deadlocked the cluster"
date: 2026-04-27
summary: "Moving RKE2's bundled Cilium onto a Flux HelmRelease deadlocks the cluster. source-controller can't fetch the chart without the pod network Cilium provides, and cleanupOnFail deletes the half-applied release mid-cutover. That leaves a window with no CNI and nothing able to schedule the fix."
tags: [postmortem, cilium, kubernetes, flux, networking]
types: ["incident"]
slug: 2026-04-27-flux-managed-cilium-deadlock
---

The rollback plan was the outage. I wanted Cilium off RKE2's bundled
chart and onto a Flux HelmRelease, staged the manifests, resumed the
release, and watched Flux's source-controller sit there unable to fetch
`cilium-1.19.x.tgz` from `helm.cilium.io`. source-controller runs on the
pod network. The pod network is the thing Cilium provides. The moment
the old release went away, the controller that was supposed to install
the new one lost its own networking, and there was nothing left that
could schedule a fix.

## Why I was touching the CNI at all

RKE2 ships Cilium through a `HelmChartConfig/rke2-cilium` (Cilium 1.18.x,
bundled with RKE2 v1.34.3). That chart hardcodes `brief=true` and
`require-k8s-connectivity=false` in the agent's liveness probe template,
and neither header is exposed as a Helm value. So kubelet's liveness
check on the Cilium agent answers "is the process alive?" instead of "is
the agent forwarding?"

That gap is not academic. worker-2 spent 2 days 17 hours forwarding
nothing while its liveness probe stayed green, 2026-04-25 to 2026-04-27,
and the only signal was CI jobs flaking with `no endpoints available for
service kyverno-svc`. To make the probe strict you have to own the
rendered DaemonSet, which the RKE2-managed surface doesn't let you do.

So the plan: a Flux HelmRelease pinning the upstream `cilium` chart,
adopting the existing `rke2-cilium` release, plus a postRender Kustomize
patch on the `cilium` DaemonSet to flip those two headers to
`brief=false` / `require-k8s-connectivity=true`. On paper, clean. Own
the values, own the probe.

## Why it deadlocks

Flux installs a chart in two steps that both assume a working cluster
network:

1. source-controller fetches the chart artifact from the HelmRepository
   and stores it locally.
2. helm-controller runs install or upgrade against that artifact.

Both controllers are pods. Pods reach `helm.cilium.io`, and reach the
API server ClusterIP, over the very datapath Cilium sets up. As long as
the incumbent Cilium release is healthy, that's fine. The problem is the
cutover. You pull the incumbent on purpose so the new one can take over,
and for the length of that gap source-controller can't fetch the chart
it needs to close the gap. Chicken, meet egg.

It gets worse because of one line I'd copied in as a "sensible default":

```yaml
upgrade:
  cleanupOnFail: true
```

When the upgrade stalled, Helm did exactly what it was told: it cleaned
up the partial release. That deletes the half-applied Cilium objects
instead of leaving them wedged. The result isn't a stuck upgrade you can
poke at later. It's a cluster with no CNI agent at all, and no scheduler
path to bring one back until RKE2's bundled Cilium gets re-enabled by
hand. `cleanupOnFail` turned a recoverable stall into an active teardown.

Two minutes from a site-wide outage, I backed out.

## The recovery, and the one that makes it worse

Rolling this back is dull, which is the point. Re-enable RKE2's bundled
Cilium, drop the `disable: rke2-cilium` line from each master's config,
restart `rke2-server` one master at a time, and the incumbent release is
back.

For the underlying degraded-agent problem, the recovery is deliberately
small:

```sh
# cordon so nothing new lands on the bad node
kubectl cordon <node>

# drain the non-DaemonSet pods onto healthy nodes
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data \
  --grace-period=60 --timeout=300s

# delete the single bad cilium pod. the DaemonSet recreates it.
kubectl delete pod -n kube-system <cilium-pod-name>

# wait for the mesh to converge, then uncordon
kubectl uncordon <node>
```

Note what this is not: a rolling restart of the `cilium` DaemonSet. That
looks like the tidy fix and it's the trap. A DaemonSet restart walks
every node through the no-datapath gap, one after another, so instead of
one degraded node you get the whole cluster taking turns being broken.
Delete the one pod on the one bad node. The blast radius stays one node.
Cordon-to-converged ran about 10 minutes on 2026-04-27.

## What it would actually take to do this safely

The migration isn't wrong, the sequencing is. source-controller has a
local artifact store. If the chart is already in that store before the
cutover starts, step 1 doesn't need the network during the gap. So the
prerequisite for revisiting this is pre-caching the chart artifact in a
way that doesn't touch cluster pod networking: an OCI ref proxied
through Harbor's helm proxy, warmed into source-controller before you
remove the incumbent. Until that's in place, a live CNI cutover under
Flux is a bet that the network stays up while you take the network down.

The probe fix, meanwhile, didn't need any of this. What actually shipped
from 2026-04-27 was the observability half: a Prometheus rule that keys
off the symptom instead of the agent process, so a silently-degraded
node pages within about 5 minutes of the mesh going partial, with the
cordon-drain-delete runbook attached. That is the real win. The green
liveness probe was never going to save us, so the alert stopped trusting
it.

## What I'd do differently

Anything in the recovery path for the CNI has a bootstrap dependency on the CNI already working. That includes the GitOps controller you'd use to reinstall it. Treat a CNI cutover like editing the config of the SSH daemon you're connected through: stage an out-of-band way back in first, or don't start.

Don't leave `cleanupOnFail: true` on tier-zero releases. For an app it saves you from a wedged release. For the CNI it turns "the upgrade didn't finish" into "the old one is gone too". I want the failed state left alone so I can look at it.

And don't restart the whole DaemonSet when one node's datapath is bad. Bounce the one pod. A DaemonSet restart gives every node the outage at once.
