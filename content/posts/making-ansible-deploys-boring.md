---
title: "Fixing flaky Ansible deploys"
date: 2026-06-12
summary: "Deploys passed on 3 to 15 of 15 hosts per run. Fixes: a dedicated runner VM, deploys scoped from the git diff, SSH tuning, and pinning every image reference instead of writing :latest."
tags: [ansible, ci, gitlab, networking, reliability]
types: ["build"]
topics: ["Ansible", "CI"]
---

The Ansible deploy pipeline passed on anywhere from 3 to 15 of 15 hosts per run. Same playbooks, same hosts. Once a pipeline is that unreliable you stop reading the failures.

I audited the whole CI path. The flakiness was several separate bugs, and the worst one was architectural.

## Runner was on the wrong VLAN

Deploy jobs ran in ephemeral pods inside the Kubernetes cluster, which sits on its own VLAN. Every SSH connection to a target VM crossed VLANs through Cilium's masquerade path. That produced connection resets that tracked with pod placement and node load, so SSH stability came down to which node the CI pod happened to land on.

Fix: a dedicated runner VM on the infrastructure VLAN. Docker executor, host networking, plain L2 to every target. The connection resets stopped.

In-cluster runners still handle the build jobs, but anything that SSHes into infrastructure runs on the VM.

## Scoped deploys from the git diff

Every merge re-ran every role against all 15 hosts, so a flake anywhere failed the pipeline, and a one-role change got 15 hosts' worth of chances to break.

A script now maps the git diff to the affected roles and host groups, and the deploy runs with `--limit` and `--tags` derived from that. A change to the Harbor role touches only the Harbor VM. The blast radius and the flake surface shrink to the size of the change.

## Smaller fixes

- SSH client tuning for CI: connect timeout 60s, retries 3, ControlPersist 300s, ServerAliveInterval 15. The defaults assume a human at a terminal, but these runs are batch SSH against a dozen hosts.
- APT Signed-By conflicts: years of accumulated repo definitions meant `apt_repository` kept tripping over old entries. Pre-tasks now delete the stale files explicitly, keys get `gpg --dearmor`ed to binary, and repo files get written with the copy module.
- Digest-pinned CI images: 18 of 19 job images pinned to sha256 digests. The 19th is the next section.

## The :latest incident

A docker-compose template for GitLab itself had `:latest` in it. A routine deploy pulled a version four minor releases ahead, skipping the supported upgrade path, which GitLab does not handle gracefully. Recovery was manual: I walked the database migrations back onto the supported path, on the one VM that hosts every repo.

Every image reference in every template is pinned now, and Renovate owns the bumps. Version bumps go through a reviewed MR.
