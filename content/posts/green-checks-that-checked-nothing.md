---
title: "Two test jobs in my Terraform provider that were green and tested nothing"
date: 2026-08-28
summary: "The acceptance runner skipped a package holding 192 tests, and every cleanup sweeper had been dead since TrueNAS 26 removed REST. Nothing said so."
tags: [terraform, truenas, testing, ci, go]
types: ["build"]
topics: ["Terraform", "TrueNAS", "Go"]
slug: green-checks-that-checked-nothing
---

Two checks in [terraform-provider-truenas](/projects/terraform-provider-for-truenas-scale/) reported success for weeks while doing almost nothing. I found both by running something myself that the sanctioned path couldn't have run.

## The acceptance suite that skipped half of itself

`scripts/acc.sh` ended with this line:

```sh
TF_ACC=1 go test "${ACCEPTANCE_ARGS[@]}" ./internal/resources/ ./internal/datasources/
```

`internal/provider` holds 192 `TestAcc` functions and wasn't on it. So `make acc`, whose own banner calls it the full acceptance suite, passed without running a third package. Only `make testacc` reached it, and nothing documented calls that.

Adding the package showed why it had been left out. Ten singleton config resources (SMB, NFS, SSH, SNMP, mail, FTP, system dataset, network, UPS and KMIP config) are exercised from both packages against one appliance. `go test` runs packages concurrently, so whichever test loses the race fails on state the other one set:

```
TestAccSMBConfigResource_update dies with
[EINVAL] smb_update.aapl_extensions: This option must be enabled when
AFP, time machine, or Final Cut Pro shares are present
```

Both pass alone. I checked the box afterwards: no shares, `aapl_extensions=false`, so it was the race and not leftover state.

The fix is `-p 1` in both runners. A suite whose packages share one stateful appliance can't run them in parallel. That's correctness, not tuning.

The 192 tests earned their keep immediately. One validator test had been passing on the wrong diagnostic: its config also set a `create_type` outside the allowed set, so the step failed for two reasons and the regexp couldn't tell which.

My own guard test for the serial flag first searched the whole file for `-p 1` and passed on a file whose only match was the comment explaining the flag. It reads the argument list now. That's the same false negative it exists to catch.

## 46 sweepers that couldn't run

Acceptance tests leave fixtures behind, so the provider has sweepers that list and delete them. All 46 were dead against TrueNAS 26.0. They listed fixtures with an HTTP GET against `/api/v2.0`, and 26.0 removed the REST API. An authenticated GET to `/api/v2.0/api_key` on the 26.0 beta returned 404. 29 call sites used that path.

It was worse than 29 broken listings, because the plugin testing framework aborts the whole sweep run on the first sweeper error. The run died on `truenas_vm_device` and nothing scheduled after it ran. Litter piled up quietly, and it surfaces as an `EEXIST` collision on some later unrelated run, far from the cause.

Listing now goes over the same JSON-RPC WebSocket as production traffic. The mapping is mechanical: a REST path is the RPC namespace with slashes turned into dots, so `/iscsi/portal` becomes `iscsi.portal`. I checked all 29 against `core.get_methods` on a live box before rewriting anything, and 29 of 29 mapped.

Callers pass the whole method (`iscsi.portal.query`), not the namespace. The API drift script exempts auto-generated CRUD verbs by the last dotted segment, so a bare namespace looks like a method upstream removed. It caught me doing exactly that, once from a comment.

Two traps worth keeping:

- A clean sweep on an empty box proves "no errors", not "works". I had to query the 29 namespaces live and see that 3 returned real rows.
- Mutation testing caught two loose tests of mine. A "failed query" mutation survived because the test only asserted that the method name appeared in the error, which a fall-through decode error also satisfies. Assert that the failure is reported at the right layer.

Deleting the REST helper also removed the only `http.Client` in the codebase, and the `InsecureSkipVerify` TLS config with it.

## What I check now

When a check goes green, I find one input that should make it red and run that. For a runner that's a package it should include. For a cleanup job it's a fixture it should find.
