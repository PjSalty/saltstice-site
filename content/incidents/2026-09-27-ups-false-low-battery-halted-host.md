---
title: "A false low-battery signal halted the whole host"
date: 2026-09-27
summary: "NUT raised low battery while the UPS was on mains, and a scheduler hook ran a forced shutdown with no on-battery check."
tags: [postmortem, ups, nut, proxmox]
types: ["incident"]
topics: ["Operations", "Proxmox"]
slug: 2026-09-27-ups-false-low-battery-halted-host
---

At 19:29 CDT on 2026-09-27 `upsmon` on the Proxmox host logged `battery is low`, then `Signal 10: User requested FSD`. The host halted, the UPS cut its outlets, and the server's AC power recovery setting brought it back about 12 minutes later.

The UPS was fine. Input was 120.9 V, charge was 100%, estimated runtime was 684 seconds, and status was `OL` the whole time. No `ONBATT` line was ever logged.

## Two config choices

In `ups.conf`:

```
ignorelb
override.battery.runtime.low = 480
override.battery.charge.low = 40
```

With these the driver derives the low-battery flag from the thresholds even while on line power. The runtime estimate swings between 608 and 864 seconds at about 47% load, and the driver was also logging `nut_libusb_get_report: Input/Output Error`. So the estimate dipped under 480 and the flag went up.

In `upssched.conf`:

```
AT LOWBATT * EXECUTE lowbatt-shutdown
```

The command behind it ran `upsmon -c fsd` unconditionally. That skips upsmon's own rule, which only acts when the UPS is on battery and low at the same time.

## Collateral

The three workers logged `Aborting journal on device` for their iSCSI volumes, because the guests were stopped with the storage still attached. One worker's Postgres hit an ext4 error and a read-only remount.

## The fix

Merged and applied on 2026-09-28: drop the `LOWBATT` handler and let upsmon's own logic decide. In the following 36 hours there was no forced shutdown. A follow-up orders the iSCSI logout after the pods stop.

If you see `battery is low` from NUT, look for an actual `ONBATT` line before blaming mains:

```
{hostname="proxmox-salty", unit=~"nut.*"} |= "battery is low"
```
