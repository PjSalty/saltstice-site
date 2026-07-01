---
title: "Cilium datapath stopped forwarding on worker-2"
date: 2026-04-27
summary: "Cilium agent on one node forwarded nothing but kept passing liveness checks. CI flaking was the only signal"
tags: [postmortem, kubernetes, cilium, observability]
types: ["incident"]
topics: ["Cilium", "Observability"]
---

The first sign was CI flaking. Jobs that landed on `worker-2` failed with "no endpoints available for service kyverno-svc". Jobs on worker-1 or worker-3 passed. A queue of 23 internal jobs piled up.

`kubectl get pods -n kube-system | grep cilium` showed all three agents `Running 1/1` with green liveness probes. Nothing was crashing, so for a while nothing looked broken. That is what cost me the time.

I execed into the agent pod on worker-2 and ran `cilium status`. It returned a wall of "datapath errors" for endpoint regeneration. The agent process was alive and answering RPC, but it wasn't forwarding.

Then I made it worse. I tried a Flux-managed cutover to replace the Cilium HelmRelease with a known-good prior version. It failed badly. Chart fetch needs DNS, the DNS pods run on the cluster, and the cluster needs Cilium. `cleanupOnFail: true` nuked the partial release before it could roll back, and I was two minutes from a full outage.

## Root cause

Kubelet had no signal because the liveness probe only checks whether the process responds, not whether the datapath forwards. Cilium 1.x's liveness probe is hardcoded with `brief=true` and `require-k8s-connectivity=false`. Those flags aren't exposed as Helm values, so the probe can't be made strict. Process-exists is all you get, and the process was fine the whole time.

## Fix

```bash
kubectl cordon worker-2
kubectl drain worker-2 --ignore-daemonsets --delete-emptydir-data
kubectl delete pod -n kube-system <cilium-pod-on-worker-2>
kubectl uncordon worker-2
```

The DaemonSet recreated the agent fresh, and the datapath came back. CI cleared the backlog in ten minutes.

## Detection fix

Liveness can't be made strict, but Prometheus can watch the right signals:

```yaml
groups:
  - name: cilium-degradation
    rules:
      - alert: CiliumAgentDatapathErrors
        expr: rate(cilium_drop_count_total{reason!~"Stale or unroutable IP"}[5m]) > 1
        for: 5m

      - alert: CiliumEndpointRegenerationFailing
        expr: rate(cilium_endpoint_regeneration_total{outcome="fail"}[10m]) > 0
        for: 10m

      - alert: CiliumIdentityCacheStale
        expr: cilium_identity_cache_size == 0 and on(instance) up{job="cilium"} == 1
        for: 5m

      - alert: CiliumPolicyImportFailures
        expr: rate(cilium_policy_import_errors_total[10m]) > 0
        for: 5m

      - alert: CiliumAgentNoEndpoints
        expr: cilium_endpoint_count < 1 and on(instance) up{job="cilium"} == 1
        for: 5m

      - alert: CiliumBPFMapPressure
        expr: cilium_bpf_map_pressure > 0.8
        for: 10m
```

All six watch datapath outcomes: drops, endpoint regeneration failures, and policy import errors.

## Recovery path for the CNI

Flux and Cilium coexist fine until you need to replace Cilium. Then the GitOps controller can't pull charts, because chart pulls go through DNS, which goes through Cilium. Keep a non-Flux recovery path for the CNI: an Ansible playbook, a Semaphore template, or a script in a runbook.
