---
title: Lab
summary: The hardware, network and stack behind the homelab. Counts and release lines are read live from the lab.
showReadingTime: false
aliases: ["/uses/"]
---

Everything runs on one used Dell R740xd. The map above is drawn from the same inventory as this page, and the live numbers come straight from the cluster. Writeups are in [Writing](/writing/) and the [public repo](https://github.com/PjSalty/saltstice-homelab).

Some detail is left out on purpose: addresses, VLAN numbers, exact patch versions and anything about remote access. That's the stuff that helps an attacker more than a reader.

## Hardware

- **Hypervisor**: Dell PowerEdge R740xd, 14th-gen, 2U, running Proxmox VE. Boot and VM disks are a ZFS mirror of two SSDs.
- **CPU**: 2x Intel Xeon Gold 6242R (Cascade Lake-R), 40 cores / 80 threads total, 3.1 GHz base and 4.1 GHz turbo.
- **RAM**: 256 GiB DDR4-2933 ECC RDIMM, 16x 16 GiB in 16 of 24 slots.
- **GPU**: NVIDIA RTX A2000, passed through to one Kubernetes worker. The device plugin splits it four ways, so Jellyfin transcodes and other GPU work share the card.
- **Power**: two redundant PSUs on separate feeds, plus a 1500VA UPS watched by NUT. A real low-battery signal shuts the host down cleanly. A false one once did too, see [the postmortem]({{< relref "/incidents/2026-09-27-ups-false-low-battery-halted-host.md" >}}).

## VMs

{{< lab "vms_running" >}} VMs are running on the one hypervisor right now, with about {{< lab "ram_allocated_gib" >}} of {{< lab "ram_total_gib" >}} GiB allocated and the rest left to ZFS and headroom. That count includes whatever autoscaled CI nodes are alive and a few test guests. Every VM runs Debian 13, gets built by Terraform from a cloud-init template and configured by Ansible after first boot.

| VM | Role |
|---|---|
| `truenas` | TrueNAS SCALE: iSCSI, NFS and the backup datasets |
| Git forge | Self-hosted Git hosting and CI engine |
| `harbor` | Container registry and pull-through cache |
| `netbox` | IP and device records |
| `adguard`, `adguard-2` | Internal DNS pair with split horizon and ad blocking |
| `unifi-os` | Wi-Fi and switch controller |
| `haproxy-1`, `haproxy-2` | Kubernetes API load balancer pair behind a keepalived VIP |
| `ci-runner` | CI runner for jobs that deploy to VMs |
| `k8s-master-1..3` | RKE2 control plane and etcd, no application pods |
| `k8s-worker-1` | GPU worker |
| `k8s-worker-2`, `k8s-worker-3` | General workers |
| `ci-pool-*` | Karpenter CI nodes, created on demand and gone when idle |

A small fleet of test VMs comes and goes for provider development, and the old VMs that are parked stay out of this table.

## Storage

- **NAS**: TrueNAS SCALE in a VM with its disk controller passed through. Pool `tank` is one 12-disk RAIDZ2 vdev. Each workload gets its own datasets: database volumes on iSCSI, media on NFS, backups on their own datasets.
- **Kubernetes storage**: truenas-csi {{< lab "truenas_csi_version" >}}, the official iX driver. `truenas-iscsi` is block storage for anything that needs real fsync (Postgres lives here, see [postgres on iSCSI]({{< relref "/posts/iscsi-block-storage-for-postgres.md" >}})). `nfs-client` is shared file storage for everything else.
- **Backup**: three layers. Velero with the Kopia uploader backs up cluster state and volumes to an in-cluster SeaweedFS S3 store. Proxmox vzdump backs up whole VMs to TrueNAS over NFS. A nightly dump covers Jellyfin's Postgres database on its own.

## Network

- **Router**: MikroTik RB4011 on RouterOS. Main firewall, routing between segments, and the BGP peer for the cluster's load-balancer addresses.
- **Switches**: MikroTik CRS317 for 10G SFP+ aggregation and CRS328 for PoE access.
- **Wi-Fi**: UniFi access points, managed by the controller VM.
- **Kubernetes API**: the HAProxy pair with a keepalived VIP.

The network is split into segments for management, infrastructure, Kubernetes, storage and applications, plus a DMZ and the client networks (trusted, wireless, IoT and guest). Traffic between them is denied by default, and every flow that crosses a boundary is an explicit rule on the router. IoT and guest reach the internet and nothing else.

How traffic gets in:

```text
site visitor   -> Cloudflare -> GitHub Pages                (the homelab isn't in this path)
live charts    -> Cloudflare -> outbound tunnel -> Traefik -> read-only telemetry API
media clients  -> Jellyfin's own Traefik entrypoint -> Jellyfin   (nothing else answers there)
LAN client     -> internal DNS -> ingress VIP over BGP -> Traefik -> forward-auth -> service -> pod
```

Design and audit detail: [VLAN segmentation and the firewall audit]({{< relref "/posts/six-vlans-and-an-honest-firewall-audit.md" >}}), [split-horizon DNS]({{< relref "/posts/split-horizon-dns-for-a-homelab.md" >}}).

## Platform

| Layer | Choice |
|---|---|
| Kubernetes | RKE2 {{< lab "rke2_version" >}}: 3 control plane nodes that run no apps, 3 workers, Karpenter CI nodes on demand |
| Networking | Cilium with kube-proxy replacement and Hubble; MetalLB announces service addresses to the router over BGP |
| GitOps | Flux with two sources: the manifests repo and a SOPS-encrypted secrets repo |
| Secrets | SOPS with age in Git, External Secrets fan-out to each namespace |
| Ingress | Traefik (internal and DMZ instances), Cloudflare Tunnel for the public pieces, Authentik forward-auth |
| Storage | truenas-csi: iSCSI for databases, NFS for shared data |
| Backup | Velero with Kopia to SeaweedFS S3, vzdump for VMs, Postgres dumps |
| Identity | Authentik, OIDC wherever an app supports it, forward-auth for the rest |
| Policy | Kyverno in enforce mode, Pod Security labels, default-deny Cilium network policies per namespace |
| Runtime | Falco on every node |
| Observability | Prometheus, Grafana, Loki, Tempo, Alertmanager to push notifications, ntfy for scheduled jobs |
| Registry | Harbor, plus pull-through caches for the public registries through containerd mirrors |
| CI/CD | Self-hosted Git forge and CI, separate build and deploy runners, Karpenter burst nodes for CI, Renovate |
| Inventory | Proxmox and the cluster are the live source; NetBox keeps the address records |
| Automation | One Go CLI with a read-only MCP server built in |

Renovate updates a single `image-versions` ConfigMap with custom regex managers. HelmReleases reference `${IMAGE_X}` placeholders that Flux fills in at apply time, so every app rolls forward from one change. Nodes pull through Harbor via containerd mirrors, see [the postmortem]({{< relref "/incidents/2026-04-09-harbor-proxy-containerd-mirrors.md" >}}) for why that lives at the runtime layer.

## Workstation

Arch Linux, zsh with starship, Kitty, Neovim, and the usual CLI set (eza, bat, ripgrep, fd, zoxide, jq, yq).

## This site

Hugo with a theme of my own: Geist type, self-hosted, no third-party requests and a strict CSP. The live charts and every number on this site read a small read-only API that serves a short list of aggregate counts and release lines, and nothing else. Hosted on GitHub Pages with Cloudflare in front.
