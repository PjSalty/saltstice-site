---
title: About
summary: Who runs this, and what I'm working on now.
showReadingTime: false
aliases: ["/now/"]
---

I'm Matt, a platform engineer. I run a homelab on one Dell R740xd: 17 VMs, a 6-node Kubernetes cluster, TrueNAS, a GPU, with all configurations defined in code.

The [writing](/writing/) is builds, runbooks, and postmortems. The repo is [saltstice-homelab](https://github.com/PjSalty/saltstice-homelab), and I maintain a [TrueNAS Terraform provider](https://registry.terraform.io/providers/PjSalty/truenas/latest) on the registry.

The stack: Proxmox and RKE2, Cilium with BGP to the MikroTik, Flux, Terraform, Ansible, SOPS, and Velero.

## Now

Updated end of June 2026.

- terraform-provider-truenas v2.1 is out. v2 moved off TrueNAS's REST API onto the JSON-RPC/WebSocket.
- Making credential rotation zero-downtime..
- A second AdGuard node behind a keepalived VIP, so losing one node doesn't take internal DNS down.

Recently: moved K8s storage off democratic-csi onto TrueNAS's official CSI driver (seven volumes); hardened the media organizer after an audit found a rename loop and a cleanup path that deleted what it couldn't classify; traced a recurring Cilium degradation to RKE2's kube-proxy fighting Cilium's replacement, and turning kube-proxy off fixed it.
