const MAX_COMMITS_CEILING = 25;

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
    return webhookUrl;
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
