import * as core from '@actions/core';
import { loadPushEvent } from './event.js';
import { readInputs } from './inputs.js';
import { buildEmbed } from './embed.js';
import { buildDeliveryUrl, deliverWebhook } from './delivery.js';

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return '<unreadable response body>';
  }
}

export async function run() {
  const payload = loadPushEvent({
    eventName: process.env.GITHUB_EVENT_NAME,
    eventPath: process.env.GITHUB_EVENT_PATH,
  });

  const commits = Array.isArray(payload.commits) ? payload.commits : [];

  if (commits.length === 0) {
    core.notice('The push carried no commits; nothing to post.');
    core.setOutput('skipped', 'true');
    core.setOutput('delivered', 'false');
    core.setOutput('message_id', '');
    return;
  }

  const config = readInputs(core);
  const embed = buildEmbed(payload, config);

  const body = { embeds: [embed] };
  if (config.webhookUsername) {
    body.username = config.webhookUsername;
  }
  if (config.webhookAvatarUrl) {
    body.avatar_url = config.webhookAvatarUrl;
  }

  const deliveryUrl = buildDeliveryUrl(config.webhookUrl, config.threadId);

  core.setOutput('skipped', 'false');

  const result = await deliverWebhook(deliveryUrl, body);

  if (result.ok) {
    const responseBody = await safeReadJson(result.response);
    const messageId = responseBody && typeof responseBody.id === 'string' ? responseBody.id : '';

    core.setOutput('delivered', 'true');
    core.setOutput('message_id', messageId);
    return;
  }

  let statusLine = 'no response was received';
  if (result.response) {
    const text = await safeReadText(result.response);
    core.error(`Discord webhook delivery failed with HTTP ${result.response.status}: ${text}`);
    statusLine = `HTTP ${result.response.status}`;
  } else if (result.error) {
    core.error(`Discord webhook delivery failed with a network error: ${result.error.message}`);
    statusLine = 'a network error';
  }

  core.setOutput('delivered', 'false');
  core.setOutput('message_id', '');

  const message = `Discord webhook delivery failed (${statusLine}); see the log above for details.`;
  if (config.failOnError) {
    core.setFailed(message);
  } else {
    core.warning(message);
  }
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
