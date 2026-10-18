import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const nodeBin = process.execPath;
const entryPoint = join(projectRoot, 'src', 'index.js');

/** Start a fake Discord webhook server driven by a queue of canned responses. */
function startFakeWebhookServer(responders) {
  const received = [];
  let callIndex = 0;

  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      received.push({ url: req.url, method: req.method, body });

      const responder = responders[Math.min(callIndex, responders.length - 1)];
      callIndex += 1;
      const { status, body: responseBody } = responder(req, body);

      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseBody ?? {}));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        received,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

function writeEventFile(dir, payload) {
  const path = join(dir, 'event.json');
  writeFileSync(path, JSON.stringify(payload));
  return path;
}

function basePushPayload(overrides = {}) {
  return {
    ref: 'refs/heads/main',
    compare: 'https://github.com/acme/widgets/compare/aaa...bbb',
    repository: { full_name: 'acme/widgets' },
    pusher: { name: 'octocat' },
    commits: [
      {
        id: '1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        message: 'first commit',
        url: 'https://github.com/acme/widgets/commit/1111111',
        timestamp: '2026-01-01T10:00:00Z',
        author: { username: 'alice' },
      },
      {
        id: '2222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        message: 'second commit',
        url: 'https://github.com/acme/widgets/commit/2222222',
        timestamp: '2026-01-01T11:00:00Z',
        author: { username: 'bob' },
      },
    ],
    ...overrides,
  };
}

function baseActionEnv({ port, eventPath, overrides = {} }) {
  return {
    ...process.env,
    GITHUB_EVENT_NAME: 'push',
    GITHUB_EVENT_PATH: eventPath,
    INPUT_WEBHOOK_URL: `http://127.0.0.1:${port}/webhook/123/abcdef`,
    INPUT_WEBHOOK_ID: '',
    INPUT_WEBHOOK_TOKEN: '',
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
    ...overrides,
  };
}

function runAction(env) {
  return new Promise((resolve) => {
    const child = spawn(nodeBin, [entryPoint], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test('E2E: a normal multi-commit push delivers the expected JSON body', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
  const outputPath = join(dir, 'outputs.env');
  writeFileSync(outputPath, '');

  const { port, received, close } = await startFakeWebhookServer([
    () => ({ status: 200, body: { id: 'discord-message-1' } }),
  ]);

  t.after(() => close());

  const eventPath = writeEventFile(dir, basePushPayload());
  const env = baseActionEnv({ port, eventPath, overrides: { GITHUB_OUTPUT: outputPath } });

  const { code, stdout, stderr } = await runAction(env);

  assert.equal(code, 0, `expected success exit code, stderr: ${stderr}`);
  assert.equal(received.length, 1);
  assert.equal(received[0].method, 'POST');
  assert.match(received[0].url, /wait=true/);

  const embed = received[0].body.embeds[0];
  assert.equal(embed.title, '2 new commits');
  assert.ok(embed.description.includes('alice'));
  assert.ok(embed.description.includes('bob'));
  assert.equal(embed.footer.text, 'main · octocat');

  const outputs = require_outputs(outputPath);
  assert.equal(outputs.delivered, 'true');
  assert.equal(outputs.skipped, 'false');
  assert.equal(outputs.message_id, 'discord-message-1');

  rmSync(dir, { recursive: true, force: true });
});

test('E2E: a zero-commit push skips delivery and still exits 0', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
  const outputPath = join(dir, 'outputs.env');
  writeFileSync(outputPath, '');

  const { port, received, close } = await startFakeWebhookServer([
    () => ({ status: 200, body: { id: 'should-not-be-used' } }),
  ]);
  t.after(() => close());

  const eventPath = writeEventFile(dir, basePushPayload({ commits: [] }));
  const env = baseActionEnv({ port, eventPath, overrides: { GITHUB_OUTPUT: outputPath } });

  const { code, stderr } = await runAction(env);

  assert.equal(code, 0, `expected success exit code, stderr: ${stderr}`);
  assert.equal(received.length, 0, 'nothing should have been posted');

  const outputs = require_outputs(outputPath);
  assert.equal(outputs.skipped, 'true');
  assert.equal(outputs.delivered, 'false');

  rmSync(dir, { recursive: true, force: true });
});

test('E2E REGRESSION: censor_username=false (string) leaves author names intact', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
  const outputPath = join(dir, 'outputs.env');
  writeFileSync(outputPath, '');

  const { port, received, close } = await startFakeWebhookServer([
    () => ({ status: 200, body: { id: 'msg' } }),
  ]);
  t.after(() => close());

  const eventPath = writeEventFile(dir, basePushPayload());
  const env = baseActionEnv({
    port,
    eventPath,
    overrides: { GITHUB_OUTPUT: outputPath, INPUT_CENSOR_USERNAME: 'false' },
  });

  const { code, stderr } = await runAction(env);
  assert.equal(code, 0, stderr);

  const embed = received[0].body.embeds[0];
  assert.ok(embed.description.includes('alice'));
  assert.ok(embed.description.includes('bob'));
  assert.ok(!embed.description.includes('a***'));

  rmSync(dir, { recursive: true, force: true });
});

test('E2E: censor_username=true masks author names', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
  const outputPath = join(dir, 'outputs.env');
  writeFileSync(outputPath, '');

  const { port, received, close } = await startFakeWebhookServer([
    () => ({ status: 200, body: { id: 'msg' } }),
  ]);
  t.after(() => close());

  const eventPath = writeEventFile(dir, basePushPayload());
  const env = baseActionEnv({
    port,
    eventPath,
    overrides: { GITHUB_OUTPUT: outputPath, INPUT_CENSOR_USERNAME: 'true' },
  });

  const { code, stderr } = await runAction(env);
  assert.equal(code, 0, stderr);

  const embed = received[0].body.embeds[0];
  assert.ok(!embed.description.includes('alice'));
  assert.ok(!embed.description.includes('bob'));
  assert.ok(embed.description.includes('a***'));
  assert.ok(embed.description.includes('b***'));

  rmSync(dir, { recursive: true, force: true });
});

test('E2E: hide_links=true produces a payload containing no URL at all', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
  const outputPath = join(dir, 'outputs.env');
  writeFileSync(outputPath, '');

  const { port, received, close } = await startFakeWebhookServer([
    () => ({ status: 200, body: { id: 'msg' } }),
  ]);
  t.after(() => close());

  const eventPath = writeEventFile(
    dir,
    basePushPayload({
      commits: [
        {
          id: '3333333cccccccccccccccccccccccccccccccc',
          message: 'see https://example.com/issue/1 for context',
          url: 'https://github.com/acme/widgets/commit/3333333',
          timestamp: '2026-01-01T12:00:00Z',
          author: { username: 'carol' },
        },
      ],
    }),
  );
  const env = baseActionEnv({
    port,
    eventPath,
    overrides: { GITHUB_OUTPUT: outputPath, INPUT_HIDE_LINKS: 'true' },
  });

  const { code, stderr } = await runAction(env);
  assert.equal(code, 0, stderr);

  const bodyText = JSON.stringify(received[0].body);
  assert.doesNotMatch(bodyText, /https?:\/\//);

  rmSync(dir, { recursive: true, force: true });
});

test('E2E: a commit with a missing author.username does not crash the action', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
  const outputPath = join(dir, 'outputs.env');
  writeFileSync(outputPath, '');

  const { port, received, close } = await startFakeWebhookServer([
    () => ({ status: 200, body: { id: 'msg' } }),
  ]);
  t.after(() => close());

  const eventPath = writeEventFile(
    dir,
    basePushPayload({
      commits: [
        {
          id: '4444444dddddddddddddddddddddddddddddddd',
          message: 'commit authored through the GitHub web UI',
          url: 'https://github.com/acme/widgets/commit/4444444',
          timestamp: '2026-01-01T12:00:00Z',
          author: { name: 'Web Flow', email: 'noreply@github.com' },
        },
      ],
    }),
  );
  const env = baseActionEnv({ port, eventPath, overrides: { GITHUB_OUTPUT: outputPath } });

  const { code, stderr } = await runAction(env);
  assert.equal(code, 0, stderr);

  const embed = received[0].body.embeds[0];
  assert.ok(embed.description.includes('Web Flow'));

  rmSync(dir, { recursive: true, force: true });
});

test('E2E: a 429 response carrying retry_after is followed by a successful retry', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
  const outputPath = join(dir, 'outputs.env');
  writeFileSync(outputPath, '');

  const { port, received, close } = await startFakeWebhookServer([
    () => ({ status: 429, body: { retry_after: 0.05 } }),
    () => ({ status: 200, body: { id: 'msg-after-retry' } }),
  ]);
  t.after(() => close());

  const eventPath = writeEventFile(dir, basePushPayload());
  const env = baseActionEnv({ port, eventPath, overrides: { GITHUB_OUTPUT: outputPath } });

  const { code, stderr } = await runAction(env);
  assert.equal(code, 0, stderr);
  assert.equal(received.length, 2, 'expected exactly one retry after the 429');

  const outputs = require_outputs(outputPath);
  assert.equal(outputs.delivered, 'true');
  assert.equal(outputs.message_id, 'msg-after-retry');

  rmSync(dir, { recursive: true, force: true });
});

test('E2E: no credential value appears in the captured stdout/stderr logs', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
  const outputPath = join(dir, 'outputs.env');
  writeFileSync(outputPath, '');

  const { port, close } = await startFakeWebhookServer([
    () => ({ status: 200, body: { id: 'm' } }),
  ]);
  t.after(() => close());

  const eventPath = writeEventFile(dir, basePushPayload());
  const env = baseActionEnv({ port, eventPath, overrides: { GITHUB_OUTPUT: outputPath } });

  const { code, stdout, stderr } = await runAction(env);
  assert.equal(code, 0, stderr);

  // `::add-mask::<value>` is the Actions protocol command that *registers* a secret with the
  // runner so it masks every later occurrence; the real runner intercepts this command and
  // never renders it back in the log viewer. It is the mechanism, not a leak, so it is excluded
  // here. Every other line must never contain the token or the full webhook URL.
  const isMaskDirective = (line) => line.startsWith('::add-mask::');

  const stdoutLeak = stdout
    .split('\n')
    .filter((line) => !isMaskDirective(line) && line.includes('abcdef'));
  const stderrLeak = stderr
    .split('\n')
    .filter((line) => !isMaskDirective(line) && line.includes('abcdef'));

  assert.deepEqual(stdoutLeak, []);
  assert.deepEqual(stderrLeak, []);

  rmSync(dir, { recursive: true, force: true });
});

function require_outputs(path) {
  const content = readFileSync(path, 'utf8');
  const outputs = {};
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^([A-Za-z0-9_]+)<<(.+)$/);
    if (match) {
      const [, key, delimiter] = match;
      const values = [];
      i += 1;
      while (i < lines.length && lines[i] !== delimiter) {
        values.push(lines[i]);
        i += 1;
      }
      outputs[key] = values.join('\n');
    }
  }
  return outputs;
}
