---
title: "Encrypted secrets in Git with SOPS, Age, and ESO"
date: 2026-04-26
summary: "Encrypted secrets in Git. Flux decrypts a shared bundle, ESO splits it into per-namespace secrets."
tags: [sops, age, external-secrets, flux, secrets]
types: ["build"]
topics: ["Secrets", "Security", "Flux"]
---

I keep my Kubernetes secrets encrypted in Git with SOPS and Age. Flux decrypts one bundle, and External Secrets Operator (ESO) splits it into per-namespace secrets.

SOPS encrypts the values and leaves the keys in plaintext, so the file diffs cleanly. On a rotation PR I can see which key changed without decrypting anything. A re-encrypted username that should have stayed put shows up in the diff instead of hiding in ciphertext.

## Alternatives I ran first

SealedSecrets give me base64 ciphertext with no readable structure, so `git diff` only tells me the file changed. Rotating the controller key means re-sealing every secret.

Vault is a separate control plane to bootstrap, unseal, back up, and monitor. It pays off when secret access policy is itself the concern: audit logs of secret reads, dynamic credentials, PKI issuance. The homelab needs none of those, so I don't run it.

## Age over GPG

Age keys are short and single-purpose. No expiry, subkeys, web of trust, or keyring format to manage. I use Age here to skip GPG's keyring and key-lifecycle overhead on a single cluster.

## ESO for fan-out

Flux's built-in SOPS decryption produces one Kubernetes secret per encrypted file, which couples manifest layout to secret layout. A new namespace meant either duplicating secrets into a per-namespace file or wiring up postbuild substitution. ESO decouples the two.

```
secrets repo (sops yaml, age-encrypted, single source-of-truth)
        │
        │ flux gitrepository: secrets
        │ kustomization with decryption.provider=sops, secretref=sops-age
        ▼
one big secret cred-ssot-core in flux-system
        │
        │ external secrets operator
        │ per-namespace secretstore reads from that secret via clustersecretstore
        ▼
externalsecret manifests in app namespaces select specific keys
        │
        ▼
per-namespace secrets, scoped to just that app
```

Adding a namespace means writing an ExternalSecret that lists the keys you need. The secrets repo itself doesn't change.

## creationPolicy: Merge needs the secret to exist

ESO's `creationPolicy: Merge` needs the target secret to already exist before ESO can merge into it. Set `Merge` on the first apply, before the secret exists, and the ExternalSecret sits in `SecretSyncedError` forever with no error message explaining why. Default to `creationPolicy: Owner`. Use `Merge` only when an existing secret is owned by another controller and you want to add fields without taking ownership.

## Single-key caveat

SOPS-Age means every contributor holds the same private key on disk somewhere. That's fine for a single operator. A team would need per-recipient encryption with `sops updatekeys` on every commit, or a KMS-backed key that brings back the control plane. For one operator, SOPS plus a backed-up Age key covers it.

Bootstrap walkthrough:
[saltstice-homelab/how-to/bootstrap-Flux-with-SOPS-Age.md](https://github.com/PjSalty/saltstice-homelab/blob/main/how-to/bootstrap-flux-with-sops-age.md).
Trade-off ADR:
[docs/adrs/SOPS-Age-with-ESO.md](https://github.com/PjSalty/saltstice-homelab/blob/main/docs/adrs/sops-age-with-eso.md).
