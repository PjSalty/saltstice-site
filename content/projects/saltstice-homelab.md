---
title: Saltstice homelab infrastructure repo
date: 2026-05-06
summary: The actual homelab. IaC, Kubernetes manifests, decision records, postmortems.
tags: [homelab, kubernetes, gitops, proxmox]
---

This is the working repo behind everything on this site. Terraform modules, Ansible roles, Flux-managed Kubernetes manifests, ADRs for why I picked each thing, and postmortems for when those choices broke.

The layout follows the vehagn, onedr0p, and bjw-s homelab repos.

## What's in it

- `apps/` per-app deployments: Jellyfin with HW accel and the LAN URL trick,
  Authentik with 14 OAuth2 apps wired via a Python blueprint, Postgres on
  iSCSI, Vaultwarden, Harbor with containerd-mirror proxy registries,
  Docmost.
- `infrastructure/` cluster-wide concerns: Cilium BGP MD5, Karpenter on
  Proxmox, Velero plus SeaweedFS, cert-manager with acme-dns delegation,
  Flux multi-source.
- `terraform/` Proxmox VM modules (cloud-init and GPU passthrough) plus the
  GitLab, Harbor, Cloudflare, Authentik, and TrueNAS provider configs.
- `ansible/` Debian hardening role bundle, inventory, playbooks, helper
  scripts, vendored collections.
- `incidents/` postmortems with timeline, RCA, and fix.
- `audits/` posture reviews (Feb 2026 infrastructure, Feb 2026 security
  hardening, Mar 2026 MikroTik firewall) with remediation tracking.
- `runbooks/` operational procedures: power-outage recovery, disaster
  recovery, credential rotation, certificate management, storage failure,
  node failure, network troubleshooting.
- `troubleshooting/` debugging guides by category: Flux, pod, pipeline,
  auth, network, storage.
- `monitoring/` and `observability/` Grafana dashboards, Prometheus rules,
  ServiceMonitor and PrometheusRule configs.
- `ci/templates/` reusable GitLab CI templates: lint, build, security
  scanning, Ansible runner, container image promotion.
- `docs/adrs/` decision records.
- `templates/` reference patterns: SOPS-encrypted Secret, ExternalSecret,
  HelmRelease, IngressRoute with forward-auth, VPA plus HPA, CiliumNetworkPolicy.

## Source

- GitHub: <https://github.com/PjSalty/saltstice-homelab>
- License: MIT
