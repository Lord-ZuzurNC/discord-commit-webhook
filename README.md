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

## Hiding who pushed

Two inputs drive censoring, and either one switches it on.

`censor_username: true` masks everyone the action can detect in the push.
`censor_names` masks only the people you list, and leaves everyone else named.

```yaml
with:
  webhook_url: ${{ secrets.DISCORD_WEBHOOK_URL }}
  censor_names: |
    username1
    anothercontributor
    athirdparty
```

A single comma-separated line works too.
Action inputs are delivered as environment variables, so there is no list type and a YAML sequence is not accepted.

Setting both is a union: everyone detected is masked, plus any extra name you listed.

Masking replaces a name with its first character followed by three asterisks.
It applies to the author label on each commit line, to the pusher shown in the footer, and to the same names wherever they appear inside the commit subjects — merge commits otherwise read `Merge pull request #7 from your-account/branch` and would give the account away.

### Short and ordinary names

A name is matched only when no word character and no hyphen sits against either edge.
So an author called `al` does not turn `already` into `a***ready`, nor `al-dente` into `a***-dente`.

That rule cannot help when the name **is** an ordinary word.
Censoring `refactor` turns `refactor: split the parser` into `r***: split the parser`, and no matching rule can tell the username from the verb.

A name you list is censored regardless, because you named it deliberately, and the action warns you when an entry is shorter than four characters or is a common word.
Automatic detection is more cautious: it skips any label shorter than three characters, since nobody asked for it by name.

The bias is deliberate.
Over-redacting mangles a word; under-redacting exposes a person.

**`censor_username` alone does not hide the account.**
A working link to a GitHub commit necessarily contains the owner of the repository, so the link targets still carry it even though no name is visible.
Combine both options when the account must not appear at all:

```yaml
with:
  webhook_url: ${{ secrets.DISCORD_WEBHOOK_URL }}
  censor_username: true
  hide_links: true
```

The action emits a warning when `censor_username` is enabled and `hide_links` is not, so this never passes unnoticed.

The repository name shown in the embed header is not censored, because it is how a reader tells one repository from another.
Override it with `repo_name` when it should not appear.

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

MIT by Lord-ZuzurNC
