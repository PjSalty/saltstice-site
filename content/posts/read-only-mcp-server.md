---
title: "Read-only MCP server for the homelab"
date: 2026-06-12
summary: "One Go binary, 175 tools across 24 infrastructure APIs, no write paths. All writes stay in IaC."
tags: [mcp, golang, kubernetes, observability, security]
types: ["build"]
topics: ["Automation", "Observability"]
---

I built an MCP server for the homelab. It's one Go binary that exposes infrastructure state through read-only tools. 175 tools across 24 APIs: Proxmox, iDRAC, MikroTik, TrueNAS, Kubernetes, Flux, Cilium, cert-manager, Traefik, MetalLB, Kyverno, Velero, Prometheus, AlertManager, Loki, Tempo, Grafana, GitLab, Harbor, Authentik, and the app layer. It also exposes resources for the context that isn't a query: VLAN topology, VM inventory, aggregated health, current image versions.

My LLM agents kept needing current infrastructure state: pod status, BGP sessions, cert expiry, SMART data, pipeline results. The alternative was to hand the model a shell and kubectl, which gives it a write path to the cluster. This keeps the model read-only.

## Read-only by construction

The whole thing is built around one rule: tools read, every write goes through IaC. Changes flow through Terraform, Ansible, or Flux, where they get review and rollback. The MCP layer can't write, and I block it at three layers.

- No tool with a write path exists in the binary. The code doesn't contain one.
- The Kubernetes credentials are a ClusterRole with get, list, and watch only. Even if a write tool existed, the API server would refuse it.
- The upstream API accounts are scoped the same way. The MikroTik user has read and api policies only. The Proxmox and TrueNAS tokens are read-scoped.

Transport is Streamable HTTP behind the ingress with bearer-token auth. The token lives in SOPS, so rotation is one commit.

## Things that bit me

- Policy engines see pre-DNAT ports. The egress network policies for the server had to allow the container ports, not the Service ports. Same lesson as the [pre-DNAT incident]({{< relref "/incidents/2026-04-09-cilium-pre-dnat-policy.md" >}}), and it generalizes.
- iDRAC isn't reachable from the pod CIDR. It sits on the management VLAN, so a small socat proxy unit on the hypervisor bridges that one port. It's ugly but contained, and I documented it in the role.
- Flux postBuild substitution eats `${VAR}`. Any ConfigMap carrying a literal `${VAR}` for Go's `os.ExpandEnv` needs the `$$` doubling, or Flux substitutes it to an empty string first and you're left debugging that.
- The Go MCP SDK wants bare description text in the `jsonschema` struct tags. `description=text` silently becomes a tool with no description, and the client then uses it badly.

## In use

Debugging no longer starts with me sshing somewhere to paste output. State is queryable across every system at once. The blast radius of a bad query is load on an API server for an afternoon, and it can't change the cluster. The read/write split is an audit property too: anything that changed, changed through git.
