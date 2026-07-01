---
title: "NetBox before Terraform"
date: 2026-06-12
summary: "Every IP and VM is allocated in NetBox before Terraform or Ansible touches it. NetBox is the source of truth, and drift from it is treated as an incident."
tags: [netbox, terraform, ansible, ipam, source-of-truth]
types: ["build"]
topics: ["NetBox", "Terraform"]
---

Infrastructure as code only knows about what the code created. A VM someone built by hand, an IP squatted during an incident, a VLAN that's on the switch but in no document, Terraform can't see any of it. It plans around all of that fine, right up until two systems claim the same address.

So the rule is simple: NetBox comes first. A VM goes into NetBox before Terraform creates it, IPs get allocated there before anything binds them, and VLANs and prefixes are defined there before a switch port carries them.

## How it flows

Planned state goes in at design time. A new service is a NetBox entry first: name, VLAN, an IP from the right prefix, role tags. Terraform reads that record, so the allocation has an owner instead of being a variable I typed twice.

Actual state syncs back. A CLI subcommand reconciles what Ansible discovers on the hosts against what NetBox claims. Terraform writes desired state in, discovery writes observed state back.

If NetBox and reality diverge, something changed outside the pipeline. That's either drift I need to investigate or an intrusion I need to rule out. Same discipline as the [Terraform drift guard]({{< relref "/posts/shipping-a-terraform-provider.md" >}}), pointed at inventory.

Inventory drives more than provisioning. The [firewall audit]({{< relref "/posts/six-vlans-and-an-honest-firewall-audit.md" >}}) builds its needed-flows matrix from NetBox instead of from memory. Monitoring targets generate from inventory, so a host that exists gets scraped and there's no separate list to forget. The MCP layer serves topology from it. Recovery runbooks lean on it for what a given VLAN should contain, which is exactly what the [power-loss recovery]({{< relref "/incidents/2026-04-17-full-site-power-loss.md" >}}) used.

## The cost

It's a tax, and I won't pretend otherwise. Every new thing is a NetBox entry before a `terraform apply`, maybe two extra minutes when I want to build. But that friction forces the "where does this live, what VLAN, what range" question to design time with a record, instead of debug time with tcpdump. I haven't hit an IP conflict since I put it in place.

NetBox is heavy for a homelab. Full DCIM with racks and cable runs for a single chassis is overkill on paper.