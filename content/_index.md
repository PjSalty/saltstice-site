---
title: Salty
description: Platform engineer. Notes on running a production homelab as code.
featured:
  - /incidents/2026-04-17-full-site-power-loss
  - /posts/disabling-kube-proxy-under-cilium
  - /posts/credential-rotation-as-a-pipeline
  - /posts/split-horizon-dns-for-a-homelab
  - /posts/backups-with-zero-recurring-spend
  - /posts/shipping-a-terraform-provider
---

Platform engineer. I run a homelab on one used Dell R740xd: Proxmox, an RKE2 cluster with autoscaled CI nodes, Cilium, Flux, Terraform, Ansible, SOPS, Velero and TrueNAS. All of it as code.

The [writing](/writing/) is builds, runbooks and postmortems. The [lab](/lab/) page is the hardware and stack, and [telemetry](/telemetry/) links to its live state. The repo is [saltstice-homelab](https://github.com/PjSalty/saltstice-homelab), and there's a [TrueNAS Terraform provider](https://registry.terraform.io/providers/PjSalty/truenas/latest) on the registry.
