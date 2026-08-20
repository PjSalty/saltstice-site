---
title: "A host failed in the first play and the recap still looked fine"
date: 2026-08-20
summary: "New VM reported ok=62 changed=37 failed=1, which reads like a host that mostly worked. All 62 were base-play tasks. Its actual role never ran a single task, because a host that fails in one play is dropped from every later one."
tags: [postmortem, ansible, docker, promtail]
types: ["incident"]
topics: ["Automation", "Operations"]
---

I spent a while reviewing a role that was never getting the chance to run.

New VM, new service, first converge. The play recap:

```
newhost : ok=62 changed=37 unreachable=0 failed=1 skipped=3
```

One failed task out of 63. That reads like a host that basically worked and needs one thing fixed. So I went and looked at the service role, found some things I didn't love, and started rewriting.

All 62 of those tasks are from the base play. The service role didn't execute a single task.

## Why

Ansible drops a host from the rest of the run once it fails. Not just the current play, the whole remaining playbook. The failure happened in the first play, "base OS configuration, all hosts", so the host was gone before the play that actually deploys the service.

The recap doesn't distinguish. It sums everything the host did across all plays it survived, and 62 base-play tasks is a perfectly healthy-looking number. Nothing in that line tells you the host never made it to the play you care about.

## The failing task

```
TASK [promtail : Add promtail user to docker group]
fatal: [newhost]: FAILED! => {"msg": "Group docker does not exist"}
```

The log shipper role runs in the base play, on all hosts, first. Every play that installs Docker runs later: the infrastructure hosts, the CI runner, the game server, the VPN box, and now this one.

So on a host that has never converged before, the `docker` group genuinely does not exist yet when the log shipper asks to join it, and `ansible.builtin.user` treats a missing group as fatal rather than as something to create or skip.

This is not a quirk of the new service. It's a first-run bug for any new Docker host. It went unnoticed for a long time because every other Docker host had already been through an earlier run, so the group was left over from last time. The playbook only worked because the hosts were old.

## Fix

Look the group up and skip if it isn't there. Ansible converges, so the membership lands on the next run once the Docker role has created it.

```yaml
- name: Look up the docker group
  ansible.builtin.getent:
    database: group
    key: docker
    fail_key: false
  when: scrape_docker

- name: Add the log shipper to the docker group
  ansible.builtin.user:
    name: promtail
    groups: docker
    append: true
  when:
    - scrape_docker
    - ansible_facts.getent_group is defined
    - ansible_facts.getent_group.get('docker') is not none
```

One catch on `getent`: with `fail_key: false` a missing key is set to `None` rather than left undefined. So the absence test is `is not none`, not `is not defined`. The key is always there once the lookup runs, it's the value that tells you.

I thought about pre-creating the group instead, which would get the membership one run earlier. Skipped it. That means inventing a root-equivalent group on hosts that may never install Docker, and picking a GID the Docker package then has to accept. Converging on the next run is the cheaper half.

## The thing I'd want to catch next time

A recap line is a sum, not a claim about coverage. `failed=1` on a host tells you a task failed. It does not tell you how much of the run that host missed, and on a multi-play playbook those are very different numbers. If you want to know whether a role ran, check for its tasks, not the recap.

There's also a loose end I couldn't close from where I was standing. The Docker scrape reads files, `/var/lib/docker/containers/*/*-json.log`, not the socket, and membership in the `docker` group is what grants the socket. On Debian `/var/lib/docker` is root-owned 0710 and `containers/` is 0700. So if the shipper runs as its own unprivileged user, that group may grant nothing toward the path it actually reads, and the Docker scrape may never have produced a line. Checking that needs the live file modes or a query against the log store. Worth knowing before you trust a scrape config that has never been proven to match a file.
