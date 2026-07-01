---
title: "VLAN segmentation and firewall audit on a MikroTik RB4011"
date: 2026-06-12
summary: "Six-VLAN segmentation on a MikroTik RB4011 and two CRS switches, and 19 findings from a line-by-line firewall audit: a rule with no action, a rule below drop-all, and a critical flow running on stale connection state."
tags: [networking, vlan, mikrotik, firewall, security, guide]
types: ["note"]
topics: ["Networking", "Security", "MikroTik"]
---

The whole homelab hangs off one MikroTik RB4011 and two CRS switches, split into six VLANs.

## VLAN segmentation

| VLAN | Subnet | What lives there |
|---|---|---|
| 1 management | <mgmt-ip>/24 | router, switches, BMC |
| 20 infrastructure | <vlan-cidr> | GitLab, Harbor, NetBox, DNS, HAProxy pair, CI runner |
| 30 kubernetes | <vlan-cidr> | RKE2 nodes |
| 40 storage | <vlan-cidr> | NAS, iSCSI and NFS traffic |
| 50 applications | <vlan-cidr> | ingress VIPs, user-facing services |
| 60 DMZ | <vlan-cidr> | internet-exposed and untrusted workloads |

Cross-VLAN traffic transits the router, so every VLAN pair gets an explicit policy. A compromised DMZ box has no path to the Kubernetes API. Storage I/O stays off the broadcast domain that carries latency-sensitive control traffic. VLAN 1 stays native because the BMC and switches default there, which is a single-router trade-off.

The K8s API sits behind an HAProxy pair on the infrastructure VLAN, with a keepalived VRRP VIP that balances across the three control-plane nodes. Nodes only ever know the VIP, so a master can die or drain without anyone reconfiguring kubeconfigs. After failover, a stale ARP entry on the peer once kept the VIP pointing nowhere. Restarting keepalived on the survivor clears it.

## Firewall audit

I went through the rules line by line against the flows the infrastructure actually needs. 19 findings: 3 critical, 5 high, 8 medium, 3 low.

**1. A critical flow allowed only by a stale implicit rule.** HAProxy to the K8s masters on 6443/9345, the API load balancer path, had no forward rule at all. It worked off established-connection state left over from initial setup, so any HAProxy restart would have broken the K8s API.

**2. A rule with no action.** One filter rule, "K8s to infra monitoring", was missing its `action=`. RouterOS treats that as passthrough, so the traffic fell through to the catch-all drop. Prometheus scrapes to the infra VMs were silently dead, and the dashboards showed gaps that looked like target flakiness.

**3. A rule after drop-all.** The storage-monitoring accept sat one position below "drop all else". It was unreachable, matched zero packets, and looked healthy in the rule list.

A long-lived router collects other stale config too: dynamic-DNS client configs for services I stopped using years ago, address lists for subnets that no longer exist, and BGP peer config from an old topology.

