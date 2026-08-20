---
title: "One DNS record, two owners, a 400 that never clears"
date: 2026-08-20
summary: "Terraform declared a record statically while a controller updated it dynamically. Every apply refreshed a 404, planned a create, and got back 'an identical record already exists'. It can't self-heal, because the other owner just does it again."
tags: [terraform, dns, cloudflare, gitops]
types: ["build"]
topics: ["Automation", "Networking"]
---

A Terraform apply had been red for a while with this:

```
Warning: Resource not found
  The resource was not found on the server and will be removed from state.

Plan: 1 to add, 0 to change, 0 to destroy.

Error: failed to make http request
  POST ".../dns_records": 400 Bad Request
  {"errors":[{"code":81058,"message":"An identical record already exists."}]}
```

Both halves are in the same job log, four seconds apart. Terraform says the record is gone, then Cloudflare says it's already there. The job has been explaining its own failure on every run.

## What's actually happening

The record has two owners.

Terraform declares it:

```hcl
resource "cloudflare_dns_record" "media" {
  zone_id = data.cloudflare_zone.main.id
  name    = "media"
  type    = "A"
  content = var.wan_ip
  ttl     = 300
}
```

And a CronJob in the cluster maintains it too, because the Ingress carries a label the sync job watches for and a hostname annotation pointing at the same name.

That gives you a loop with no exit:

1. The CronJob patches or recreates the record, so its Cloudflare ID changes.
2. Terraform refreshes, 404s on the ID in state, drops the resource.
3. The plan now says "1 to add".
4. Apply POSTs, Cloudflare rejects it as a duplicate.

Step 1 happens again on the next CronJob run, so every later apply repeats the whole thing. Nothing about this converges, and no amount of re-running helps.

## Picking the owner

There's an obvious answer here and it isn't Terraform. The record's content is a dynamic WAN IP. The CronJob tracks it. Terraform had `content = var.wan_ip`, a static value that would fight every address change even if the duplicate problem didn't exist. The file's own header comment already said the CronJob handles dynamic WAN IP updates, so the resource block was contradicting the comment directly above it.

The CronJob had also already learned this lesson. Its code adopts a pre-existing record with a PATCH rather than a blind POST, with a comment saying Cloudflare rejects the duplicate. Terraform never learned it, because Terraform assumes it's the only writer. That assumption is the actual bug, not the 400.

## Handing it over without deleting it

Deleting the resource block is the wrong move if the resource might still be in state, because that's a destroy, and destroying a live public DNS record is an outage. Say what you mean:

```hcl
removed {
  from = cloudflare_dns_record.media

  lifecycle {
    # forget, do not destroy. the record is live and the CronJob owns it now.
    destroy = false
  }
}
```

`removed` with `destroy = false` drops it from state and leaves the real record alone. Terraform stops caring, the CronJob keeps working, and the next apply plans nothing for it.

Worth noting the refresh had already dropped it from state on its own, so a plain block deletion would probably have been fine. Probably isn't good enough for a record serving external access. Write down the intent instead of relying on a side effect being true on the day you run it.

## Checking the rest

Before shipping this I checked whether the other records in the same file had the same problem, against the live cluster rather than from memory. Only one resource carried the label the sync job watches, so the other four have exactly one owner each and stayed put. That check is the part worth copying. Two-owner bugs come in batches, because whatever added the second owner to one record usually added it to several.

The general shape: if a record's value is dynamic, whatever tracks the dynamic thing owns it, and your IaC should not also declare it. Declaring it looks like documentation and behaves like a competing writer.
