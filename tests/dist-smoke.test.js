import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const distEntryPoint = join(projectRoot, 'dist', 'index.js');

/**
 * Exercises the actually committed `dist/index.js` bundle, not `src/index.js`.
 *
 * This is the file the GitHub runner executes, and it is a different module
 * context than the ESM sources: the repository's `package.json` declares
 * `"type": "module"`, so without `dist/package.json` overriding it back to
 * `"commonjs"`, Node refuses to load the esbuild CJS bundle at all. A test
 * against `src/index.js` alone cannot catch that class of bug.
 */
test('the committed dist/index.js bundle loads and runs as CommonJS, and delivers a push event', async (t) => {
  if (!existsSync(distEntryPoint)) {
    t.skip('dist/index.js has not been built yet; run "npm run build" first');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'dist-smoke-'));
  const outputPath = join(dir, 'outputs.env');
  writeFileSync(outputPath, '');

  let received = null;
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      received = { url: req.url, body: raw ? JSON.parse(raw) : null };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'dist-smoke-message' }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const eventPath = join(dir, 'event.json');
  writeFileSync(
    eventPath,
    JSON.stringify({
      ref: 'refs/heads/main',
      compare: 'https://github.com/acme/widgets/compare/aaa...bbb',
      repository: { full_name: 'acme/widgets' },
      pusher: { name: 'octocat' },
      commits: [
        {
          id: '1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          message: 'smoke test commit',
          url: 'https://github.com/acme/widgets/commit/1111111',
          timestamp: '2026-01-01T10:00:00Z',
          author: { username: 'alice' },
        },
      ],
    }),
  );

  const env = {
    ...process.env,
    GITHUB_EVENT_NAME: 'push',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: outputPath,
    INPUT_WEBHOOK_URL: `http://127.0.0.1:${port}/webhook/1/a`,
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
  };

  const { code, stderr } = await new Promise((resolve) => {
    const child = spawn(process.execPath, [distEntryPoint], { env });
    let stdout = '';
    let stderrOut = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderrOut += c));
    child.on('close', (exitCode) => resolve({ code: exitCode, stdout, stderr: stderrOut }));
  });

  assert.equal(code, 0, `dist/index.js must run cleanly as CommonJS; stderr: ${stderr}`);
  assert.ok(received, 'the fake webhook server should have received a request');
  assert.ok(received.body.embeds[0].description.includes('alice'));

  rmSync(dir, { recursive: true, force: true });
});
