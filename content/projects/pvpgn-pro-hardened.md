---
title: pvpgn-pro-hardened
date: 2026-10-11
lastmod: 2026-11-01
summary: PvPGN-PRO built with the full OpenSSF mitigation set, fuzzed packet parsers, and a signed reproducible image.
tags: [security, cpp, warcraft-3, fuzzing]
slug: pvpgn-pro-hardened
---

[pvpgn-pro-hardened](https://github.com/PjSalty/pvpgn-pro-hardened) is a drop-in replacement for a stock PvPGN-PRO build: same `bnetd`, same config, same ports. Only the build, the tests and the release pipeline change. GPL-2.0.

Everyone self-hosting a classic Warcraft III realm runs the same C++ daemon, and it parses untrusted bnet and w3route traffic straight off the internet. The last tagged upstream release is from 2018. This tree is brought current with upstream `master` (104 commits past that tag) and then hardened, not rewritten. The goal is that a memory-safety bug in a packet parser becomes a clean crash and restart, not a code execution primitive.

## What changes

- Built per the OpenSSF compiler hardening guide: full RELRO, `-fstack-protector-strong`, `FORTIFY_SOURCE=3`, stack-clash protection, CET, `_GLIBCXX_ASSERTIONS`, and `-ftrivial-auto-var-init=zero`. A `checksec` script gates every build, and the image won't build if a mitigation is missing.
- `-Werror=format-security`, so format string bugs fail the build.
- libFuzzer harnesses on the packet parsers under ASan and UBSan. Findings so far include an out-of-bounds read past the packet buffer, an `offset + len` integer overflow that slipped past a length check, and a short-input over-read in the tag decoders. Each fix was checked not to change behavior for valid traffic.
- A signed container image with an SBOM and build provenance.

The latest tag is v0.1.3. The realm I run from it uses a read-only root filesystem and a seccomp allowlist of 164 syscalls. The full flag set and how to verify it are in the repo's `HARDENING.md`.

## Source

- GitHub: <https://github.com/PjSalty/pvpgn-pro-hardened>
- License: GPL-2.0
