import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '@actions/core';
import { readInputs, resolveWebhookUrl, parsePositiveInteger, parseColor } from '../src/inputs.js';

const INPUT_KEYS = [
  'INPUT_WEBHOOK_URL',
  'INPUT_WEBHOOK_ID',
  'INPUT_WEBHOOK_TOKEN',
  'INPUT_THREAD_ID',
  'INPUT_REPO_NAME',
  'INPUT_CENSOR_USERNAME',
  'INPUT_HIDE_LINKS',
  'INPUT_COLOR',
  'INPUT_MAX_COMMITS',
  'INPUT_COMMIT_MESSAGE_MAX_LENGTH',
  'INPUT_WEBHOOK_USERNAME',
  'INPUT_WEBHOOK_AVATAR_URL',
  'INPUT_FAIL_ON_ERROR',
];

function clearInputs() {
  for (const key of INPUT_KEYS) {
    delete process.env[key];
  }
}

function setDefaultInputs(overrides = {}) {
  clearInputs();
  const defaults = {
    INPUT_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/abcdef',
    INPUT_THREAD_ID: '',
    INPUT_REPO_NAME: '',
    INPUT_CENSOR_USERNAME: 'false',
    INPUT_HIDE_LINKS: 'false',
    INPUT_COLOR: '7dbbe6',
    INPUT_MAX_COMMITS: '10',
    INPUT_COMMIT_MESSAGE_MAX_LENGTH: '120',
    INPUT_WEBHOOK_USERNAME: '',
    INPUT_WEBHOOK_AVATAR_URL: '',
    INPUT_FAIL_ON_ERROR: 'true',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    process.env[key] = value;
  }
}

test.afterEach(() => {
  clearInputs();
});

// --- Section 7 regression: the string "false" must disable, not enable, a boolean input. ---

test('REGRESSION: INPUT_CENSOR_USERNAME="false" (string) disables censoring', () => {
  setDefaultInputs({ INPUT_CENSOR_USERNAME: 'false' });
  const config = readInputs(core);
  assert.equal(config.censorUsername, false);
});

test('REGRESSION: INPUT_CENSOR_USERNAME="true" (string) enables censoring', () => {
  setDefaultInputs({ INPUT_CENSOR_USERNAME: 'true' });
  const config = readInputs(core);
  assert.equal(config.censorUsername, true);
});

test('REGRESSION: INPUT_HIDE_LINKS="false" (string) disables hiding links', () => {
  setDefaultInputs({ INPUT_HIDE_LINKS: 'false' });
  const config = readInputs(core);
  assert.equal(config.hideLinks, false);
});

test('REGRESSION: INPUT_HIDE_LINKS="true" (string) enables hiding links', () => {
  setDefaultInputs({ INPUT_HIDE_LINKS: 'true' });
  const config = readInputs(core);
  assert.equal(config.hideLinks, true);
});

test('REGRESSION: INPUT_FAIL_ON_ERROR="false" (string) disables fail-on-error', () => {
  setDefaultInputs({ INPUT_FAIL_ON_ERROR: 'false' });
  const config = readInputs(core);
  assert.equal(config.failOnError, false);
});

test('REGRESSION: a naive truthiness check on the raw string would wrongly pass ("false" is truthy in JS)', () => {
  // This documents exactly the bug class section 7 warns about: !!"false" === true.
  assert.equal(Boolean('false'), true);
  // getBooleanInput must not be bypassed by such a check; readInputs must use it.
  setDefaultInputs({ INPUT_CENSOR_USERNAME: 'false' });
  const config = readInputs(core);
  assert.notEqual(config.censorUsername, Boolean(process.env.INPUT_CENSOR_USERNAME));
});

test('an invalid boolean literal throws via core.getBooleanInput', () => {
  setDefaultInputs({ INPUT_CENSOR_USERNAME: 'not-a-boolean' });
  assert.throws(() => readInputs(core));
});

// --- Section 3.1: webhook resolution. ---

test('uses webhook_url verbatim and ignores webhook_id/webhook_token', () => {
  process.env.INPUT_WEBHOOK_URL = 'https://discord.com/api/webhooks/999/zzz';
  process.env.INPUT_WEBHOOK_ID = 'should-be-ignored';
  process.env.INPUT_WEBHOOK_TOKEN = 'should-be-ignored-too';
  assert.equal(resolveWebhookUrl(core), 'https://discord.com/api/webhooks/999/zzz');
});

test('builds a URL from webhook_id and webhook_token when webhook_url is absent', () => {
  process.env.INPUT_WEBHOOK_URL = '';
  process.env.INPUT_WEBHOOK_ID = '123';
  process.env.INPUT_WEBHOOK_TOKEN = 'abc';
  assert.equal(resolveWebhookUrl(core), 'https://discord.com/api/webhooks/123/abc');
});

test('fails naming all three inputs when none of the webhook paths can be satisfied', () => {
  process.env.INPUT_WEBHOOK_URL = '';
  process.env.INPUT_WEBHOOK_ID = '';
  process.env.INPUT_WEBHOOK_TOKEN = '';
  assert.throws(
    () => resolveWebhookUrl(core),
    (err) => {
      assert.match(err.message, /webhook_url/);
      assert.match(err.message, /webhook_id/);
      assert.match(err.message, /webhook_token/);
      return true;
    },
  );
});

test('fails when only webhook_id is set without webhook_token', () => {
  process.env.INPUT_WEBHOOK_URL = '';
  process.env.INPUT_WEBHOOK_ID = '123';
  process.env.INPUT_WEBHOOK_TOKEN = '';
  assert.throws(() => resolveWebhookUrl(core));
});

// --- Section 3.2: numeric inputs. ---

test('rejects a non-numeric max_commits with a message naming the input and value', () => {
  process.env.INPUT_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/a';
  assert.throws(
    () => parsePositiveInteger('max_commits', 'abc'),
    (err) => {
      assert.match(err.message, /max_commits/);
      assert.match(err.message, /abc/);
      return true;
    },
  );
});

test('rejects a zero or negative value', () => {
  assert.throws(() => parsePositiveInteger('max_commits', '0'));
  assert.throws(() => parsePositiveInteger('max_commits', '-5'));
});

test('rejects a non-integer value', () => {
  assert.throws(() => parsePositiveInteger('commit_message_max_length', '12.5'));
});

test('accepts a valid positive integer', () => {
  assert.equal(parsePositiveInteger('max_commits', '10'), 10);
});

test('clamps max_commits to 25 even when a higher value is requested', () => {
  setDefaultInputs({ INPUT_MAX_COMMITS: '100' });
  const config = readInputs(core);
  assert.equal(config.maxCommits, 25);
});

test('leaves max_commits untouched when below the ceiling', () => {
  setDefaultInputs({ INPUT_MAX_COMMITS: '5' });
  const config = readInputs(core);
  assert.equal(config.maxCommits, 5);
});

// --- color parsing. ---

test('parses a 6-digit hex colour without a leading #', () => {
  assert.equal(parseColor('7dbbe6'), 0x7dbbe6);
});

test('tolerates a leading # on the colour', () => {
  assert.equal(parseColor('#7dbbe6'), 0x7dbbe6);
});

test('rejects an invalid colour value', () => {
  assert.throws(() => parseColor('not-a-colour'));
});

// --- Full readInputs() integration. ---

test('readInputs returns a fully resolved config from real INPUT_* env vars', () => {
  setDefaultInputs({
    INPUT_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/a',
    INPUT_REPO_NAME: 'my/repo',
    INPUT_CENSOR_USERNAME: 'true',
    INPUT_HIDE_LINKS: 'true',
    INPUT_COLOR: '#00ff00',
    INPUT_MAX_COMMITS: '3',
    INPUT_COMMIT_MESSAGE_MAX_LENGTH: '50',
    INPUT_WEBHOOK_USERNAME: 'Bot',
    INPUT_WEBHOOK_AVATAR_URL: 'https://example.com/avatar.png',
    INPUT_FAIL_ON_ERROR: 'false',
  });

  const config = readInputs(core);

  assert.equal(config.webhookUrl, 'https://discord.com/api/webhooks/1/a');
  assert.equal(config.repoName, 'my/repo');
  assert.equal(config.censorUsername, true);
  assert.equal(config.hideLinks, true);
  assert.equal(config.color, 0x00ff00);
  assert.equal(config.maxCommits, 3);
  assert.equal(config.commitMessageMaxLength, 50);
  assert.equal(config.webhookUsername, 'Bot');
  assert.equal(config.webhookAvatarUrl, 'https://example.com/avatar.png');
  assert.equal(config.failOnError, false);
});
