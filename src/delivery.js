const MAX_ATTEMPTS = 3;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt) {
  return 2 ** (attempt - 1) * 500;
}

/**
 * Build the final delivery URL: always carries `wait=true` so Discord
 * returns the created message object, and carries `thread_id` when the
 * message should be routed into an existing thread or forum post.
 */
export function buildDeliveryUrl(webhookUrl, threadId) {
  const url = new URL(webhookUrl);
  url.searchParams.set('wait', 'true');
  if (threadId) {
    url.searchParams.set('thread_id', threadId);
  }
  return url.toString();
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * POST the embed payload to Discord, retrying on `429` (honouring
 * `retry_after`) and on `5xx` / network errors with exponential backoff.
 *
 * The combined retry budget across both failure classes is three attempts
 * in total. Other `4xx` responses are never retried: they indicate a
 * malformed request or a bad webhook, and retrying cannot help.
 */
export async function deliverWebhook(url, body, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const sleepImpl = deps.sleep ?? defaultSleep;

  let attempt = 0;
  let lastResponse = null;
  let lastError = null;

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return { ok: true, response };
      }

      lastResponse = response;

      if (response.status === 429) {
        if (attempt >= MAX_ATTEMPTS) {
          break;
        }
        const data = await safeReadJson(response);
        const retryAfterSeconds = Number(data?.retry_after);
        const delayMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 1000;
        await sleepImpl(delayMs);
        continue;
      }

      if (response.status >= 500 && response.status < 600) {
        if (attempt >= MAX_ATTEMPTS) {
          break;
        }
        await sleepImpl(backoffDelayMs(attempt));
        continue;
      }

      // Other 4xx responses: do not retry, a malformed request stays malformed.
      return { ok: false, response };
    } catch (err) {
      lastError = err;
      if (attempt >= MAX_ATTEMPTS) {
        break;
      }
      await sleepImpl(backoffDelayMs(attempt));
    }
  }

  return { ok: false, response: lastResponse, error: lastError };
}
