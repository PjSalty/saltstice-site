---
title: Start here
summary: The posts and incidents to read first.
showReadingTime: false
showToc: false
---

These are the ones I'd read first, grouped by topic.

## Outages

- [full-site power loss]({{< relref "/incidents/2026-04-17-full-site-power-loss.md" >}}), where the cold boot turned up five failures that had nothing to do with the power loss.
- [the audit that moved large amounts of files]({{< relref "/incidents/2026-04-19-audit-moved-921-files.md" >}}), batch automation, and the rollback.
- [Cilium degraded for two days]({{< relref "/incidents/2026-04-27-cilium-silent-degradation.md" >}}), while the liveness probe stayed green the whole time.
- [Cilium policy evaluating before DNAT]({{< relref "/incidents/2026-04-09-cilium-pre-dnat-policy.md" >}}), three outages in a single session.

## Builds

- [registry rewriting belongs in containerd]({{< relref "/posts/registry-rewriting-belongs-in-containerd.md" >}}), not in per-chart Helm patches.
- [split-horizon DNS]({{< relref "/posts/split-horizon-dns-for-a-homelab.md" >}}), including the search-domain bleed that looked like app crashes for months.
- [Karpenter on Proxmox]({{< relref "/posts/karpenter-on-proxmox.md" >}}), node autoscaling on bare metal.
- [backups with zero recurring spend]({{< relref "/posts/backups-with-zero-recurring-spend.md" >}}), three recovery tiers and no cloud bill.

## The code

- [terraform-provider-truenas]({{< relref "/posts/shipping-a-terraform-provider.md" >}}), built and published on the Terraform Registry.
- [one Go binary]({{< relref "/posts/one-go-binary-for-all-automation.md" >}}), Go CLI tool.

Everything else is in the [archive](/archives/), [search](/search/), or the [incidents index](/incidents/).
