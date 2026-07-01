---
title: "homelab-cli: Go binary for homelab automation"
date: 2026-06-12
summary: One Go binary that runs the homelab's automation, with an embedded read-only MCP server and a release on every merge.
tags: [golang, automation, mcp, cli]
---

I run the homelab's automation out of one Go binary instead of a pile of one-off scripts. It handles credential rotation against a SOPS source of truth, drift detection, health aggregation, backup orchestration, NetBox inventory sync, media-library organizing, and alert enrichment. It also embeds a read-only MCP server that exposes the infrastructure APIs read-only.

My rule is no new scripts. Anything worth automating gets types, tests, and a release pipeline. CI cuts a release on every merge to main. The same binary runs as a CronJob image, a CI step, and a command on my laptop.

The repo is private. It hard-codes too much about this specific environment to scrub into something reusable. I wrote up the parts that generalize:

- [one go binary for all the automation]({{< relref "/posts/one-go-binary-for-all-automation.md" >}})
- [a read-only MCP server for the whole homelab]({{< relref "/posts/read-only-mcp-server.md" >}})
- [credential rotation as a pipeline]({{< relref "/posts/credential-rotation-as-a-pipeline.md" >}})
- [the audit that moved 921 files in 50 seconds]({{< relref "/incidents/2026-04-19-audit-moved-921-files.md" >}})
