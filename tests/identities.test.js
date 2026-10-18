import test from 'node:test';
import assert from 'node:assert/strict';

import { collectIdentities, scrubIdentities } from '../src/author.js';
import { buildEmbed } from '../src/embed.js';

const BASE_CONFIG = {
  censorUsername: false,
  hideLinks: false,
  color: 0xe67e22,
  maxCommits: 10,
  commitMessageMaxLength: 200,
  repoName: '',
};

function commit(id, message, author) {
  return {
    id,
    message,
    timestamp: '2026-10-18T03:25:00+02:00',
    url: `https://github.com/Lord-ZuzurNC/discord-commit-webhook/commit/${id}`,
    author,
  };
}

// Lord's real orange embed: three commits, two of them merge commits whose
// subject names the account even though the author label was masked.
function lordPayload() {
  const author = { name: 'Lord-ZuzurNC', username: 'Lord-ZuzurNC' };
  return {
    ref: 'refs/heads/selftest',
    compare: 'https://github.com/Lord-ZuzurNC/discord-commit-webhook/compare/a...b',
    pusher: { name: 'Lord-ZuzurNC' },
    repository: { full_name: 'Lord-ZuzurNC/discord-commit-webhook' },
    commits: [
      commit('7161cc2', 'Merge pull request #7 from Lord-ZuzurNC/selftest', author),
      commit('6817b99', 'feat: little change on README to try selftest branch', author),
      commit(
        '7a12bda',
        "Merge branch 'main' of github.com:Lord-ZuzurNC/discord-commit-webhook",
        author,
      ),
    ],
  };
}

test('collects author labels and the pusher, longest first', () => {
  const identities = collectIdentities(
    [
      commit('a', 'x', { username: 'alice' }),
      commit('b', 'y', { username: 'bob' }),
      commit('c', 'z', { name: 'Christopher' }),
    ],
    'pusher-account',
  );

  assert.deepEqual(identities, ['pusher-account', 'Christopher', 'alice', 'bob']);
});

test('skips the unknown placeholder and deduplicates', () => {
  const identities = collectIdentities(
    [
      commit('a', 'x', {}),
      commit('b', 'y', { username: 'alice' }),
      commit('c', 'z', { username: 'alice' }),
    ],
    'alice',
  );

  assert.deepEqual(identities, ['alice']);
});

test('refuses to scrub a one- or two-character identity', () => {
  // Scrubbing `al` would turn "already" into "a***ready".
  const identities = collectIdentities([commit('a', 'x', { username: 'al' })], 'ci');
  assert.deepEqual(identities, []);
  assert.equal(scrubIdentities('already on ci', identities), 'already on ci');
});

test('scrubs an identity regardless of case', () => {
  assert.equal(scrubIdentities('from LORD-ZUZURNC/x', ['Lord-ZuzurNC']), 'from L***/x');
});

test('treats regex metacharacters in a name literally', () => {
  assert.equal(scrubIdentities('a.c and abc', ['a.c']), 'a*** and abc');
});

test('censoring removes the account from merge commit subjects', () => {
  const embed = buildEmbed(lordPayload(), { ...BASE_CONFIG, censorUsername: true });

  // Assert on the VISIBLE text: the link targets necessarily keep the account,
  // because a working GitHub commit URL contains the repository owner.
  const visible = embed.description.replace(/\]\([^)]*\)/g, ']');

  assert.ok(!visible.includes('Lord-ZuzurNC'), `account still visible: ${visible}`);
  assert.ok(embed.description.includes('L\\*\\*\\*/selftest'), embed.description);
  assert.ok(embed.description.includes('github.com:L\\*\\*\\*/'), embed.description);
});

test('censoring alone cannot hide the account from the link targets', () => {
  // Documents the real limit of the option, so a later change cannot quietly
  // claim a guarantee the action does not provide.
  const embed = buildEmbed(lordPayload(), { ...BASE_CONFIG, censorUsername: true });

  assert.equal((embed.description.match(/Lord-ZuzurNC/g) || []).length, 3);
});

test('censoring plus hide_links leaves the account nowhere in the description', () => {
  const embed = buildEmbed(lordPayload(), {
    ...BASE_CONFIG,
    censorUsername: true,
    hideLinks: true,
  });

  assert.ok(!embed.description.includes('Lord-ZuzurNC'), embed.description);
  assert.ok(!/https?:\/\//.test(embed.description), embed.description);
});

test('censoring masks the pusher in the footer', () => {
  const embed = buildEmbed(lordPayload(), { ...BASE_CONFIG, censorUsername: true });

  assert.equal(embed.footer.text, 'selftest · L***');
  // The footer is not Markdown-rendered, so the mask must NOT be escaped there.
  assert.ok(!embed.footer.text.includes('\\'), embed.footer.text);
});

test('censoring off leaves subjects and footer untouched', () => {
  const embed = buildEmbed(lordPayload(), BASE_CONFIG);

  assert.ok(embed.description.includes('Lord-ZuzurNC/selftest'), embed.description);
  assert.equal(embed.footer.text, 'selftest · Lord-ZuzurNC');
});

test('an identity from an unlisted commit is still scrubbed', () => {
  // `maxCommits: 1` lists only the merge commit, whose subject names mallory.
  const payload = {
    ref: 'refs/heads/main',
    compare: 'https://github.com/o/r/compare/a...b',
    pusher: { name: 'someone-else' },
    repository: { full_name: 'o/r' },
    commits: [
      commit('aaa1111', 'Merge pull request #1 from mallory-account/wip', { username: 'alice' }),
      commit('bbb2222', 'feat: work', { username: 'mallory-account' }),
    ],
  };

  const embed = buildEmbed(payload, { ...BASE_CONFIG, censorUsername: true, maxCommits: 1 });

  assert.ok(!embed.description.includes('mallory-account'), embed.description);
  assert.ok(embed.description.includes('m\\*\\*\\*/wip'), embed.description);
});

test('no unescaped asterisk survives the scrubbing', () => {
  const embed = buildEmbed(lordPayload(), { ...BASE_CONFIG, censorUsername: true });

  assert.ok(!/(^|[^\\])\*/.test(embed.description), embed.description);
});
