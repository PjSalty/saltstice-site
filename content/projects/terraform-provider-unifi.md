---
title: Terraform provider for UniFi Network
date: 2026-07-02
summary: A Terraform provider for the official UniFi Network Integration API, built on go-unifi/v2.
tags: [terraform, unifi, go, open-source]
---

It's live on the [Terraform Registry](https://registry.terraform.io/providers/PjSalty/unifi/latest) as `PjSalty/unifi`, MPL-2.0. Current release is {{< registry-version "unifi" >}}.

## What it does

It manages UniFi Network through the official Integration API (`/proxy/network/integration/v1/`), built on terraform-plugin-framework over the go-unifi/v2 official client. Authentication is an X-API-KEY generated in the controller UI under Settings, Control Plane, Integrations; the API has no username and password login. It requires a UniFi OS console (UDM, Cloud Key, or UniFi OS Server) running Network 10.1.78 or newer. The legacy self-hosted Network Application container has no API keys, so it is not supported.

No released Terraform provider consumes the official Integration API. filipowm/unifi and ubiquiti-community/unifi ride the legacy reverse-engineered API through go-unifi v1.x, whose generated schema is capped at controller 9.5.21, while the official API is specified in OpenAPI 3.1. The provider is in development and resources land incrementally: `unifi_network` and `unifi_wifi_broadcast` resources and a `unifi_devices` data source exist today, and the target surface is the full official API, covering networks, wifi broadcasts, devices, clients, ACLs, DNS policies, firewall, hotspot, traffic-matching lists, and sites.

## Provider configuration

```hcl
provider "unifi" {
  api_url        = "https://unifi.example.com" # https only;        env UNIFI_API
  api_key        = var.unifi_api_key           # X-API-KEY;         env UNIFI_API_KEY
  site           = "default"                   #                    env UNIFI_SITE
  allow_insecure = true                        # self-signed cert;  env UNIFI_INSECURE
}
```

Every argument falls back to the environment variable named in its comment.

## Source

- Registry: <https://registry.terraform.io/providers/PjSalty/unifi/latest>
- GitHub: <https://github.com/PjSalty/terraform-provider-unifi>
- License: MPL-2.0
