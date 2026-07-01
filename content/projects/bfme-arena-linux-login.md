---
title: BFME Arena Linux login workaround
date: 2026-02-21
summary: Workaround for the BFME Arena login crash on Linux + Wine, bypasses the broken WPF PasswordBox.
tags: [linux, wine, python]
---

BFME Arena multiplayer runs fine on Linux under Wine. The login screen doesn't. WPF's `PasswordBox` control crashes the moment you click it under Wine, so there's no way to sign in through the UI.

So the script skips the UI and talks to the Arena server's REST API directly. It hashes the password the way the game does, `SHA256(SHA256(password))`, then writes the hashed credentials into the game's settings directory. The game's own auto-login feature reads them on the next launch and signs in without ever touching the broken control.

The plaintext password never gets stored. The credentials file holds the email and a hash prefixed with `H******`, which the game reads as already hashed.

## Source

- GitHub: <https://github.com/PjSalty/bfme-arena-linux-login>
- License: MIT
