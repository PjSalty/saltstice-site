---
title: "Terraform provider for TrueNAS"
date: 2026-06-12
summary: "Acceptance tests against a real TrueNAS VM, a drift guard against prod, and a Registry release."
tags: [terraform, truenas, golang, providers, testing]
types: ["build"]
topics: ["Terraform", "TrueNAS", "Go"]
---

[PjSalty/truenas](https://registry.terraform.io/providers/PjSalty/truenas/latest) is a Terraform provider for TrueNAS, published on the public Registry, currently {{< registry-version "truenas" >}}.

## What done means for a provider

- **Acceptance tests against a real TrueNAS VM.** A dedicated SCALE VM runs create, mutate, import, and destroy against real datasets and shares. Mocks only prove my assumptions about the API, so every test runs against real hardware.
- **ImportState verification on every resource.** Each resource has a test that creates it, imports it, and diffs the two states field by field. Import is where providers rot, and most of the bugs live in that diff.
- **The prod test.** The acceptance gate points the provider at the production box, imports all of it, and runs a plan. Zero diff is the pass condition.
- **A drift guard.** CI re-plans against prod on a schedule. A UI change shows up in the pipeline before the state file and reality drift far enough to hurt.
- **Never test experimental code against prod.** Every destructive test path runs against the disposable VM only. It's a storage provider, and the failure mode is data loss.

## Release mechanics

The Registry wants multi-platform binaries, GPG-signed checksums, and generated docs. goreleaser builds 7 platform targets and signs the checksum manifest. The docs are generated from the schema, so they can't drift from the code. After that, publishing is a tag.

## The v2 rewrite

TrueNAS is moving from its REST API to JSON-RPC 2.0 over WebSocket as it deprecates REST, and v1.x of the provider was REST. v2 swapped out the entire transport layer and kept every resource schema stable, so existing configs run unchanged on the new wire protocol. v1.x stays on the `release/1.x` branch for anyone still on an older TrueNAS.

Swapping the transport without changing behavior is exactly what the test suite above is for. The v2 candidate ran against the production box through the same import-everything-and-plan gate, zero diff, before it got a final tag.

## Lessons

Use `terraform-plugin-framework`, the old SDK is legacy. Generate docs from the schema on day one. Get one resource through the full create-import-plan-destroy cycle against real hardware before you write the rest. The patterns you fix on the first one repeat across every resource after it.
