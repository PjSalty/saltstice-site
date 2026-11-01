---
title: linux-ryzen-ai-npu
date: 2026-11-01
summary: Run ONNX models on the XDNA 2 NPU of a Ryzen AI laptop from Linux, and measure them against the CPU and iGPU.
tags: [npu, amd, linux, python, podman]
slug: linux-ryzen-ai-npu
---

[linux-ryzen-ai-npu](https://github.com/PjSalty/linux-ryzen-ai-npu) runs AMD's Ryzen AI Software 1.9.0 in a rootless container on the kernel's in-tree `amdxdna` driver, and benchmarks the same model and input on the NPU, CPU and iGPU. Nothing is installed on the host. Apache-2.0.

It needs Linux 6.14 or newer, Podman, about 50 GB of disk, and a Ryzen AI processor with an XDNA 2 NPU. I tested on a Ryzen AI 9 HX 375 under Arch.

The repo contains none of AMD's software. A script downloads it from AMD after you accept their EULA and checks the SHA-256.

| Workload | On the NPU? | Best device |
|---|---|---|
| SigLIP 2 base, 224 px | Yes, whole graph, BF16 | NPU for energy, iGPU for speed |
| Depth Anything 3 Small, 504 px | Yes, whole graph, BF16 | NPU for energy, iGPU for speed |
| Open Image Denoise, 1920x1280 | Not usefully | iGPU, 82 ms per frame |

Every NPU number in the README comes from a run where the execution provider loaded and the NPU's busy counter moved. The numbers and the reasoning are in [running models on the Ryzen AI NPU from Linux](/posts/ryzen-ai-npu-on-linux/).

## Source

- GitHub: <https://github.com/PjSalty/linux-ryzen-ai-npu>
- License: Apache-2.0
