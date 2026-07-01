---
title: "MetalLB from L2 to BGP with Cilium and MikroTik"
date: 2026-04-19
summary: "Moved MetalLB advertisement from L2 mode to Cilium's BGP control plane peering with MikroTik. Failover drops to sub-5s."
tags: [cilium, kubernetes, networking, mikrotik, bgp]
types: ["build"]
topics: ["Cilium", "Networking", "BGP"]
---

I ran MetalLB in L2 mode for two years. L2 mode follows ARP: one node holds the LB IP and answers ARP, so traffic lands there. When that node dies, another node sends a gratuitous ARP and the network eventually updates. Failover is bound by the upstream switch's ARP cache, so it can take a minute or more.

In L2 mode the router only sees MAC addresses on a port, so it can't tell which node holds a service, and it can't filter or monitor per service.

Cilium 1.x and later ships a BGP control plane. Nodes peer directly with the upstream router and advertise pod CIDRs plus a `/32` per LB VIP, and the router installs those as real routes. MetalLB still handles IP allocation, but I shut off its speaker DaemonSet since Cilium does the advertisement now.

Cluster side is one CiliumBGPPeeringPolicy:

```yaml
apiVersion: cilium.io/v2alpha1
kind: CiliumBGPPeeringPolicy
metadata:
  name: bgp-policy
spec:
  nodeSelector:
    matchLabels:
      bgp-peer: "true"
  virtualRouters:
    - localASN: <asn>
      exportPodCIDR: true
      neighbors:
        - peerAddress: <host>/32
          peerASN: <asn>
          authSecretRef: cilium-bgp-md5
          gracefulRestart:
            enabled: true
            restartTimeSeconds: 60
      serviceSelector:
        matchExpressions:
          - { key: somekey, operator: NotIn, values: [neverused] }
```

`serviceSelector: NotIn [neverused]` is the documented way to match every service. There's no `matchAllServices` flag, and an empty selector matches nothing.

MikroTik side is one BGP connection per node carrying the `bgp-peer: "true"` label, MD5 auth, and filter chains that accept the pod CIDR and the LB pool and reject everything else. I don't trust the cluster to advertise only what I expect, so the filters are the backstop. Even if the cluster advertises something unexpected, only the pod CIDR and LB pool reach the router's routing table.

Three things bit me during the switchover.

MikroTik default BGP timers are conservative at 90s hold and 30s keepalive, so initial peering felt slow. I dropped them to 30s hold and 10s keepalive and added BFD.

Kill the MetalLB speaker before Cilium BGP is fully peered and you lose every LB-exposed service for the gap. Bring up Cilium BGP first, confirm the routes are installed on the router, then disable the speaker.

Cilium graceful-restart only helps if the router also has graceful restart enabled. MikroTik supports it but it's off by default. Turn it on, or an agent restart blackholes traffic for the BGP handshake.

Full RouterOS config and Cilium manifests are in [saltstice-homelab/how-to/cilium-bgp-with-mikrotik.md](https://github.com/PjSalty/saltstice-homelab/blob/main/how-to/cilium-bgp-with-mikrotik.md).
