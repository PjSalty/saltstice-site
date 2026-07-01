---
title: "Nightly media audit rename loops and an unsafe title rescue"
date: 2026-06-10
summary: "A nightly Jellyfin library audit renamed the same files every night across three loops, and a title rescue tried to trim Spider-Man into Spider (2022). A dry-run and a fixed-point test caught both."
tags: [postmortem, automation, testing, jellyfin]
types: ["incident"]
topics: ["Automation"]
---

A watcher organizes incoming files into the Jellyfin library, and a nightly audit job keeps the library consistent: naming, folder layout, dedup, metadata matchability. Over a month the symptoms piled up: movie folders with junk names like "Apex MULTI DV", items Jellyfin couldn't match.

I let it run for weeks because the nightly report only ever showed a tiny diff, and every line looked plausible on its own, so I never read it closely. When I finally sat down with the logs, the same files were changing every night. Three separate loops, all the same shape: two audit steps with slightly different opinions about the correct form, one winning each night and the other winning the next.

## Root cause

Three ping-pong loops:

- Step 1 wanted `[1993]` in a filename, step 14 wanted `(1993)`. One won each night, the other won the next. Forever.
- Step 3 merged a duplicate folder, step 4 evicted a file from the merge target because its comparison was apostrophe-sensitive and the merge wasn't.
- A filename dot-fixer used a regex with non-overlapping matches, so "A.B.C.D" lost one dot pair per night instead of all of them. It converged eventually, after enough nights.

Each one looked like a tiny diff in the nightly report, and every line looked plausible, which is why the whole thing ran for a month before anyone read it properly.

## Fix

I killed the whole class with one property test: run the full audit twice against a copy of the library, and the second run must change nothing. If step N undoes step M, the second run shows it immediately. The fixed-point test caught two more loops nobody had noticed in the logs.

## The fix that almost made it worse

Part of the cleanup was a title rescue: take a junk folder name and trim trailing release tokens until the remainder exactly matches a TMDb title and year. An exact match against a real metadata source, which I figured was safe. The mandatory full-library dry-run said otherwise:

```
Spider-Man No Way Home (2022)  ->  Spider (2022)
Monster Hunter (2021)          ->  Monster (2021)
Les Miserables (2012)          ->  Les (2012)
```

All exact TMDb matches. TMDb is dense with obscure one-word titles in every year, so "trim until something matches" trims real title words and lands on a different movie. Two folders resolved onto the same target, which would have merged two unrelated movies.

An exact match against a real metadata source does not make the operation safe on its own. The rescue may now only trim tokens it can positively identify as release junk: quality tags, codec tags, uploader handles, digits, short fragments. Any real word left over and the rescue refuses, along with every shorter candidate.

## Two more finds

The same audit turned up two more:

- Folders with zero playable media (rar sets, disc images, stray software) fell through a classify fallback, the organizer planned no moves for them, and the cleanup pass deleted the whole folder as "already organized". Silent deletion. Cleanup now refuses to remove any folder still holding archive or disc files.
- The job manifest documented `DRY_RUN=true` as the preview switch, but the binary only read a `--dry-run` flag, so the documented safety switch ran a real audit. There's a regression test now that runs with the env var set and asserts zero disk changes.

Every destructive batch job here now runs a full dry-run against the live dataset before any rollout.
