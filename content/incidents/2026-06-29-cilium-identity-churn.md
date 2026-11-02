---
title: "Identity churn took the cluster down, and the CNI looked fine"
date: 2026-06-29
summary: "Pod creation stopped cluster-wide. Kyverno's fail-closed webhook was the wall, but Cilium quietly churning security identities was the hand that pushed it, and cilium status read OK the whole time."
tags: [postmortem, cilium, kubernetes, kyverno, networking]
types: ["incident"]
slug: 2026-06-29-cilium-identity-churn
---

I went to scan a media folder and the throwaway pod wouldn't start. The
error had nothing to do with media:

```
failed calling webhook "mutate.kyverno.svc-fail":
no endpoints available for service "kyverno-svc"
```

Kyverno's admission webhook is fail-closed. With zero ready endpoints
the API server refuses every pod creation the webhook covers, which is
most of the cluster. So this wasn't a media problem, it was a cluster
problem wearing a media problem's clothes.

## The symptom that lies

Kyverno was crashlooping, 21 restarts on one controller, and its logs
said it couldn't reach the Kubernetes API:

```
dial tcp <api-clusterip>:443: i/o timeout ... configmap informer cache failed to sync
```

The nodes weren't starved (CPU ~40%, memory ~50%). The apiserver was
healthy. cert-manager was separately logging `dial udp <dns-clusterip>:53:
operation not permitted`, so DNS ClusterIP was dropping too. Pods could
not reach ClusterIPs (the API on `<api-clusterip>`, DNS on `<dns-clusterip>`) on
specific nodes, while the CNI insisted everything was fine.

`cilium status` on those nodes: `Ok`, 6/6 reachable, all controllers
healthy, DaemonSet zero restarts. That is the trap. The Cilium agent's
health is about the agent process and node-to-node reachability, not
about whether pod identities are resolving correctly. The failure lives
a layer above what the health check looks at, so it is silent by
construction.

## What a Cilium identity actually is

Cilium doesn't write policy against IPs, they're ephemeral. It hashes
each pod's security-relevant labels (pod labels plus the namespace
labels it tracks) into a numeric security identity, stored as a
CiliumIdentity object. Every pod with the same label set shares one
identity. Policy is enforced by identity number in the eBPF maps on
every node: "identity 1234 may talk to 5678." The identity is the unit
of policy. If it's wrong, or if it keeps changing, policy is wrong or
keeps changing.

The agent logs were a wall of exactly that:

```
Identity of endpoint changed ... new-identity=26916 old-identity=25400
```

Same pods, brand new identity numbers, over and over: traefik, kyverno,
karpenter, vpa, all of them flipping. I counted the objects: 330
CiliumIdentities for 120 endpoints, eight of them created in the last 66
seconds. That is not a steady state, that is churn.

## Duplication and churn

Cilium can let each node's agent allocate identities independently. When
two agents see a pod with the same new label set at the same instant
they race to create the CiliumIdentity, and you get two identities for
one label set. Duplication. 330 for 120 is duplication.

Churn is the consequence. A pod's identity keeps getting reassigned
between the duplicates, or garbage-collected and re-created. Every
reassignment forces Cilium to re-resolve the identity and reload that
endpoint's eBPF program, and during the reload the endpoint sits in
`waiting-for-identity` with policy not fully applied, so it briefly
drops to default-deny. For a few hundred milliseconds it can't reach the
API or DNS ClusterIP.

Most workloads retry past a blip that short and you never notice.
Kyverno's liveness probe is tight, so it tripped, restarted, and
crashlooped. Its webhook being fail-closed turned that flap into the
whole cluster being unable to create pods. The CNI churn was the root,
Kyverno was the amplifier, the blocked webhook was the part a human saw.

## The fix, which is two fixes

The root is the churn. Cilium has an operator-managed identity mode
(beta) where the operator is the single producer of identities and the
agents become consumers, so the allocation race that causes duplication
can't happen. That's the actual fix. It's a live datapath change and a
two-phase migration (run both modes at once, then cut the agents over),
so it merges with eyes on the cluster, not on a Friday.

The second problem is independent and predates this incident: a
fail-closed admission webhook that gates all pod creation, including
kube-system and flux-system, is a single point of failure. The existing
namespace exclusions were evaluated inside Kyverno, after the webhook
call, so a down Kyverno still failed the call closed for everything.
Excluding the control-plane namespaces at the webhook level, so the API
server never calls Kyverno for them, means the cluster can always
recover even with the policy controller down. That, plus hard
anti-affinity on the admission replicas and a less trigger-happy
liveness probe.

Stop-the-bleeding, for the record: delete the crashlooping Kyverno pods.
They rescheduled onto a node whose datapath was healthy, came up, the
webhook got endpoints back, pod creation resumed. Do not restart the
Cilium DaemonSet to fix this, you will just walk every node through the
same gap at once.

## What I changed after

`cilium status` read OK while pods couldn't reach ClusterIPs, so the alerts now key off the symptom instead of the component: CiliumIdentity count far above CiliumEndpoint count, a webhook Service with zero endpoints, and FailedCreate events that name a webhook.

A fail-closed webhook has the blast radius of the API server, so it gets treated like one. The control plane shouldn't depend on a policy controller staying up, least of all for its own recovery.

The agent was healthy and the identities weren't. When the obvious component is green and the symptoms are real, look one layer down.
