---
title: wc3-server
date: 2026-10-12
lastmod: 2026-11-01
summary: A self-hostable private Warcraft III realm, native-host relay and map server, configured from one .env file.
tags: [warcraft-3, docker, go, networking]
slug: wc3-server
---

[wc3-server](https://github.com/PjSalty/wc3-server) composes three pieces so a group of friends can play together over the internet:

- **pvpgn**, the Battle.net realm (login, chat, custom game list), built from [pvpgn-pro-hardened](/projects/pvpgn-pro-hardened/).
- **wc3-relay**, the tunnel relay that lets a player host a game without touching a router.
- **wc3-mapd**, a read-only map library server, so every launcher syncs the same curated maps.

Everything comes from one `.env`. You set at least `PUBLIC_IP`, `REALM_NAME` and `RELAY_TOKEN`, then:

```bash
cd deploy
cp .env.example .env
docker compose up -d --build
```

You need a host with a public IP and the ability to forward ports. The repo ships no Blizzard files and no game data, and nothing in it contains a real address or secret. Players run [wc3-launcher](/projects/wc3-launcher/).

## Source

- GitHub: <https://github.com/PjSalty/wc3-server>
