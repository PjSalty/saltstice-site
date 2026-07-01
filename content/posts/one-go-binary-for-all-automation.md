---
title: "One Go binary for all homelab automation"
date: 2026-06-12
summary: "Every homelab script became a subcommand of one Go CLI: 18 command groups, 33k lines, 140 tagged releases since March. The repo rule: no new scripts."
tags: [golang, automation, cli, tooling, testing]
types: ["build"]
topics: ["Automation", "Go"]
---

All my homelab automation lives in one Go binary, `homelab-cli`: 18 command groups, about 33k lines of Go, 43 test files, and 140 tagged releases since March.

Before that it was script sprawl. A bash script for backups. A Python script for credential rotation. Another Python script, in its own venv, for health checks.

In March I moved all of it into `homelab-cli`. The rule since then is simple: no new scripts. Automation worth keeping gets a subcommand, with types, tests, and a release pipeline. A scratch directory holds the real one-offs. Anything that runs twice becomes a subcommand or gets deleted.

## What lives in it

The groups map to what the homelab actually needs done.

- **credential**: the SOPS SSOT lifecycle. Generate, rotate, sync to
  consumers, and refuse to regenerate values something else owns
  ([the pipeline post]({{< relref "/posts/credential-rotation-as-a-pipeline.md" >}})).
- **mcp**: the read-only MCP server,
  [its own post]({{< relref "/posts/read-only-mcp-server.md" >}}).
- **drift**: compares the SSOT version index against what is actually
  running. This is the alarm for someone changing something outside git.
- **health / k8s / backup / netbox / truenas / adguard / network**:
  the operational verbs for each system, plus aggregation endpoints,
  DR helpers, and inventory sync.
- **media**: the library organizer and auditor. Its test suite came
  the hard way
  ([921 files in 50 seconds]({{< relref "/incidents/2026-04-19-audit-moved-921-files.md" >}})).
- **alert**: enrichment. When an alert fires, it attaches the context a
  human would go look up anyway.

## What the binary gives me

- **Tests exist.** The media subcommands carry e2e suites with fake
  upstream APIs and a fixed-point property test.
- **One release pipeline.** Every merge to main builds, scans, and
  tags. Releasing costs nothing, so I have 140 tags in three months.
  Rollback is pinning the previous tag.
- **Shared plumbing compounds.** The SOPS loader, the API clients, the
  logging, the retry logic, all written once, so subcommand 18 cost a
  fraction of what subcommand 2 did.
- **One binary everywhere.** The same binary runs in CI, on my laptop,
  and as a CronJob image in K8s, so there is no "works in cron but not
  interactively" class of bug.

Every incident since has been fixed by a tested change to the codebase. A Go module is heavier to start than a bash file, and the first few weeks were slow before the shared plumbing existed.
