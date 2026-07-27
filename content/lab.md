---
title: Lab
summary: The hardware, network, and full stack on one page. Updated when something changes.
showReadingTime: false
aliases: ["/uses/"]
---

The whole homelab runs on one used Dell R740xd. Writeups are in [Writing](/writing/) and the [public repo](https://github.com/PjSalty/saltstice-homelab), and operational numbers are on [Telemetry](/telemetry/).

## Hardware

- **Hypervisor**: Dell PowerEdge R740xd, 14th-gen, 2U, iDRAC9 for OOB. Proxmox VE on a ZFS SSD mirror.
- **CPU**: 2x Intel Xeon Gold 6242R (Cascade Lake-R). 20 cores / 40 threads per socket, 40 / 80 total. 3.10 GHz base, 4.10 turbo, 205W TDP per socket.
- **RAM**: 256 GiB DDR4-2933 ECC RDIMM. 16x 16 GiB, 16 of 24 slots, room to 384 GiB without bigger sticks.
- **Boot/VM pool**: ZFS mirror of two SSDs, checksums self-heal on scrub.
- **GPU**: NVIDIA RTX A2000, PCIe passthrough to `k8s-worker-1` for Jellyfin NVENC.
- **PSUs**: 2x redundant, both lines hot.
- **UPS**: Tripp Lite SMART1500LCD, 1500VA / 900W, monitored over USB with NUT (`tripplite_usb`).

## VMs

{{< lab "vms_running" >}} VMs on the one hypervisor, about {{< lab "ram_allocated_gib" >}} GiB of {{< lab "ram_total_gib" >}} GiB allocated, the rest ZFS ARC and headroom. All run Debian 13 (Trixie), provisioned by Terraform (bpg/proxmox) off the VMID 9000 cloud template, cloud-init for first boot, Ansible after. The table lists the long-lived ones; the rest are a disposable test fleet for provider development.

| VM | vCPU / RAM / Disk | Role |
|---|---|---|
| `truenas` | 4 / 32 GiB / 128 GiB (+ passthrough disks) | TrueNAS SCALE, NFS + iSCSI + S3 |
| `gitlab` | 6 / 12 / 100 | Self-hosted GitLab + CI engine |
| `harbor` | 4 / 8 / 100 | Container image registry |
| `netbox` | 2 / 4 / 50 | DCIM + IPAM source of truth |
| `adguard` | 2 / 2 / 32 | Internal DNS + ad blocking |
| `adguard-2` | 2 / 2 / 32 | Second DNS node behind a keepalived VIP |
| `unifi-os` | 4 / 8 / 64 | UniFi OS Server, network controller |
| `haproxy-1/2` | 2 / 2 / 32 each | K8s API LB + keepalived VIP |
| `ci-runner` | 4 / 8 / 50 | Dedicated GitLab runner |
| `amp` | 4 / 16 / 200 | CubeCoders AMP control panel |
| `k8s-master-1/2/3` | 4 / 8 / 100 each | RKE2 control plane + etcd |
| `k8s-worker-1` | 8 / 16 / 150 | GPU worker (A2000 passthrough) |
| `k8s-worker-2/3` | 4 / 16 / 150-200 each | General workers |
| `vpn` | 8 / 2 / 32 | wg-easy WireGuard server (DMZ) |

## Storage

- **NAS**: TrueNAS SCALE {{< lab "truenas_version" >}} on a bare VM. ZFS pool `tank`, RAIDZ2 on 6 TB drives, hot spare in the chassis. Datasets per workload: Postgres zvols on iSCSI, media on NFS with compression, S3 (in-cluster SeaweedFS) for backup objects.
- **K8s CSI**: truenas-csi, the official iX WebSocket-native driver. StorageClasses `truenas-iscsi` (RWO block, databases) and `nfs-client` (RWX file, everything else). NFS doesn't guarantee fsync across the network and Postgres needs it, so databases go on iSCSI ([postgres on iscsi]({{< relref "/posts/iscsi-block-storage-for-postgres.md" >}})).
- **Backup**: Velero for K8s state, Kopia for VM-level, both to the in-cluster SeaweedFS S3 so backups don't depend on the same TrueNAS box.

## Network

![Network topology: internet through RB4011 and CRS317 into the R740xd, VLAN segments inside Proxmox](/diagrams/topology.svg)

- **Router**: MikroTik RB4011iGS+, RouterOS {{< lab "routeros_version" >}}. BGP peering with the cluster, primary firewall.
- **Switches**: CRS317-1G-16S+ (10G aggregation, 16x SFP+) and CRS328-24P-4S+ (PoE access for APs and cameras).
- **K8s API LB**: HAProxy + keepalived VIP across two VMs.

VLANs, every cross-VLAN flow an explicit firewall rule on the router. Trusted, IoT, and guest segments exist alongside these:

| VLAN | Purpose |
|---|---|
| 1 | management: router, switches, BMC |
| 20 | infrastructure: GitLab, Harbor, NetBox, DNS, HAProxy pair |
| 30 | kubernetes: RKE2 nodes and pods |
| 40 | storage: iSCSI and NFS |
| 50 | applications: ingress VIPs |
| 60 | DMZ: internet-exposed and untrusted |

External access is one residential static IP with `:80` blocked by the ISP, so Jellyfin is exposed on a high port NAT'd to the Traefik `:443` VIP, Cloudflare DNS in front. Path of a request:

```
internet -> Cloudflare DNS -> router NAT -> Traefik (DMZ or internal) -> forward-auth (Authentik) -> K8s service -> pod
LAN      -> AdGuard split DNS -> ingress VIP -> K8s service -> pod
```

Design and audit detail: [six VLANs and a firewall audit]({{< relref "/posts/six-vlans-and-an-honest-firewall-audit.md" >}}), [split-horizon DNS]({{< relref "/posts/split-horizon-dns-for-a-homelab.md" >}}).

## Platform

| Layer | Choice |
|---|---|
| Kubernetes | RKE2, 3 masters + 3 workers, Karpenter node autoscaling |
| CNI | Cilium, kube-proxy-free, BGP MD5, Hubble |
| GitOps | Flux v2, multi-source (manifests repo + secrets repo) |
| Secrets | SOPS-Age in git, ESO fan-out to per-namespace secrets |
| Ingress | Traefik, internal + DMZ instances, Authentik forward-auth |
| Storage CSI | truenas-csi: iSCSI for databases, NFS for shared |
| Backup | Velero + Kopia to in-cluster SeaweedFS S3, pg_dump tier, ZFS under it |
| Identity | Authentik, OIDC apps wired by a one-shot blueprint Job, forward-auth for the non-OIDC ones |
| Policy | Kyverno (enforce) and CiliumNetworkPolicies, default-deny per namespace |
| Runtime security | Falco + CrowdSec |
| Observability | Prometheus, Grafana, Loki, Tempo, AlertManager to Pushover |
| Registry | Harbor, containerd-mirror proxy caching for the public upstreams |
| CI/CD | self-hosted GitLab, dedicated deploy runner VM, Renovate |
| Inventory | NetBox, allocate-before-build |
| Automation | one Go CLI with an embedded read-only MCP server |

Renovate updates a single `image-versions` ConfigMap with custom regex managers; HelmReleases reference `${IMAGE_X}` placeholders that Flux postBuild substitutes, so every app rolls forward from one change. Container nodes pull through Harbor via containerd mirrors (`/etc/rancher/rke2/registries.yaml`), see [the postmortem]({{< relref "/incidents/2026-04-09-harbor-proxy-containerd-mirrors.md" >}}) for why that lives at the runtime layer.

## Workstation

Arch Linux, zsh with starship, Kitty, Neovim, and the usual CLI set (eza, bat, ripgrep, fd, zoxide, jq, yq).

## This site

Hugo extended with PaperMod, hosted on GitHub Pages, Cloudflare in front with proxy on the apex.
