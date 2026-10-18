import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeliveryUrl, deliverWebhook } from '../src/delivery.js';

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

test('buildDeliveryUrl always sets wait=true', () => {
  const url = buildDeliveryUrl('https://discord.com/api/webhooks/1/a', '');
  assert.equal(new URL(url).searchParams.get('wait'), 'true');
});

test('buildDeliveryUrl adds thread_id as a query parameter when non-empty', () => {
  const url = buildDeliveryUrl('https://discord.com/api/webhooks/1/a', '999');
  assert.equal(new URL(url).searchParams.get('thread_id'), '999');
});

test('buildDeliveryUrl omits thread_id when empty', () => {
  const url = buildDeliveryUrl('https://discord.com/api/webhooks/1/a', '');
  assert.equal(new URL(url).searchParams.has('thread_id'), false);
});

test('a successful response is delivered on the first attempt', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(200, { id: 'msg-1' });
  };
  const result = await deliverWebhook(
    'https://example.test/webhook',
    { embeds: [] },
    { fetch: fetchImpl, sleep: async () => {} },
  );
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
});

test('retries on 429 honouring retry_after, then succeeds', async () => {
  let calls = 0;
  const sleeps = [];
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse(429, { retry_after: 0.25 });
    }
    return jsonResponse(200, { id: 'msg-2' });
  };
  const result = await deliverWebhook(
    'https://example.test/webhook',
    { embeds: [] },
    { fetch: fetchImpl, sleep: async (ms) => sleeps.push(ms) },
  );
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(sleeps[0], 250);
});

test('retries on 5xx with exponential backoff, then succeeds', async () => {
  let calls = 0;
  const sleeps = [];
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 3) {
      return jsonResponse(503, { message: 'unavailable' });
    }
    return jsonResponse(200, { id: 'msg-3' });
  };
  const result = await deliverWebhook(
    'https://example.test/webhook',
    { embeds: [] },
    { fetch: fetchImpl, sleep: async (ms) => sleeps.push(ms) },
  );
  assert.equal(result.ok, true);
  assert.equal(calls, 3);
  assert.ok(sleeps[1] > sleeps[0]);
});

test('retries on a network-level error', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error('socket hang up');
    }
    return jsonResponse(200, { id: 'msg-4' });
  };
  const result = await deliverWebhook(
    'https://example.test/webhook',
    { embeds: [] },
    { fetch: fetchImpl, sleep: async () => {} },
  );
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
});

test('gives up after exhausting the retry budget', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(503, { message: 'unavailable' });
  };
  const result = await deliverWebhook(
    'https://example.test/webhook',
    { embeds: [] },
    { fetch: fetchImpl, sleep: async () => {} },
  );
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 503);
  assert.ok(calls <= 3);
});

test('does not retry other 4xx responses', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(400, { message: 'bad request' });
  };
  const result = await deliverWebhook(
    'https://example.test/webhook',
    { embeds: [] },
    { fetch: fetchImpl, sleep: async () => {} },
  );
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.equal(result.response.status, 400);
});
