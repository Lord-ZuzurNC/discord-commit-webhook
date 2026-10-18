import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '@actions/core';

import { normaliseWebhookUrl, resolveWebhookUrl } from '../src/inputs.js';

const BASE = 'https://discord.com/api/webhooks/123/abcdef';

test('leaves a plain webhook URL alone', () => {
  assert.deepEqual(normaliseWebhookUrl(BASE), { url: BASE, strippedSuffix: null });
});

test('strips the /github compatibility suffix', () => {
  // Posting an embed to this endpoint answers 400 with
  // {"sender": ["This field is required"]} — it wants a raw GitHub payload.
  assert.deepEqual(normaliseWebhookUrl(`${BASE}/github`), {
    url: BASE,
    strippedSuffix: 'github',
  });
});

test('strips the /slack compatibility suffix', () => {
  assert.deepEqual(normaliseWebhookUrl(`${BASE}/slack`), {
    url: BASE,
    strippedSuffix: 'slack',
  });
});

test('strips the suffix whatever its case, and any trailing slash', () => {
  assert.equal(normaliseWebhookUrl(`${BASE}/GitHub`).url, BASE);
  assert.equal(normaliseWebhookUrl(`${BASE}/github/`).url, BASE);
  assert.equal(normaliseWebhookUrl(`${BASE}/Slack//`).url, BASE);
});

test('does not strip a token that merely ends in those words', () => {
  // The suffix must be its own path segment, not the tail of the token.
  assert.deepEqual(normaliseWebhookUrl(`${BASE}github`), {
    url: `${BASE}github`,
    strippedSuffix: null,
  });
  const tokenLooksLikeIt = 'https://discord.com/api/webhooks/123/myslack';
  assert.equal(normaliseWebhookUrl(tokenLooksLikeIt).url, tokenLooksLikeIt);
});

test('resolveWebhookUrl returns the stripped URL and says so', () => {
  const notices = [];
  const secrets = [];
  const fakeCore = {
    getInput: (name) => (name === 'webhook_url' ? `${BASE}/github` : ''),
    setSecret: (value) => secrets.push(value),
    notice: (message) => notices.push(message),
    warning: () => {},
  };

  assert.equal(resolveWebhookUrl(fakeCore), BASE);

  // Both forms must be registered with the masker: it matches whole strings,
  // so registering the long one does not cover the short one.
  assert.ok(secrets.includes(`${BASE}/github`), secrets.join(' | '));
  assert.ok(secrets.includes(BASE), secrets.join(' | '));

  assert.equal(notices.length, 1);
  assert.match(notices[0], /\/github suffix/);
  assert.match(notices[0], /raw GitHub payload/);
});

test('resolveWebhookUrl stays silent for a plain URL', () => {
  const notices = [];
  const fakeCore = {
    getInput: (name) => (name === 'webhook_url' ? BASE : ''),
    setSecret: () => {},
    notice: (message) => notices.push(message),
    warning: () => {},
  };

  assert.equal(resolveWebhookUrl(fakeCore), BASE);
  assert.deepEqual(notices, []);
});

test('the id and token path is unaffected', () => {
  const fakeCore = {
    getInput: (name) => {
      if (name === 'webhook_id') return '123';
      if (name === 'webhook_token') return 'abcdef';
      return '';
    },
    setSecret: () => {},
    notice: () => {},
    warning: () => {},
  };

  assert.equal(resolveWebhookUrl(fakeCore), BASE);
});

test('the real @actions/core exposes the methods this relies on', () => {
  // Guards against a future bump renaming one of them.
  assert.equal(typeof core.setSecret, 'function');
  assert.equal(typeof core.notice, 'function');
});
