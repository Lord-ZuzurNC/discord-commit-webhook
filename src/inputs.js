import { validateFormat, FORMAT_SPECS } from './format.js';

const MAX_COMMITS_CEILING = 25;

/**
 * Read every format string, falling back to its default, and reject an unknown
 * placeholder now rather than halfway through building the embed.
 */
export function readFormats(core) {
  const formats = {};
  for (const [inputName, spec] of Object.entries(FORMAT_SPECS)) {
    const raw = core.getInput(inputName);
    const template = raw.length > 0 ? raw : spec.default;
    validateFormat(template, spec.placeholders, inputName);
    formats[spec.key] = template;
  }
  return formats;
}

// Discord exposes two compatibility endpoints under a webhook: `/github` and
// `/slack`. They parse a foreign payload shape instead of a Discord message,
// so posting an embed to one answers `400` with a complaint about a missing
// field of that foreign shape — `{"sender": ["This field is required"]}` for
// `/github`. It is a common copy-paste mistake and nothing this action sends
// could ever work against them.
const COMPAT_SUFFIX = /\/(github|slack)\/*$/i;

/**
 * Strip a `/github` or `/slack` compatibility suffix from a webhook URL.
 *
 * Returns the usable URL and the suffix that was removed, so the caller can
 * say what it did instead of silently rewriting the user's configuration.
 */
export function normaliseWebhookUrl(rawUrl) {
  const match = COMPAT_SUFFIX.exec(rawUrl);
  if (!match) {
    return { url: rawUrl, strippedSuffix: null };
  }
  return { url: rawUrl.slice(0, match.index), strippedSuffix: match[1].toLowerCase() };
}

/**
 * Resolve the Discord webhook URL from `webhook_url`, or from
 * `webhook_id` + `webhook_token`, registering secrets as it goes.
 */
export function resolveWebhookUrl(core) {
  const webhookUrl = core.getInput('webhook_url');
  const webhookId = core.getInput('webhook_id');
  const webhookToken = core.getInput('webhook_token');

  if (webhookToken) {
    core.setSecret(webhookToken);
  }
  if (webhookId) {
    core.setSecret(webhookId);
  }

  if (webhookUrl) {
    core.setSecret(webhookUrl);

    const { url, strippedSuffix } = normaliseWebhookUrl(webhookUrl);
    if (strippedSuffix) {
      // Register the shortened URL too: the masker matches whole registered
      // strings, so the original registration does not cover this one.
      core.setSecret(url);
      core.notice(
        `Ignoring the /${strippedSuffix} suffix on the webhook URL. That endpoint expects a raw ${strippedSuffix === 'github' ? 'GitHub' : 'Slack'} payload and rejects a Discord embed; posting to the webhook itself instead.`,
      );
    }
    return url;
  }

  if (webhookId && webhookToken) {
    const fullUrl = `https://discord.com/api/webhooks/${webhookId}/${webhookToken}`;
    core.setSecret(fullUrl);
    return fullUrl;
  }

  throw new Error(
    'No usable webhook credentials: set "webhook_url", or set both "webhook_id" and "webhook_token".',
  );
}

/**
 * Parse a delimited name list input into an array of trimmed, unique names.
 *
 * Action inputs arrive as environment variables, so there is no list type: the
 * value is split on newlines and commas, which lets a workflow write either a
 * block scalar or a single comma-separated line.
 */
export function parseNameList(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return [];
  }

  const seen = new Set();
  for (const part of raw.split(/[\n,]/)) {
    const name = part.trim();
    if (name.length > 0) {
      seen.add(name);
    }
  }
  return Array.from(seen);
}

/**
 * Parse and validate a numeric input as a finite positive integer.
 */
export function parsePositiveInteger(name, raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Input "${name}" must be a positive integer, but got "${raw}".`);
  }
  return value;
}

/**
 * Parse the `color` input (RRGGBB hex, leading `#` tolerated) into an
 * integer suitable for a Discord embed's `color` field.
 */
export function parseColor(raw) {
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Input "color" must be a 6-digit hex colour, but got "${raw}".`);
  }
  return parseInt(hex, 16);
}

/**
 * Read and validate every action input, returning a plain config object.
 *
 * Every boolean input is read with `core.getBooleanInput()`, never tested
 * for raw truthiness: the string `"false"` is truthy in JavaScript, and a
 * naive check would leave `censor_username=false` enabling censoring.
 */
export function readInputs(core) {
  const webhookUrl = resolveWebhookUrl(core);

  const maxCommitsRaw = core.getInput('max_commits') || '10';
  const commitMessageMaxLengthRaw = core.getInput('commit_message_max_length') || '120';
  const colorRaw = core.getInput('color') || '7dbbe6';

  const maxCommits = Math.min(
    parsePositiveInteger('max_commits', maxCommitsRaw),
    MAX_COMMITS_CEILING,
  );
  const commitMessageMaxLength = parsePositiveInteger(
    'commit_message_max_length',
    commitMessageMaxLengthRaw,
  );
  const color = parseColor(colorRaw);

  return {
    ...readFormats(core),
    webhookUrl,
    threadId: core.getInput('thread_id'),
    repoName: core.getInput('repo_name'),
    censorUsername: core.getBooleanInput('censor_username'),
    censorNames: parseNameList(core.getInput('censor_names')),
    hideLinks: core.getBooleanInput('hide_links'),
    color,
    maxCommits,
    commitMessageMaxLength,
    webhookUsername: core.getInput('webhook_username'),
    webhookAvatarUrl: core.getInput('webhook_avatar_url'),
    failOnError: core.getBooleanInput('fail_on_error'),
  };
}
