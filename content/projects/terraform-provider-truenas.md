---
title: Terraform provider for TrueNAS SCALE
date: 2026-04-25
lastmod: 2026-11-01
summary: A Terraform provider for TrueNAS SCALE on the public Registry, built on the JSON-RPC API.
tags: [terraform, truenas, go, open-source]
---

It's live on the [Terraform Registry](https://registry.terraform.io/providers/PjSalty/truenas/latest) as `PjSalty/truenas`, MPL-2.0. Current release is {{< registry-version "truenas" >}}.

## What it does

It manages the TrueNAS SCALE control plane over the JSON-RPC/WebSocket API, which is what TrueNAS is standardizing on as it deprecates REST. v1.x stays on the `release/1.x` branch for anyone on an older TrueNAS that hasn't moved off REST yet.

Coverage runs across storage (datasets, ZVols, snapshot tasks, scrub, replication), iSCSI (targets, portals, extents, initiators, NVMe-oF), file sharing (NFS, SMB, FTP), identity (users, groups, privileges, Kerberos, API keys), networking, certificates, virtualization, and system management, plus read-only data sources for inventory queries.

Retries are idempotent, and a request ID follows every call into the TrueNAS middlewared audit trail. CI blocks any merge that drops test coverage, and the acceptance tests check out-of-band drift: delete a resource with the live client, then confirm the next plan detects it.

## Phased-rollout safety modes

Two non-default provider flags make it safe to point at production.

```hcl
provider "truenas" {
  url                  = "https://truenas.example.com"
  api_key              = var.truenas_api_key
  read_only            = true   # refuses every write call before it leaves the process
  destroy_protection   = true   # blocks deletes; create and update still work
}
```

`read_only` lets you run `plan` against production with a hard guarantee it can't mutate anything. `destroy_protection` blocks deletes only, so you can adopt existing infra into Terraform and turn deletes on when you're ready.

## Releases since August

- **3.0.0** (2026-08-28) is a breaking release. `truenas_system_update` had been calling five `update.*` methods that don't exist in the middleware, so every plan touching it failed. It now uses `update.config` and `update.update`, `auto_download` became `autocheck`, `train` became `profile`, and `available_status` is gone. State migrates on its own, but a configuration that names the old arguments has to change. Nothing else renames an attribute; I diffed every schema attribute name against v2.4.1 to check. It also adds `truenas_container_device` and the `truenas_container_images` data source for the LXC containers in TrueNAS 26.0.
- **3.1.0** (2026-10-11) adds `exclude` to `truenas_snapshot_task`, so an exclusion set outside Terraform no longer hides from `plan`, and `sudo_commands_nopasswd` on users and groups, contributed from the community.
- **3.1.1** (2026-10-24) fixes the second apply of `truenas_smb_config` failing on TrueNAS 25.10 and older, makes `sudo_commands = []` actually clear the list, and moves to Go 1.26.10 for a `crypto/x509` advisory.

Why two of those fixes exist at all is in [two test jobs that were green and tested nothing](/posts/green-checks-that-checked-nothing/). A zvol `refreservation` argument is merged for the next release.

## Source

- Registry: <https://registry.terraform.io/providers/PjSalty/truenas/latest>
- GitHub: <https://github.com/PjSalty/terraform-provider-truenas>
- License: MPL-2.0
