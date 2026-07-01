---
title: "Authentik SSO for homelab services"
date: 2026-06-12
summary: "22 OIDC applications and 2 forward-auth proxies behind one Authentik, wired by an idempotent blueprint Job. Notes the policy engine default that evaluates to allow-all."
tags: [authentik, sso, oidc, security, kubernetes]
types: ["build"]
topics: ["Authentik", "Security"]
---

Every service in my homelab authenticates through one Authentik instance. 22 applications speak OIDC directly: Proxmox, TrueNAS, GitLab, Harbor, Grafana, Jellyfin, NetBox, and the rest. The handful that can't speak OIDC, status dashboards and a couple of admin UIs, get Traefik forward-auth through Authentik proxy providers. I authenticate once and hit MFA once, and session revocation and the audit log both live in one place.

Two API lessons from building it:

- Fetch objects by their slug endpoint directly. The list-filter endpoint does substring matching, and `app` once matched `my-app-2`, so the Job converged the wrong application.
- Client secrets come from the credential SSOT, go through the secrets pipeline, and the Job reads them only from the mounted secret. The script holds zero literals.

## Forward-auth notes

The proxy outpost runs in-cluster. Its controller creates its own Deployment at runtime, so it needs RBAC to do that. That dependency stays invisible until a cold boot, when the outpost can't assemble itself and every forward-auth app 503s. Full story in the [power-loss postmortem]({{< relref "/incidents/2026-04-17-full-site-power-loss.md" >}}). The ServiceAccount and namespace-scoped Role live in git now.

Session lifetime is the other thing I set on purpose. OIDC apps manage their own token lifetimes, but forward-auth apps inherit the proxy session, so I decide which app gets which. An admin UI shouldn't hold a 30-day session just because the proxy defaults to one.

Adding a service to the homelab now means adding its SSO definition in the same MR that deploys it.
