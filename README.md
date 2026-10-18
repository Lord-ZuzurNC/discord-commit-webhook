# discord-commit-webhook

A GitHub Action that posts a summary of a `push` event to a Discord channel or forum thread, using a Discord incoming webhook.

## Contents

- [discord-commit-webhook](#discord-commit-webhook)
  - [Contents](#contents)
  - [Quick start](#quick-start)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [Posting into a thread or forum post](#posting-into-a-thread-or-forum-post)
  - [Getting a Discord webhook URL](#getting-a-discord-webhook-url)
  - [Pinning a version](#pinning-a-version)
  - [Licence](#licence)

## Quick start

```yaml
name: Notify Discord

on:
  push:
    branches: ['main']

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: Lord-ZuzurNC/discord-commit-webhook@v1
        with:
          webhook_url: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

## Inputs

| id                          | type    | required    | default    | meaning                                                                 |
| --------------------------- | ------- | ----------- | ---------- | ----------------------------------------------------------------------- |
| `webhook_url`               | string  | conditional | —          | Full Discord webhook URL.                                               |
| `webhook_id`                | string  | conditional | —          | Webhook id. Used only when `webhook_url` is absent.                     |
| `webhook_token`             | string  | conditional | —          | Webhook token. Used only when `webhook_url` is absent.                  |
| `thread_id`                 | string  | no          | `''`       | Post into this existing thread or forum post instead of the channel.    |
| `repo_name`                 | string  | no          | `''`       | Override the repository name shown in the embed.                        |
| `censor_username`           | boolean | no          | `'false'`  | Mask commit author names.                                               |
| `hide_links`                | boolean | no          | `'false'`  | Emit no hyperlinks at all.                                              |
| `color`                     | string  | no          | `'7dbbe6'` | Embed accent colour, RRGGBB hex, leading `#` tolerated.                 |
| `max_commits`               | integer | no          | `'10'`     | Maximum commits listed individually.                                    |
| `commit_message_max_length` | integer | no          | `'120'`    | Per-commit message truncation budget, in characters.                    |
| `webhook_username`          | string  | no          | `''`       | Override the display name of the webhook poster.                        |
| `webhook_avatar_url`        | string  | no          | `''`       | Override the avatar of the webhook poster.                              |
| `fail_on_error`             | boolean | no          | `'true'`   | If `false`, delivery failures are warnings and the step still succeeds. |

Set either `webhook_url`, or both `webhook_id` and `webhook_token`.

`max_commits` is clamped to a maximum of `25`, because a Discord embed description has a hard 4096-character limit.

## Outputs

| id           | meaning                                                                   |
| ------------ | ------------------------------------------------------------------------- |
| `delivered`  | `'true'` if Discord accepted the message, `'false'` otherwise.            |
| `message_id` | The Discord message id when one was returned, otherwise the empty string. |
| `skipped`    | `'true'` when the push carried no commits and nothing was posted.         |

## Posting into a thread or forum post

Set `thread_id` to the id of an existing thread or forum post.
The action routes the message there instead of into the channel itself.

## Getting a Discord webhook URL

Open the target channel's settings in Discord, go to **Integrations → Webhooks**, and create a new webhook.
Copy its **Webhook URL**: it already contains the webhook id and token embedded in the path.
Or, here how to extract the id and token of the Webhook URL:

```text
https://discord.com/api/webhooks/<id>/<token>
```

Store it as a repository secret, then reference it from your workflow:

```yaml
webhook_url: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

**Never commit a webhook URL directly into a workflow file**: anyone who can read it can post to your channel.
From your repo, go to `Settings` > `Secrets and Variables` > `Actions` > `New repository secret`

## Pinning a version

Pin the action to the floating major tag so you receive patches automatically:

```yaml
uses: Lord-ZuzurNC/discord-commit-webhook@v1
```

## Licence

MIT.
