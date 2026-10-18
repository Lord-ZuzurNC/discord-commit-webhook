import test from 'node:test';
import assert from 'node:assert/strict';

import { applyFormat, validateFormat, DEFAULT_FORMATS, FORMAT_SPECS } from '../src/format.js';
import { clampText, fitDescription, LIMITS } from '../src/limits.js';
import { buildEmbed } from '../src/embed.js';

const BASE_CONFIG = {
  censorUsername: false,
  censorNames: [],
  hideLinks: false,
  color: 0x7dbbe6,
  maxCommits: 10,
  commitMessageMaxLength: 200,
  repoName: '',
};

function commit(id, message, author) {
  return {
    id,
    message,
    timestamp: '2026-10-18T05:00:00+02:00',
    url: `https://github.com/o/r/commit/${id}`,
    author,
  };
}

function payload(commits) {
  return {
    ref: 'refs/heads/main',
    compare: 'https://github.com/o/r/compare/a...b',
    pusher: { name: 'carol' },
    repository: { full_name: 'o/r' },
    commits,
  };
}

const ONE = [commit('aaa1111', 'feat: the thing', { username: 'alice' })];

test('substitutes every placeholder it is given', () => {
  assert.equal(applyFormat('{a}-{b}', { a: '1', b: '2' }, 'x'), '1-2');
});

test('a numeric value is stringified', () => {
  assert.equal(applyFormat('{count}', { count: 3 }, 'x'), '3');
});

test('doubled braces produce literal braces', () => {
  assert.equal(applyFormat('{{{a}}}', { a: 'v' }, 'x'), '{v}');
  assert.equal(applyFormat('{{a}}', { a: 'v' }, 'x'), '{a}');
});

test('a substituted value is never rescanned for placeholders', () => {
  // A commit subject must not be able to smuggle in a placeholder of its own.
  assert.equal(
    applyFormat('{subject}', { subject: '{author}', author: 'SECRET' }, 'x'),
    '{author}',
  );
});

test('an unknown placeholder fails, naming the input and what is available', () => {
  assert.throws(() => applyFormat('{nope}', { sha: '', subject: '' }, 'commit_format'), {
    message:
      'Input "commit_format" uses the unknown placeholder {nope}. Available placeholders: {sha}, {subject}.',
  });
});

test('validateFormat rejects a typo up front', () => {
  assert.throws(
    () => validateFormat('{autor}', ['author'], 'commit_format'),
    /unknown placeholder/,
  );
  assert.doesNotThrow(() => validateFormat('{author}', ['author'], 'commit_format'));
});

test('every declared default validates against its own placeholders', () => {
  for (const [inputName, spec] of Object.entries(FORMAT_SPECS)) {
    assert.doesNotThrow(
      () => validateFormat(spec.default, spec.placeholders, inputName),
      `default for ${inputName} is invalid`,
    );
  }
});

test('an empty placeholder does not leave a dangling separator', () => {
  assert.equal(applyFormat('{branch} · {pusher}', { branch: 'main', pusher: '' }, 'x'), 'main');
  assert.equal(applyFormat('{pusher} · {branch}', { branch: 'main', pusher: '' }, 'x'), 'main');
  assert.equal(applyFormat('{a} | {b}', { a: '', b: 'x' }, 'x'), 'x');
});

test('collapsing is driven by the empty value, not by the text edges', () => {
  // A value that legitimately ends in a separator must survive untouched.
  assert.equal(
    applyFormat('{sha} {subject}', { sha: '`a`', subject: 'use --flag -' }, 'x'),
    '`a` use --flag -',
  );
});

test('clampText shortens with an ellipsis and never splits an emoji', () => {
  assert.equal(clampText('abcdef', 10), 'abcdef');
  assert.equal(clampText('abcdef', 4), 'abc…');
  const clamped = clampText('😀😀😀😀', 3);
  assert.equal(Array.from(clamped).length, 3);
  assert.ok(!clamped.includes('\ufffd'));
});

test('fitDescription drops commit lines until it fits, and recounts the rest', () => {
  const lines = Array.from({ length: 5 }, (_, i) => 'x'.repeat(100) + i);
  const text = fitDescription(lines, 5, (n) => `…and ${n} more`, 250);

  assert.ok(text.length <= 250, `length ${text.length}`);
  assert.ok(text.endsWith('…and 3 more'), text);
});

test('fitDescription keeps everything when it already fits', () => {
  const text = fitDescription(['a', 'b'], 2, (n) => `…and ${n} more`, 4096);
  assert.equal(text, 'a\nb');
});

test('fitDescription clamps a single over-long line rather than posting nothing', () => {
  const text = fitDescription(['y'.repeat(50)], 1, (n) => `…and ${n} more`, 20);
  assert.equal(text.length, 20);
});

test('a custom commit_format places emoji and keeps the sha span working', () => {
  const embed = buildEmbed(payload(ONE), {
    ...BASE_CONFIG,
    commitFormat: '🔧 {sha} — {subject} (by {author})',
  });

  assert.equal(
    embed.description,
    '🔧 [`aaa1111`](https://github.com/o/r/commit/aaa1111) — feat: the thing (by alice)',
  );
});

test('custom title, header and footer formats are applied', () => {
  const embed = buildEmbed(payload(ONE), {
    ...BASE_CONFIG,
    titleFormat: '⚡ {count} {commits} on {branch}',
    repoFormat: '📁 {repo}',
    footerFormat: '🌳 {branch} · {pusher}',
  });

  assert.equal(embed.title, '⚡ 1 commit on main');
  assert.equal(embed.author.name, '📁 o/r');
  assert.equal(embed.footer.text, '🌳 main · carol');
});

test('a format string may use Markdown, which is not escaped', () => {
  // The template comes from the workflow, so it is trusted to style the line.
  const embed = buildEmbed(payload(ONE), {
    ...BASE_CONFIG,
    commitFormat: '{sha} **{subject}**',
  });

  assert.ok(embed.description.endsWith('**feat: the thing**'), embed.description);
});

test('the subject stays escaped inside a custom format', () => {
  const embed = buildEmbed(payload([commit('bbb2222', 'fix: handle *args', { username: 'bob' })]), {
    ...BASE_CONFIG,
    commitFormat: '{sha} **{subject}**',
  });

  assert.ok(embed.description.includes('\\*args'), embed.description);
});

test('a format string cannot put a link back when hide_links is on', () => {
  // There is no {url} placeholder, so hide_links stays authoritative.
  const embed = buildEmbed(payload(ONE), {
    ...BASE_CONFIG,
    hideLinks: true,
    commitFormat: '{sha} {subject}',
  });

  assert.ok(!/https?:\/\//.test(JSON.stringify(embed)), embed.description);
  assert.ok(embed.description.startsWith('`aaa1111` '), embed.description);
});

test('a custom more_format is applied to the overflow line', () => {
  const embed = buildEmbed(payload([...ONE, ...ONE, ...ONE]), {
    ...BASE_CONFIG,
    maxCommits: 1,
    moreFormat: '➕ {count} autres {commits}',
  });

  assert.ok(embed.description.endsWith('➕ 2 autres commits'), embed.description);
});

test('the defaults reproduce the shipped layout', () => {
  const withDefaults = buildEmbed(payload(ONE), BASE_CONFIG);
  const explicit = buildEmbed(payload(ONE), { ...BASE_CONFIG, ...DEFAULT_FORMATS });

  assert.deepEqual(withDefaults, explicit);
  assert.equal(explicit.title, '1 new commit');
  assert.equal(explicit.footer.text, 'main · carol');
});

test('plain fields are clamped to their Discord limits', () => {
  const embed = buildEmbed(payload(ONE), {
    ...BASE_CONFIG,
    titleFormat: 'T'.repeat(400),
    repoFormat: 'R'.repeat(400),
    footerFormat: 'F'.repeat(3000),
  });

  assert.equal(Array.from(embed.title).length, LIMITS.title);
  assert.equal(Array.from(embed.author.name).length, LIMITS.authorName);
  assert.equal(Array.from(embed.footer.text).length, LIMITS.footerText);
});
