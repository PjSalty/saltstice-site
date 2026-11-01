---
title: About
summary: Who runs this, and what I'm working on now.
showReadingTime: false
aliases: ["/now/"]
---

I'm Matt, a platform engineer. I run a homelab on one Dell R740xd: {{< lab "vms_running" >}} VMs, a Kubernetes cluster of {{< lab "k8s_nodes" >}} static nodes plus autoscaled CI nodes, TrueNAS, a GPU, with all configurations defined in code.

The [writing](/writing/) is builds, runbooks, and postmortems. The repo is [saltstice-homelab](https://github.com/PjSalty/saltstice-homelab), and I maintain Terraform providers for [TrueNAS](https://registry.terraform.io/providers/PjSalty/truenas/latest) and [UniFi](https://registry.terraform.io/providers/PjSalty/unifi/latest) on the registry. The other [projects](/projects/) are a patched Jellyfin, a hardened Warcraft III realm, and an NPU benchmark.

The stack: Proxmox and RKE2, Cilium with BGP to the MikroTik, Flux, Terraform, Ansible, SOPS, and Velero.

## Now

Last updated 2026-11-01.

- [terraform-provider-truenas](/projects/terraform-provider-for-truenas-scale/) is at {{< registry-version "truenas" >}}. It moved to 3.x in August with one breaking rename, and now covers LXC containers on TrueNAS 26.0.
- [terraform-provider-unifi](/projects/terraform-provider-for-unifi-network/) is at {{< registry-version "unifi" >}}, with nine resources.
- Control plane nodes no longer run application pods, and a Kyverno policy audits it. Turning that policy to Deny is next.
- CI builds run in memory on autoscaled Karpenter nodes, so queue wait stopped being the slow part.
- Jellyfin runs on 12.2 with my [fork](/projects/jellyfin-fork/) and a Valkey-cached [Postgres provider](/projects/jellyfin-pgsql/).

Recently: I wrote up a [drift schedule that was applying Terraform](/incidents/2026-08-22-drift-schedule-applied-terraform/), a [registry that had lost five months of images](/incidents/2026-09-07-harbor-lost-five-months-of-images/), and got a [Ryzen AI NPU working from Linux](/posts/ryzen-ai-npu-on-linux/).
