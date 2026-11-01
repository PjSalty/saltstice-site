---
title: wc3-launcher
date: 2026-10-12
lastmod: 2026-11-01
summary: A one-download Warcraft III launcher for a private PvPGN realm. Hosting a game needs no port forwarding.
tags: [warcraft-3, go, networking, wine]
slug: wc3-launcher
---

[wc3-launcher](https://github.com/PjSalty/wc3-launcher) is a single Go binary for Windows and Linux. It downloads a preconfigured Warcraft III 1.28.5 folder and the W3L loader, points the Battle.net gateway at the server with one `HKEY_CURRENT_USER` registry value (the game's own Wine prefix on Linux), and starts the game.

Hosting is the interesting part. A player clicks the game's own Create Game button and friends see it in Custom Games. Nobody forwards a port. The launcher tunnels the realm session through the server, so the realm sees the connection arriving from the server's address, and it writes the port the server handed it into the game's config before launch, so the client declares that port itself. Joiners connect to the server and get spliced back through the same tunnel. No packets are rewritten and the realm is stock.

The game client comes from Blizzard's official free endpoint, so the launcher never redistributes Blizzard's files. You need to own the game. Reforged (1.29 and newer) can't connect to a classic PvPGN server, so the bundle pins 1.28.5.

Latest release is v1.3.11 (2026-10-12). The first design edited the realm stream in flight, and I threw it away: [the 400 lines of packet surgery I deleted](/posts/the-400-lines-of-packet-surgery-i-deleted/). The server side is [wc3-server](/projects/wc3-server/).

## Source

- GitHub: <https://github.com/PjSalty/wc3-launcher>
