---
title: Lab
summary: The hardware, network, and full stack on one page. Numbers last checked 2026-11-01.
showReadingTime: false
aliases: ["/uses/"]
---

The whole homelab runs on one used Dell R740xd. Writeups are in [Writing](/writing/) and the [public repo](https://github.com/PjSalty/saltstice-homelab), and operational numbers are on [Telemetry](/telemetry/).

## Hardware

- **Hypervisor**: Dell PowerEdge R740xd, 14th-gen, 2U, iDRAC9 for OOB. Proxmox VE on a ZFS SSD mirror.
- **CPU**: 2x Intel Xeon Gold 6242R (Cascade Lake-R). 20 cores / 40 threads per socket, 40 / 80 total. 3.10 GHz base, 4.10 turbo, 205W TDP per socket.
- **RAM**: 256 GiB DDR4-2933 ECC RDIMM. 16x 16 GiB, 16 of 24 slots, room to 384 GiB without bigger sticks.
- **Boot/VM pool**: ZFS mirror of two SSDs, checksums self-heal on scrub.
- **GPU**: NVIDIA RTX A2000, PCIe passthrough to `k8s-worker-1`. The device plugin advertises four slots for the one card, so Jellyfin NVENC and other GPU work share it.
- **PSUs**: 2x redundant, both lines hot.
- **UPS**: Tripp Lite SMART1500LCD, 1500VA / 900W, monitored over USB with NUT (`tripplite_usb`).

## VMs

{{< lab "vms_running" >}} VMs running on the one hypervisor on 2026-11-01, about {{< lab "ram_allocated_gib" >}} GiB of {{< lab "ram_total_gib" >}} GiB allocated, the rest ZFS ARC and headroom. That count includes the {{< lab "k8s_ci_nodes" >}} autoscaled CI nodes alive that day and a couple of test guests. All run Debian 13 (Trixie), provisioned by Terraform (bpg/proxmox) off the VMID 9000 cloud template, cloud-init for first boot, Ansible after. The table lists the long-lived ones. The rest are a disposable test fleet for provider development and the Karpenter CI nodes, which come and go.

| VM | vCPU / RAM / Disk | Role |
|---|---|---|
| `truenas` | 4 / 32 GiB / 128 GiB (+ passthrough disks) | TrueNAS SCALE, NFS + iSCSI + S3 |
| Git forge | 6 / 12 / 100 | Self-hosted Git hosting and CI engine |
| `harbor` | 4 / 8 / 250 | Container image registry |
| `netbox` | 2 / 4 / 50 | DCIM and IPAM records (the sync jobs were retired in September) |
| `adguard` | 2 / 2 / 32 | Internal DNS + ad blocking |
| `adguard-2` | 2 / 2 / 32 | Second DNS node, kept in sync with the first |
| `unifi-os` | 4 / 8 / 64 | UniFi OS Server, network controller |
| `haproxy-1/2` | 2 / 2 / 32 each | K8s API LB + keepalived VIP |
| `ci-runner` | 4 / 8 / 50 | Dedicated CI runner |
| `amp` | 4 / 16 / 400 | CubeCoders AMP control panel |
| `k8s-master-1/2/3` | 4 / 10 / 100 each | RKE2 control plane + etcd, no application pods |
| `k8s-worker-1` | 8 / 32 / 150 | GPU worker (A2000 passthrough) |
| `k8s-worker-2/3` | 4 / 16 / 150-200 each | General workers |
| `ci-pool-*` | 2 / 8 / 54 each | Karpenter CI nodes, created on demand |
| `vpn` | 8 / 2 / 32 | WireGuard server (DMZ), stopped at the time of writing |

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
| 20 | infrastructure: Git forge, Harbor, NetBox, DNS, HAProxy pair |
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
| Kubernetes | RKE2 {{< lab "rke2_version" >}}, 3 control plane nodes that run no apps + 3 workers, Karpenter CI nodes |
| CNI | Cilium, kube-proxy-free, BGP MD5, Hubble |
| GitOps | Flux v2, multi-source (manifests repo + secrets repo) |
| Secrets | SOPS-Age in git, ESO fan-out to per-namespace secrets |
| Ingress | Traefik, internal + DMZ instances, Authentik forward-auth |
| Storage CSI | truenas-csi {{< lab "truenas_csi_version" >}}: iSCSI for databases, NFS for shared |
| Backup | Velero + Kopia to in-cluster SeaweedFS S3, pg_dump tier, ZFS under it |
| Identity | Authentik, OIDC apps wired by a one-shot blueprint Job, forward-auth for the non-OIDC ones |
| Policy | Kyverno (enforce) and CiliumNetworkPolicies, default-deny per namespace |
| Runtime security | Falco + CrowdSec |
| Observability | Prometheus, Grafana, Loki, Tempo, Alertmanager to Pushover, ntfy for scheduled-job alerts |
| Registry | Harbor, containerd-mirror proxy caching for the public upstreams |
| CI/CD | self-hosted Git forge and CI, a dedicated deploy runner VM, a Kubernetes runner that bursts onto Karpenter nodes, Renovate |
| Inventory | NetBox for IP and VLAN records, Proxmox as the live source |
| Automation | one Go CLI with an embedded read-only MCP server |

Renovate updates a single `image-versions` ConfigMap with custom regex managers; HelmReleases reference `${IMAGE_X}` placeholders that Flux postBuild substitutes, so every app rolls forward from one change. Container nodes pull through Harbor via containerd mirrors (`/etc/rancher/rke2/registries.yaml`), see [the postmortem]({{< relref "/incidents/2026-04-09-harbor-proxy-containerd-mirrors.md" >}}) for why that lives at the runtime layer.

## Workstation

Arch Linux, zsh with starship, Kitty, Neovim, and the usual CLI set (eza, bat, ripgrep, fd, zoxide, jq, yq).

## This site

Hugo extended with a small theme of my own (system fonts, no third-party requests, a strict CSP), hosted on GitHub Pages with Cloudflare in front.
