---
title: "Jellyfin native apps and PublishedServerUrl"
date: 2026-06-12
summary: "The native apps failed on the LAN while the browser worked everywhere. Fixed with PublishedServerUrl and a hairpin NAT rule."
tags: [jellyfin, networking, nat, dns]
types: ["runbook"]
topics: ["Jellyfin", "Networking", "DNS"]
---

## The problem

Jellyfin works in a browser from anywhere, but the native apps don't. Firestick, iOS, and Android all hit "no server found" on the home network, or they connect fine from outside and then break the moment I get home.

The apps auto-switch. When they decide they're near the server, they drop the address I typed and use the server's advertised LocalAddress instead. My LocalAddress was an internal-only hostname. Phones resolve DNS publicly, so the lookup comes back NXDOMAIN and the app reports no server. The web UI never does the switch, which is why it kept working the whole time.

## Fix one, PublishedServerUrl

Set `JELLYFIN_PublishedServerUrl` on the container to a publicly resolvable FQDN. Include the port if it's non-standard. My ISP blocks 80, so the public port is 8443.

```yaml
- name: JELLYFIN_PublishedServerUrl
  value: https://jellyfin.example.com:8443
```

## Fix two, hairpin NAT

The LAN still has to reach that public address. That's hairpin NAT on the router, one dstnat rule on RouterOS.

```
/ip firewall nat add chain=dstnat dst-port=8443 protocol=tcp \
  in-interface-list=LAN action=dst-nat to-addresses=<ingress-ip> to-ports=443
```

Plus the usual masquerade for hairpin.

## Verify

```
curl https://jellyfin.example.com:8443/System/Info/Public | jq .LocalAddress
```

If LocalAddress still shows the internal name, the env var didn't take.
