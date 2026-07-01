---
title: "Proxmox cluster firewall broke etcd quorum via bridge-nf and UFW"
date: 2026-03-17
summary: "Enabling the Proxmox cluster firewall set bridge-nf-call-iptables=1, so UFW dropped bridged VM traffic and etcd lost quorum."
tags: [postmortem, kubernetes, networking, proxmox]
types: ["incident"]
topics: ["Proxmox", "Networking"]
---

I enabled the Proxmox cluster firewall for VLAN segmentation. etcd lost quorum within 30 seconds. Disabled the firewall and etcd recovered.

Tried again two hours later after fixing the host firewall rules. But had the same type of outage.

On the third attempt I left it on and pulled packet captures. TCP between VMs on the same Proxmox host was getting dropped by iptables on the host itself, even though the cluster firewall allowed `<vlan-cidr>` to itself.

ICMP between the same VM pairs worked the whole time. That misled me on the first two attempts. Ping was fine, so I kept hunting TCP-layer causes: MTU, keepalives, RST storms.

## Root cause

Enabling the Proxmox cluster firewall sets `net.bridge.bridge-nf-call-iptables=1` on the hypervisor. Bridged VM traffic then passes through the host's iptables chains. The Proxmox host runs UFW with default-deny incoming. UFW saw the bridge-passed traffic as incoming from the VM and dropped it.

The cluster firewall rule allowed VM-to-VM traffic, but only at the cluster firewall layer with UFW dropping traffic. The path crossed three layers:

1. Proxmox cluster firewall: allowed
2. UFW on the host: dropped (default-deny)
3. iptables FORWARD chain on vmbr0: dropped (UFW set the FORWARD policy to DROP)

ICMP slipped through because UFW has a default allow for ICMP echo. Ping worked while TCP failed.

## Fix

```bash
ufw route allow in on vmbr0 out on vmbr0
```

Plus `DEFAULT_FORWARD_POLICY="ACCEPT"` in `/etc/default/ufw` so the FORWARD chain stops dropping. Enabled the cluster firewall a fourth time and it held.

ICMP passing while TCP fails points below TCP, at the bridge, the FORWARD chain, or conntrack. UFW's default ICMP-echo allow is why ping kept working through every attempt.

The cluster firewall toggle is cluster-wide and hits running production, so I staged the rollback before flipping it the fourth time.
