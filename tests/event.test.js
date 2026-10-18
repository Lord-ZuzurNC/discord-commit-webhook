import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPushEvent } from '../src/event.js';

test('fails with a clear message naming the event when not a push event', () => {
  assert.throws(
    () => loadPushEvent({ eventName: 'pull_request', eventPath: '/dev/null' }),
    /pull_request/,
  );
});

test('fails when GITHUB_EVENT_PATH is not set', () => {
  assert.throws(() => loadPushEvent({ eventName: 'push', eventPath: '' }), /GITHUB_EVENT_PATH/);
});

test('fails with a clear message when the event file does not exist', () => {
  assert.throws(() =>
    loadPushEvent({ eventName: 'push', eventPath: '/nonexistent/path/event.json' }),
  );
});

test('fails with a clear message when the event file is not valid JSON', () => {
  const path = join(tmpdir(), `bad-event-${process.pid}.json`);
  writeFileSync(path, 'not json');
  try {
    assert.throws(() => loadPushEvent({ eventName: 'push', eventPath: path }), /JSON/);
  } finally {
    unlinkSync(path);
  }
});

test('parses a well-formed push event payload', () => {
  const path = join(tmpdir(), `good-event-${process.pid}.json`);
  const payload = { ref: 'refs/heads/main', commits: [] };
  writeFileSync(path, JSON.stringify(payload));
  try {
    const result = loadPushEvent({ eventName: 'push', eventPath: path });
    assert.deepEqual(result, payload);
  } finally {
    unlinkSync(path);
  }
});
