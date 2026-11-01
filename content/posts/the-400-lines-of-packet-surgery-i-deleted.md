---
title: "The 400 lines of packet surgery I deleted"
date: 2026-10-13
summary: "The first design pinned a hosted game's advertised address by editing the Battle.net realm stream in flight. It worked, it was verified against PvPGN source, and a simpler design made every line of it pointless."
tags: [warcraft-3, pvpgn, networking, go]
types: ["build"]
topics: ["Networking", "Go"]
slug: the-400-lines-of-packet-surgery-i-deleted
---

The [one-click Warcraft III launcher](https://github.com/PjSalty/wc3-launcher) has a footnote in its architecture doc: the first working design pinned a hosted game's address by rewriting the realm protocol in flight, then got deleted whole. This is that footnote at full length. It's the better story, and a clean case of the clever design losing to the boring one.

## The problem it was solving

When you create a custom game on a classic realm, PvPGN advertises it to everyone else at exactly one address:

```
<source IP of your realm TCP connection> : <the port your client declared>
```

Behind NAT both halves are wrong. The IP is your router's WAN address with nothing forwarded in. The port is whatever your client announces in `SID_NETGAMEPORT`, read off its own registry. A joiner takes that pair, connects, and times out. That's the whole reason classic hosting means forwarding a port.

So the first idea was the obvious one: if the realm advertises a bad address, sit in the middle of the realm connection and fix the address on the way past. Point the client's Battle.net gateway at a local proxy, have the proxy speak to PvPGN, and edit the BNCS stream so the game gets advertised at an address that actually works.

## The three edits

The client's realm session is a stream of length-framed BNCS packets, each tagged with a message id. Pinning the address meant catching three of them, verified line by line against the PvPGN 1.99 source so the edits matched exactly what the server would parse back out:

1. **Drop `SID_CLIENT_UNKNOWN_1B` (0x1b).** The retail client derives this one from its own UDP self-test and uses it to advertise the address it thinks it's reachable at. Behind NAT that's the unreachable home WAN address, so the packet had to go.
2. **Inject our own `0x1b`** carrying the relay's address, timed to land before `SID_STARTADVEX3` (0x1c), the game-creation packet, so PvPGN had the right host address in hand before it created the game.
3. **Overwrite `SID_NETGAMEPORT` (0x45)** with the relay's port.

That's roughly 400 lines: a BNCS framing parser, a stateful rewriter (`GameHostRewriter`) that tracked where it was in the login handshake, and the tests to prove each edit produced bytes PvPGN would accept. It parsed cleanly, it passed, and measured against the protocol it was correct.

## Then it never had to run

While that code was being written, the other half of the launcher grew a relay: a small daemon on the same box as PvPGN, and a single outbound TLS tunnel from the launcher to it. The tunnel existed to carry joiners back to the host without a forwarded port. But it quietly solved the advertised-address problem too, and better.

The IP half falls out of tunneling the realm session itself. If the launcher's local proxy doesn't dial PvPGN, and instead hands the connection to the relay so the relay dials PvPGN from the server, then PvPGN reads its peer address off a server-side socket. The advertised IP is the server's, which every joiner can already reach. No `0x1b` to drop, no `0x1b` to inject, because the address is pinned by where the connection comes from, not by what it says.

The port half falls out of writing the config before launch. The relay allocates a port from a forwarded pool and hands it back when the tunnel comes up. Write that value into the client's own `netgameport` before the game starts, and the client declares the right port in `SID_NETGAMEPORT` all by itself. No `0x45` to overwrite.

Both edits the rewriter existed to make were now made for free, upstream of the byte that would ever have been touched. The rewriter's constructor was already being called with its rewrite hook set to `nil`; the only thing exercising the surgery was its own test suite. It had, in the honest sense, never run.

So it got deleted: 477 lines out, the framing parser, the rewriter, and their tests, in one commit whose message is just an inventory of what packet surgery it stopped doing.

## The scar it left

Deleting the parser wasn't only removing dead weight. It's what let the proxy become correct.

The proxy that's left copies the realm session byte for byte and refuses to look inside it. That's not laziness, and the comment in `internal/bnetgateway/gateway.go` says as much: parsing the stream would be a bug. Warcraft III opens the realm socket with a lone `0x01` protocol-selector byte that is not part of the length-framed BNCS packet stream that follows it. Anything that tries to read the session as packets desyncs on that very first byte, and the login never completes.

The old rewriter got away with it because it knew about the `0x01` and stepped over it before framing. A pure byte pump doesn't need to know anything: it forwards the `0x01`, forwards every frame after it, and never has an opinion that can be wrong. The end-to-end test now leads with `0x01` on purpose, as the regression guard that keeps anyone from teaching the pump to parse again. The one piece of hard-won protocol knowledge that survives in the running code is a single sentence about a byte you must not touch.

## What stayed

The rewriter was the more interesting code. It was also wrong to keep. Its comments described production behavior that didn't exist, and the repo ended up with three different explanations of how hosting worked, the most confident of which was false. It was correct, tested and verified against the PvPGN source, and deleting all of it was still the right call.

The address never needed editing. The connection needed to arrive from the right place, and the client needed the right port before it opened its mouth. Two config writes and a tunnel did that.

The launcher is at [wc3-launcher](https://github.com/PjSalty/wc3-launcher) (v1.3.11 as of this writing), and the realm it talks to is built from [pvpgn-pro-hardened](https://github.com/PjSalty/pvpgn-pro-hardened). The surgery is in the launcher's history if you want to read it.
