import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthorLabel, censorLabel } from '../src/author.js';

test('prefers username over name', () => {
  assert.equal(resolveAuthorLabel({ username: 'lordznc', name: 'Lord ZuzurNC' }), 'lordznc');
});

test('falls back to name when username is missing', () => {
  assert.equal(resolveAuthorLabel({ name: 'Lord ZuzurNC' }), 'Lord ZuzurNC');
});

test('falls back to "unknown" when both are missing', () => {
  assert.equal(resolveAuthorLabel({}), 'unknown');
});

test('falls back to "unknown" when author is entirely absent', () => {
  assert.equal(resolveAuthorLabel(undefined), 'unknown');
});

test('does not crash on a commit with no username, matching GitHub web UI commits', () => {
  // This is the exact shape of a commit authored through the GitHub web UI.
  assert.doesNotThrow(() => resolveAuthorLabel({ name: 'Web Flow', email: 'noreply@github.com' }));
});

test('censors a multi-character label to first character plus three asterisks', () => {
  assert.equal(censorLabel('lordznc'), 'l***');
});

test('censors a one-character label to that character plus three asterisks', () => {
  assert.equal(censorLabel('l'), 'l***');
});

test('censors an empty label to three asterisks alone', () => {
  assert.equal(censorLabel(''), '***');
});

test('never reveals the final character of the label', () => {
  const result = censorLabel('secretname');
  assert.equal(result.endsWith('name'), false);
  assert.equal(result, 's***');
});
