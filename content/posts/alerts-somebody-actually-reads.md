---
title: "Alerting rebuild"
date: 2026-06-12
summary: "The rebuild: firing logic that reads each job's cron schedule, and alerts that verify their own metrics exist."
tags: [prometheus, alertmanager, observability, alerting, sre]
types: ["build"]
topics: ["Observability", "Alerting"]
---

My first alerting was a self-hosted push service with every alert forwarded raw, and the channel turned into noise.

## Cutting noise by category

Cronjob alerts that ignore the schedule were the worst. "Job hasn't succeeded in an hour" fires every night for a job that only runs nightly. The firing logic now reads each job's cron expression, so late gets measured against that job's own schedule instead of a global timeout.

Duplicate sources were next. Vulnerability scanning alerted from both the scanner and the policy reporter for the same CVE, so I picked one owner per signal and dropped the other. Then the stock kube-prometheus rules, things like quota-overcommit warnings that don't apply to this cluster's topology. Defaults are a starting inventory, and I dropped the ones that don't fit.

Last was threshold honesty. The disk-will-fill projection is tuned to fire when it needs handling within the week, but a faint upward trend doesn't fire it. If an alert can't tell you its deadline, it belongs on a dashboard.

## Enrichment at fire time

The worst version of an alert is a name and a namespace. When that's all you get, the first ten minutes of every response go to the same manual lookups. Firing alerts now route through an enrichment step, a subcommand of [the CLI]({{< relref "/posts/one-go-binary-for-all-automation.md" >}}), that attaches what I'd fetch by hand anyway: recent pod events, last restart times, the owning workload, and links to the matching dashboard and runbook. The alert shows up with its context already attached.

## Alerting on silence

Cilium [degraded silently for days]({{< relref "/incidents/2026-04-27-cilium-silent-degradation.md" >}}) because nothing watched the datapath. I fixed that with six new alerts on the signals that move during degradation. A media service shipped with five alerts pointing at metrics it never implemented, so they sat green for 119 days while wired to nothing.

Every alert rule now has to prove its metric exists. A meta-alert fires on `absent()` for any series an alert depends on, and the test suite pins alert expressions to metric names the code actually registers. Without that, you can't tell a healthy alert from a dead one.

