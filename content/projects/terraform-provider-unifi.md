---
title: Terraform provider for UniFi Network
date: 2026-07-02
lastmod: 2026-11-01
summary: A Terraform provider for the official UniFi Network Integration API, built on go-unifi/v2.
tags: [terraform, unifi, go, open-source]
---

It's live on the [Terraform Registry](https://registry.terraform.io/providers/PjSalty/unifi/latest) as `PjSalty/unifi`, MPL-2.0. Current release is {{< registry-version "unifi" >}}.

## What it does

It manages UniFi Network through the official Integration API (`/proxy/network/integration/v1/`), built on terraform-plugin-framework over the go-unifi/v2 official client. Authentication is an X-API-KEY generated in the controller UI under Settings, Control Plane, Integrations; the API has no username and password login. It requires a UniFi OS console (UDM, Cloud Key, or UniFi OS Server) running Network 10.1.78 or newer. The legacy self-hosted Network Application container has no API keys, so it is not supported.

No released Terraform provider consumes the official Integration API. filipowm/unifi and ubiquiti-community/unifi ride the legacy reverse-engineered API through go-unifi v1.x, whose generated schema is capped at controller 9.5.21, while the official API is specified in OpenAPI 3.1. Release v0.6.2 has nine resources: networks, wifi broadcasts, ACLs, DNS policies, firewall policies, firewall zones, hotspot vouchers, traffic matching lists, and `unifi_device_radio`. The `unifi_devices` data source is there too.

`unifi_device_radio` goes past the official API on purpose. The Integration API has no way to set a device's radio channel, width or power, so that one resource talks to the controller's internal device endpoint with the same API key. Everything else stays on the official surface. It's the only part that could break on a controller update without notice.

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
