---
title: "Credential rotation pipeline"
date: 2026-06-12
summary: "One encrypted SSOT, a registry that describes every credential, and a rotation job that won't finish unless every service validates. Built after a robot account drifted silently for weeks."
tags: [secrets, sops, automation, gitops, harbor]
types: ["build"]
topics: ["Credentials", "Security", "Automation"]
---

I keep every credential in the homelab in one SOPS-encrypted SSOT file. A registry file describes each one: its type (password, API key, OIDC client secret), length, rotation interval, which Kubernetes secret or VM service consumes it, and how to validate it (HTTP health check, API login, database connect, pod running).

Rotation is one job in five phases. It backs up the current SSOT, generates new values from the registry spec, applies them to the consumers (K8s secrets through the secrets repo, VM services through their APIs), restarts whatever needs it, and validates every credential against its registry check. Only then does it decide what to do. If everything is green, it archives the old values and stamps the timestamps. If anything is red, it rolls back to the backup and reports.

The validation gate is all-or-nothing. A half-applied rotation leaves half the systems holding the old value and half holding the new one, with nothing to tell you which is which.

## The Harbor drift incident

A Harbor robot account that CI uses drifted out of sync with the SSOT for weeks. Three things lined up:

- Terraform created the robot but never managed its secret, so Harbor generated its own, and it never matched the SSOT value.
- The rotation job kept regenerating the SSOT side on schedule, widening the gap every cycle.
- The CI variable holding the password had been hand-pasted once during an earlier fix. It worked just long enough that everyone stopped looking.

Builds started failing with 401s weeks after the actual mistake. Nothing was obviously broken. Three systems just held three different versions of one password.

Both fixes were structural. The provider now manages the robot secret with a write-only argument, so Terraform asserts the value instead of ignoring it. The legacy argument was a silent no-op on update, worth knowing if you run Harbor through Terraform. A sync subcommand maps SSOT entries to GitLab CI variables and pushes them as part of rotation, so a credential that isn't in the mapping can't exist anywhere.

The registry answers one question: which consumers hold a given credential. A rotation completes when every consumer has the new value and proves it works, and listing those consumers is the hard part. Every drift since has been a missing registry entry.
