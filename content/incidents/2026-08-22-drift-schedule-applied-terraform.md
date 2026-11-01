---
title: "The drift detection schedule was applying Terraform"
date: 2026-08-22
summary: "A weekly pipeline meant to detect drift ran plan and apply on the Proxmox root, unattended, on two Sundays. Nobody reviewed a plan."
tags: [postmortem, terraform, ci, proxmox]
types: ["incident"]
topics: ["Terraform", "Operations"]
slug: 2026-08-22-drift-schedule-applied-terraform
---

The weekly "drift detection" schedule in the Terraform repo had been running `terraform apply` with nobody watching. I confirmed it against the pipeline history rather than inferring it.

| scheduled run | child pipeline | jobs |
|---|---|---|
| 2026-08-09 | plan success, apply success | Proxmox root |
| 2026-08-16 | plan success, apply success | Proxmox root |

Nobody reviewed either plan.

## Why a schedule applied anything

A schedule runs on `refs/heads/main`, which sets `CI_COMMIT_BRANCH=main`. The job that triggers the Terraform child pipeline had one rule:

```yaml
- if: $CI_COMMIT_BRANCH == "main"
```

The schedule matched it, spawned the child, and the child applied whatever the last merge touched.

It was worse than an unattended apply. The stages ran `validate, security, detect, fix-state, terraform, drift`, so the apply ran before the drift job. A schedule whose whole purpose is to detect drift was quietly fixing it first. Real drift got applied away before the one job that reports it ever looked.

## The fix

Rules are first-match-wins, so the exclusion goes above the branch rule:

```yaml
- if: $CI_PIPELINE_SOURCE == "schedule"
  when: never
- if: $CI_COMMIT_BRANCH == "main"
```

The drift job keeps its own schedule rule. I checked it by parsing the merged YAML, and the merge's own child pipeline emitted only a no-changes job, with no plan and no apply, because nothing under a `.tf` root had changed.

## How I found it

"The schedule ran" was a hypothesis. To turn it into a finding I followed the pipeline's bridge to the child pipeline, then listed the child's jobs and read their names. `terraform:apply` on the Proxmox root is a different sentence from "a schedule fired".
