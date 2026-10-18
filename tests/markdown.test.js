import test from 'node:test';
import assert from 'node:assert/strict';

import { escapeMarkdown } from '../src/markdown.js';
import { buildEmbed } from '../src/embed.js';

const BASE_CONFIG = {
  censorUsername: false,
  hideLinks: false,
  color: 0x7dbbe6,
  maxCommits: 10,
  commitMessageMaxLength: 120,
  repoName: '',
};

function commit(overrides = {}) {
  return {
    id: 'aaaaaaa1111111111111111111111111111111111',
    message: 'feat: something',
    timestamp: '2026-10-18T03:00:00+02:00',
    url: 'https://github.com/o/r/commit/aaaaaaa1',
    author: { name: 'Alice', username: 'alice' },
    ...overrides,
  };
}

function payload(commits) {
  return {
    ref: 'refs/heads/main',
    compare: 'https://github.com/o/r/compare/a...b',
    pusher: { name: 'pusher' },
    repository: { full_name: 'o/r' },
    commits,
  };
}

test('escapes every Discord Markdown control character', () => {
  assert.equal(escapeMarkdown('*bold*'), '\\*bold\\*');
  assert.equal(escapeMarkdown('_under_'), '\\_under\\_');
  assert.equal(escapeMarkdown('~strike~'), '\\~strike\\~');
  assert.equal(escapeMarkdown('`code`'), '\\`code\\`');
  assert.equal(escapeMarkdown('||spoiler||'), '\\|\\|spoiler\\|\\|');
  assert.equal(escapeMarkdown('[link]'), '\\[link\\]');
});

test('escapes a backslash exactly once', () => {
  assert.equal(escapeMarkdown('a\\b'), 'a\\\\b');
});

test('leaves ordinary text untouched', () => {
  assert.equal(escapeMarkdown('fix: plain subject 123'), 'fix: plain subject 123');
});

test('returns an empty string for a non-string input', () => {
  assert.equal(escapeMarkdown(undefined), '');
  assert.equal(escapeMarkdown(null), '');
  assert.equal(escapeMarkdown(42), '');
});

test('the censored author label cannot open Markdown formatting', () => {
  // Regression: the `***` mask used to pair across lines and render whole
  // commit lines in bold italic.
  const embed = buildEmbed(payload([commit(), commit({ id: 'bbbbbbb2' })]), {
    ...BASE_CONFIG,
    censorUsername: true,
  });

  assert.ok(embed.description.includes('a\\*\\*\\*'), embed.description);
  assert.ok(!/(^|[^\\])\*/.test(embed.description), 'an unescaped asterisk survived');
});

test('a commit subject cannot open Markdown formatting', () => {
  const embed = buildEmbed(
    payload([commit({ message: 'fix: handle *args and _kwargs_ and `ticks`' })]),
    BASE_CONFIG,
  );

  assert.ok(embed.description.includes('\\*args'), embed.description);
  assert.ok(embed.description.includes('\\_kwargs\\_'), embed.description);
  assert.ok(embed.description.includes('\\`ticks\\`'), embed.description);
});

test('a commit subject cannot forge a Markdown link', () => {
  const embed = buildEmbed(
    payload([commit({ message: 'docs: see [the docs](https://evil.example.com)' })]),
    BASE_CONFIG,
  );

  assert.ok(embed.description.includes('\\[the docs\\]'), embed.description);
});

test('the commit id span stays a working code span and link', () => {
  const embed = buildEmbed(payload([commit()]), BASE_CONFIG);

  assert.ok(
    embed.description.startsWith('[`aaaaaaa`](https://github.com/o/r/commit/aaaaaaa1)'),
    embed.description,
  );
});

test('the id span stays a bare code span when links are hidden', () => {
  const embed = buildEmbed(payload([commit()]), { ...BASE_CONFIG, hideLinks: true });

  assert.ok(embed.description.startsWith('`aaaaaaa` '), embed.description);
});

test('plain fields are not escaped, since Discord renders no Markdown there', () => {
  // Escaping these would show the backslashes to the user.
  const embed = buildEmbed(payload([commit()]), {
    ...BASE_CONFIG,
    repoName: 'my_repo*name',
  });

  assert.equal(embed.author.name, 'my_repo*name');
  assert.equal(embed.footer.text, 'main · pusher');
  assert.equal(embed.title, '1 new commit');
});
