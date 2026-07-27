---
title: "One-click Warcraft III hosting on your own PvPGN server"
date: 2026-07-18
summary: "A launcher that installs the game, points it at a private PvPGN realm, and makes native Create Game work through a relay so nobody has to forward a port."
tags: [warcraft-3, pvpgn, networking, go, wine]
types: ["build"]
topics: ["Networking", "Go"]
---

I wanted a group of friends to play classic Warcraft III: The Frozen Throne together on a private [PvPGN](https://pvpgn.pro/) realm, and I wanted the bar for joining to be one download. No CD-key hunting, no editing registry keys, no forwarding a port on anyone's router. Click a file, wait, play.

The launcher that came out of it is [open source](https://github.com/PjSalty/wc3-launcher). This is what it does and, more interestingly, how the hosting works, because native custom-game hosting on a classic realm has a genuinely awkward problem underneath it.

## What the launcher does

One binary, Windows or Linux. On first run it:

1. Fetches the game from Blizzard's own official free installer, so it never redistributes Blizzard's files. It only ships the open-source [W3L loader](https://github.com/w3lh/w3l) (which lets a classic client talk to a non-Blizzard realm) and community maps.
2. Points the Battle.net gateway at the realm by writing one `HKEY_CURRENT_USER` registry value. No admin rights. On Linux the same write goes into a self-contained Wine prefix that never touches the user's own `~/.wine`.
3. Launches the game.

Later runs skip straight to launch. On Linux it detects the distro, offers to install Wine with the exact command, and renders through DXVK because Wine's default D3D path crashes the game on some GPUs. The server address comes from config at run time, so the same build points wherever you point it.

That part is plumbing. The hosting is the part worth writing down.

## The problem: the realm advertises an address you can't reach

When you create a custom game on a classic realm, the realm (PvPGN) advertises it to everyone else at a single address:

```
<source IP of your realm TCP connection> : <the game port your client declared>
```

Both halves come from you, and behind NAT both are wrong for anyone outside your LAN. The IP is whatever the realm sees as the peer of your Battle.net connection, which is your router's WAN address with nothing forwarded back in. The port is the value the client sends, which the realm relays to joiners verbatim. So a joiner tries to connect to your home IP on a port your router drops, and times out.

This is why classic custom-game hosting normally means forwarding a port. The launcher removes that by owning both halves before the game is ever advertised, without patching PvPGN and without rewriting a single packet.

## The fix: a relay on the server, in two halves

Run a small relay daemon on the same box as PvPGN. Then:

**The IP half.** Point the client's Battle.net gateway at `127.0.0.1` and run a local proxy there. The proxy doesn't talk to PvPGN itself. It opens one outbound TLS tunnel to the relay, and the relay dials PvPGN. So the realm connection reaches PvPGN from the server's own address, and the realm advertises the server's IP, which every joiner can already reach. The proxy is a plain byte pump. It does not parse the stream, which matters, because the client opens the realm socket with a lone protocol-selector byte that is not part of the length-framed packet stream that follows. Anything that tries to parse it desyncs on the first byte.

**The port half.** When the tunnel comes up, the relay allocates a public port `P` from a forwarded pool and hands it back. The launcher writes that `P` into the client's own game-port registry value before launch, so the client itself declares `P`. The client also hosts locally on `P`.

A joiner connecting to `<server>:P` lands on the relay, which splices the connection back through the tunnel to the host's game listener. To the joiner it's a direct connection to the host. The server and the tunnel are invisible. Nobody forwarded a port except the server operator, once, for the relay's pool.

## The approach I didn't need

The first working version pinned the address by editing the realm protocol on the way past. The client sends a packet derived from its own UDP self-test that advertises the address it thinks it's reachable at, which behind NAT is the unreachable home IP. So the proxy dropped that packet, injected its own with the relay's address before the game-creation packet, and overwrote the game-port field. Roughly 400 lines of stateful protocol parsing, verified against the PvPGN source, and it worked.

Then the relay made all of it pointless. Once the realm connection is tunneled so it arrives from the server, the realm reads the right IP for free. Once the port is written into the client's config before launch, the client declares the right port itself. No packet surgery. I deleted the whole thing, and the proxy went back to being a byte pump. The interesting knowledge survives in the repo's history; the running code is simpler for not carrying it.

## Building your own

Nothing here is specific to my group. If you want the same thing:

- Stand up PvPGN on a box with a public IP (a small VPS is plenty). Forward the realm ports and a pool of game ports to it.
- Run the relay next to it. It's a single Go binary. Terminate TLS on it, gate it with a shared token so only your launcher can open a tunnel, and cap sessions per IP so an open port on the internet can't be used to exhaust it.
- Keep the launcher build generic and feed it the server address, token, and certificate pin at run time, from a first-run prompt, a flag, an env var, or a config file. Compiling them in is tempting because the repo stays clean, but the binary is the thing you hand out: anyone who gets a copy runs `strings` on it and has your token. Build-time injection moves the secret out of git and into the artifact you distribute most widely, which is the wrong direction.

Give your friends the binary. They click it once. That was the whole goal.
