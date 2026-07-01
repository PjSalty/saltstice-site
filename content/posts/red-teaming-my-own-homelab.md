---
title: "Adversarial security audit of the homelab"
date: 2026-06-12
summary: "Two adversarial reviews produced 33 findings. Fixes: BGP MD5 auth, Kyverno runAsNonRoot in enforce mode, a Cilium host firewall rebuilt from observed ports, and SOPS regex gaps that left fields in plaintext."
tags: [security, kubernetes, kyverno, cilium, bgp, sops]
types: ["note"]
topics: ["Security"]
---

I ran two structured adversarial reviews of the homelab this year. The model: assume the attacker is already on the network, walk every trust boundary, write down what's exploitable. First pass produced 33 findings, most of them unrevisited defaults.

The fixes came to 20+ MRs. Here are the highlights and what each one taught me.

## BGP sessions had no authentication

MetalLB peers with the MikroTik router over BGP, and anyone on that VLAN could have peered too and advertised themselves as my ingress. MD5 auth on both ends fixes it: `passwordSecret` on the MetalLB BGPPeer, `tcp-md5-key` on the RouterOS side. RouterOS 7 gotcha: the key goes on `/routing/bgp/connection`. The old template syntax from every RouterOS 6 forum post silently doesn't apply it.

## Enforcing runAsNonRoot

Kyverno's runAsNonRoot policy was in audit mode, so most workloads ran as non-root but stragglers slipped through. Flipping it to enforce surfaced every one at admission time.

- Postgres images chown their data dir at init. Fix is an init container that owns the chown plus a Recreate strategy, then the main container runs unprivileged.
- A couple of NFS-touching workloads needed scoped PolicyExceptions: narrow, named, and reviewable in git.

Zero root containers now outside the documented exceptions.

## Plaintext fields in git

Auditing the SOPS rules turned up 11 fields across the repos that looked encrypted (the file was a `.sops.yaml`) but weren't covered by the `encrypted_regex`. Fix was widening the regex and re-encrypting, plus a check that greps for the ENC marker on every field that should have one.
