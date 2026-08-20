---
title: "A safety check exited 1 with nothing to say"
date: 2026-08-20
summary: "set -e plus pipefail plus 2>/dev/null turned a missing directory into a silent rc 1. The guard never reached the line that would have explained it, and I spent weeks believing it was refusing on purpose."
tags: [postmortem, bash, ansible, docker]
types: ["incident"]
topics: ["Automation", "Operations"]
---

Every fleet Ansible run had been failing on the same task for weeks. I had it written down as "the guard is refusing, the accounts are stranded, go fix the data". That was wrong. The guard wasn't refusing. It was dying before it could say anything.

Here's the whole failure, straight out of the job:

```json
{"msg": "non-zero return code", "rc": 1,
 "stdout": "", "stdout_lines": [],
 "stderr": "", "stderr_lines": [],
 "delta": "0:00:00.144881"}
```

Empty stdout and empty stderr. That's the tell. The guard writes its refusal to stderr and prints its counts to stdout on the line above, so if it had actually refused, one of those would have content. And 144 milliseconds is nowhere near long enough to have walked every Docker volume calling `find` on each one.

## The line

```bash
set -euo pipefail
dst=$(docker volume inspect app-state --format '{{.Mountpoint}}')
live=$(find "$dst/users" -type f 2>/dev/null | wc -l)
```

If `$dst/users` doesn't exist, `find` exits 1. The `2>/dev/null` throws away the message that would have told you why. `set -o pipefail` carries that 1 past `wc`, which succeeded. `set -e` kills the script right there, three lines in, before a single `echo`.

Reproduce it in one line:

```bash
$ bash -c 'set -euo pipefail; n=$(find /nope/users -type f 2>/dev/null | wc -l); echo $n'
$ echo $?
1
```

No output, either stream, rc 1. Byte for byte what the job reported.

The nasty part is that all three pieces are things I put there deliberately. `set -euo pipefail` is correct. `2>/dev/null` on a `find` that might hit a missing directory is a normal thing to write. `| wc -l` to count is normal. Each one is fine and the combination is a trapdoor.

The fix is to stop asking `find` to be the one that decides:

```bash
count_users() {
  local d="${1:-}" n=0
  if [ -n "$d" ] && [ -d "$d/users" ]; then
    n=$(find "$d/users" -type f 2>/dev/null | wc -l) || n=0
  fi
  echo "$n"
}
```

Check the directory exists first, and give the assignment its own fallback. Now a missing path is 0 and the script keeps going to the part that talks.

## The bigger bug underneath

Once the guard could speak, the actual problem was easier to see, and it was structural.

The guard compared account counts between the live named volume and any leftover anonymous volume, and failed if a leftover held more. Fine. But the migration that was supposed to move those accounts found its source like this:

```bash
docker inspect app-container --format '{{range .Mounts}}{{.Name}} {{.Destination}}
{{end}}' | awk '$2 == "/var/app/state" && length($1) == 64 { print $1 }'
```

It reads the mounts of the container that's running right now. That works exactly once: while the container is still mounting the old anonymous volume. The moment compose was switched to a named volume, the container stopped mounting the anonymous one, this printed nothing, the length-64 check went false, and the backup and copy steps skipped. On every run. Forever.

So the migration had no path to ever run again, while the guard in front of it kept failing the deploy. A guard with no route to resolution isn't a guard, it's a wedge.

The giveaway was sitting in the same file the whole time. The guard already scanned every anonymous volume to find the leftover. The finder only looked at one container. Two halves of the same job, looking in different places. When the check and the thing it checks disagree about where to look, one of them is wrong, and it's usually the narrower one.

## What it cost

`ansible:health-check` and the deploy notification both `needs:` the deploy job, so both got skipped every single run. One game server's volume question was suppressing the deploy signal for the entire fleet, and because the failure printed nothing there was nothing to read that would have corrected me.

## What I changed

The finder falls back to scanning orphaned volumes for one that actually holds account files, so it can find a source the running container no longer mounts. Counting can't crash the script. And the copy now decides on account counts instead of `ls -A`, because the old test asked "is there any file here", which meant a destination holding scaffolding and zero accounts read as "already populated" and got skipped.

One thing I deliberately did not automate. If both volumes hold accounts, they've diverged: the service ran on the new volume and users registered there while the old one still held the originals. The copy stops and prints both counts and both volume names. This particular app names account files by UID and a fresh database restarts numbering, so the same filename is a different user on each side, and a merge would hand one person another person's account. That one needs a human to pick which side is authoritative.

The check I care about most now: the guard prints its numbers before it decides anything. If it fails again it says which volume and with what counts. That output is the first real information I've had about this.
