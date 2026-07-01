---
title: "Audit job moved files, then Flux reverted the kubectl suspend"
date: 2026-04-19
summary: "A new media library-audit step mis-parsed season numbers and relocated 921 files in under a minute. The fix caused a second incident when Flux reverted the CronJob suspend I had applied with kubectl."
tags: [postmortem, automation, gitops, flux, zfs]
types: ["incident"]
topics: ["Automation", "Storage"]
---

The media library has a nightly audit job that handles naming, season folders, and duplicate merges. I shipped a new wrong-season detection step and ran it once by hand to see what it would do. It relocated 921 files in 50 seconds.

Half of them came back named `S01E23mkv` and vanished from the media server's scanner. Most of the rest got shoved into `Season 1` folders they did not belong in.

That night at 03:00 the audit ran anyway. Flux had reverted my kubectl patch on the next reconcile, and the suspend had never been in git, so it did not exist as far as the controller was concerned. The new rename step brought its own parser bug and renamed 282 movie folders:

```
Ant-Man (2015)                          ->  Ant (2015)
Avengers - Endgame (2019)               ->  Avengers (2019)
Ant-Man and the Wasp - Quantumania (2023) ->  Ant-Man And The Wasp (2023)
```

So I ended up with 921 mis-seasoned files and 282 mangled movie folders, from two different bugs, and the second one only ran because my kubectl suspend was never a real stop.

## Root cause

Two parser bugs stacked. The extension handling dropped the dot, so renamed files came out as `S01E23mkv`, which is a valid filename and completely invisible to the scanner. The season regex only matched `S01E23`-style names, so release names like `Show S2 - 01` fell through to a looser pattern that defaulted to Season 1, and about 794 files got yanked out of their correct season folders. The job runs against the whole library in a single pass, so both bugs applied at full speed. 50 seconds, 921 files.

A `kubectl patch` suspend against a Flux-managed CronJob is not a real suspend. Flux reverts it on the next reconcile because the suspend was never committed to git. Its release-group regex misfired on hyphenated compound titles, which is how `Ant-Man` became `Ant`.

## Fix

Every audit action gets logged with its before and after paths, and a rollback subcommand replays the log in reverse. 921 of 921 file moves reversed. 25 files had been overwritten and came back from the weekly ZFS snapshot instead. All 282 folder renames reversed the same way. Then the corrected audit ran for real and fixed 398 of 401 genuine issues, including 127 files that actually were in the wrong season.

## What I changed

- A defense gate. Renames refuse to apply if the new name loses words that are not recognizable release junk. The gate is parser-independent, so it catches what the next parser bug misses. On its first real run it refused 14 dangerous renames, and all 14 were bugs.
- A mandatory full-library dry-run for any audit step that can touch many files, before it gets anywhere near the schedule.
- Suspends go through git now. A `suspend: true` commit is the only stop that survives reconciliation. A kubectl patch against a Flux-managed object gets reverted.
- Rollback ships with the tool. The action log and the rollback subcommand are part of it, and every destructive batch records its own undo.

A month later a different classifier bug tried to scatter 852 files into more than 500 single-file folders. A pack-integrity gate refused the batch, because one incoming pack should never fan out across hundreds of destinations.
