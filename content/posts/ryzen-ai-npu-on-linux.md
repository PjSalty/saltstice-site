---
title: "Running models on the Ryzen AI NPU from Linux"
date: 2026-11-01
summary: "AMD's Ryzen AI 1.9.0 stack in a rootless container on the in-tree amdxdna driver. What ran on the NPU, what didn't, and how I proved the NPU did the work."
tags: [npu, amd, linux, onnx, podman]
types: ["build"]
topics: ["Linux", "Hardware"]
slug: ryzen-ai-npu-on-linux
---

The NPU in a Ryzen AI 9 HX 375 laptop is usable from Linux without installing anything on the host. The setup is in [linux-ryzen-ai-npu](/projects/linux-ryzen-ai-npu/). Here's what I measured.

## Setup

AMD's Ryzen AI Software 1.9.0 runs inside a rootless Podman container. The container sees only `/dev/accel/accel0`, which comes from the kernel's in-tree `amdxdna` driver (Linux 6.14 and newer) and the NPU firmware that `linux-firmware` already ships. There's no DKMS package, kernel module, udev rule or firmware to install. AMD supports Ubuntu 24.04 and the image carries that user space, so it also runs on other distros. I tested on Arch.

The repo contains none of AMD's software. A script downloads the two archives from AMD and checks their SHA-256 after you accept the EULA.

## Results

All numbers are from a quiet machine, same model and same input on each device.

| Workload | CPU | iGPU | NPU |
|---|---|---|---|
| SigLIP 2 base, 224 px | 72.2 ms, 1.24 J | 6.8 ms, 0.31 J | 55.7 ms, 0.23 J |
| Depth Anything 3 Small, 504 px | 238 ms, 4.24 J | 44.2 ms, 1.76 J | 183 to 246 ms, 0.9 to 1.1 J |

The whole graph runs on the NPU for both models, in BF16. The NPU wins on energy and the iGPU wins on speed. For SigLIP 2 that's 0.23 J per image against 0.31 J, and the NPU uses 0.05 J above idle.

The NPU clocks down when the SoC is idle. Setting the performance power mode needs root on the host:

```bash
sudo xrt-smi configure --pmode performance
```

In a same-session A/B that took SigLIP 2 from 57.5 ms to 19.1 ms and Depth Anything 3 from 246 ms to 92 ms, at about the same energy per image. A rootless container can't set it (`DRM_IOCTL_AMDXDNA_SET_STATE` returns permission denied), so it stays a host step.

Depth Anything 3 Small compiles for the NPU in about 22 minutes on one nice'd core. Accuracy against the reference: mean absolute relative error 3.3% (worst 4.4%), delta1.25 of 1.0, and a Pearson correlation of 0.993.

## What didn't work

Open Image Denoise at 1920x1280 doesn't fit the NPU:

- BF16 doesn't compile in practical time. A 256x256 UNet didn't finish in 9 minutes, and compile time grows with pixels.
- INT8 compiles in seconds, with 165 of 167 ops on the NPU at 472 ms per frame. But the output is 14.8 dB, identical to the CPU quantized run, so the NPU is faithful to a quantization that is just bad. Per-channel weights looked better in CPU simulation and still weren't usable, and those figures are CPU simulation, not NPU output.

The iGPU running OIDN's own HIP backend takes 82.4 ms per frame at 66.5 dB, against 920 ms on the CPU. That's where OIDN stays.

## Proof that the NPU ran

This is the part I'd copy. One of my first Depth Anything compiles got to the last step and then failed. The runtime writes two signature files into the working directory during a compile and copies them into the cache at the end. A sync I was running with `--delete` removed them mid-compile.

The execution provider skipped the subgraph and ran all 857 nodes on the CPU, at 2.3 seconds per image, with no error. The only thing that caught it was a guard that checks the NPU's own busy counter moved during the run. Every NPU number above comes from a run where the provider loaded and the busy counter moved.

AMD's quicktest has the same weakness. It reported green when the execution provider failed to load, because `libncurses6`, `libpython3.12t64` and `libgomp1` were missing from the image. They're in the image now.
