---
title: "The rack"
date: 2026-06-12
summary: "One used Dell R740xd: the specs, what runs on it, and what I've hit running it."
tags: [hardware, dell, proxmox, gpu, homelab]
types: ["build"]
topics: ["Hardware", "Proxmox"]
---

## The box

A used Dell R740xd. Two Xeon Gold 6242R (40c/80t), 256GB DDR4 ECC, SSDs in a ZFS mirror for boot and VMs, bulk disks on HBA passthrough to a TrueNAS VM, an RTX A2000, iDRAC9 on the management VLAN, 10GbE to a CRS317, and an RB4011 doing the routing.

## What runs on it

Proxmox, {{< lab "vms_running" >}} VMs. {{< lab "k8s_nodes" >}} of them make up the RKE2 cluster. TrueNAS owns the bulk storage. The core services are GitLab, Harbor, NetBox, AdGuard, and the HAProxy pair. The A2000 passes through to one worker for Jellyfin transcoding.


