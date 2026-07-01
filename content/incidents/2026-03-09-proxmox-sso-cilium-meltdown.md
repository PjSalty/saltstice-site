---
title: "Proxmox SSO timeout caused by a stale Cilium BGP session"
date: 2026-03-09
summary: "Stale Cilium BGP session after a node reboot."
tags: [postmortem, proxmox, cilium, authentik, networking]
types: ["incident"]
topics: ["Proxmox", "Cilium", "BGP"]
---

I had issues logging into Proxmox. The OIDC redirect to Authentik worked and but the callback hung for 30 seconds, then errored with "connection refused."

I spent the first two hours sure Authentik had broken. Its logs showed it answering. The OIDC provider config was unchanged since Friday. I re-issued the Proxmox OIDC client secret, bounced the Authentik pods, and reset the pve OIDC realm but no luck.

## What pointed at the real issue

The Proxmox host could `curl https://auth.example.com/.well-known/openid-configuration` sometimes, but not from inside pvedaemon's shell. Pvedaemon was source-binding to the management interface (`<mgmt-ip>`) for the callback. My curl used the default route source (`<internal-ip>`). Same host, but the two source addresses took different return paths and one was broken.

## Root cause

The Cilium BGP session on `worker-2` had been half-up since Sunday night's planned reboot. The graceful-restart timer expired without the session re-establishing. MetalLB still had worker-2 in the pool, but the route to the Authentik pod's endpoint carried stale next-hops. Traffic that hashed to worker-2 black-holed silently.

Pvedaemon's source-bind hashed to worker-2 every time. My curl hashed to worker-1 or worker-3, both healthy. That is why "it works from the shell" misled me for two hours.

```bash
# should have run this first
ip route get <internal-ip> from <mgmt-ip>
ip route get <internal-ip> from <internal-ip>
```

## Fix

I bounced the Cilium agent pod on worker-2, the same issue as the [silent-degradation incident]({{< relref "/incidents/2026-04-27-cilium-silent-degradation.md" >}}) a that happend a month later. BGP re-established and the routes corrected. SSO worked.

## What I should have done

Test along the path the app actually uses. A curl from whatever shell is handy proves nothing about pvedaemon's source-bound path.

Document which services source-bind to which interfaces. Proxmox doesn't surface it.

