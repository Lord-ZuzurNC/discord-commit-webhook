import test from 'node:test';
import assert from 'node:assert/strict';

import { parseNameList } from '../src/inputs.js';
import { riskyNames, collectIdentities, scrubIdentities } from '../src/author.js';
import { buildEmbed, censoringRequested } from '../src/embed.js';

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
    timestamp: '2026-10-18T04:00:00+02:00',
    url: `https://github.com/o/r/commit/${id}`,
    author,
  };
}

function payload() {
  return {
    ref: 'refs/heads/main',
    compare: 'https://github.com/o/r/compare/a...b',
    pusher: { name: 'carol' },
    repository: { full_name: 'o/r' },
    commits: [
      commit('aaa1111', 'feat: work by alice', { username: 'alice' }),
      commit('bbb2222', 'Merge pull request #1 from bob/wip', { username: 'bob' }),
    ],
  };
}

test('parses a comma-separated list', () => {
  assert.deepEqual(parseNameList('a, b ,c'), ['a', 'b', 'c']);
});

test('parses a block scalar, one name per line', () => {
  assert.deepEqual(parseNameList('username1\nanothercontributor\n\nathirdparty\n'), [
    'username1',
    'anothercontributor',
    'athirdparty',
  ]);
});

test('parses the two delimiters mixed, and deduplicates', () => {
  assert.deepEqual(parseNameList('a\nb, a\n'), ['a', 'b']);
});

test('an absent or blank list parses to nothing', () => {
  assert.deepEqual(parseNameList(''), []);
  assert.deepEqual(parseNameList('   \n  '), []);
  assert.deepEqual(parseNameList(undefined), []);
});

test('censoring is off unless one of the two inputs asks for it', () => {
  assert.equal(censoringRequested({ censorUsername: false, censorNames: [] }), false);
  assert.equal(censoringRequested({ censorUsername: true, censorNames: [] }), true);
  assert.equal(censoringRequested({ censorUsername: false, censorNames: ['x'] }), true);
});

test('censor_names masks only the listed people', () => {
  const embed = buildEmbed(payload(), { ...BASE_CONFIG, censorNames: ['alice'] });

  assert.ok(embed.description.includes('a\\*\\*\\*'), embed.description);
  assert.ok(!embed.description.includes('alice'), embed.description);
  // bob was not listed, so he keeps his name.
  assert.ok(embed.description.includes('bob'), embed.description);
});

test('censor_names leaves an unlisted pusher alone in the footer', () => {
  const embed = buildEmbed(payload(), { ...BASE_CONFIG, censorNames: ['alice'] });
  assert.equal(embed.footer.text, 'main · carol');
});

test('censor_names masks the pusher when the pusher is listed', () => {
  const embed = buildEmbed(payload(), { ...BASE_CONFIG, censorNames: ['carol'] });
  assert.equal(embed.footer.text, 'main · c***');
});

test('censor_username still sweeps in everyone detected', () => {
  const embed = buildEmbed(payload(), { ...BASE_CONFIG, censorUsername: true });

  assert.ok(!embed.description.includes('alice'), embed.description);
  assert.ok(!embed.description.includes('bob'), embed.description);
  assert.equal(embed.footer.text, 'main · c***');
});

test('the two inputs combine as a union', () => {
  const withExtra = buildEmbed(payload(), {
    ...BASE_CONFIG,
    censorUsername: true,
    censorNames: ['wip'],
  });

  assert.ok(!withExtra.description.includes('alice'), withExtra.description);
  assert.ok(withExtra.description.includes('w\\*\\*\\*'), withExtra.description);
});

test('a listed name shorter than the auto floor is still honoured', () => {
  // The user named `al` deliberately, so it is censored even though the
  // auto-detection would have skipped a label that short.
  const identities = collectIdentities([], null, {
    includeAuthors: false,
    explicitNames: ['al'],
  });

  assert.deepEqual(identities, ['al']);
  assert.equal(scrubIdentities('thanks al', identities), 'thanks a***');
});

test('a hyphenated neighbour is left intact', () => {
  // The boundary excludes hyphens, so `al` does not carve up `al-dente`.
  assert.equal(scrubIdentities('chore: al-dente pasta', ['al']), 'chore: al-dente pasta');
});

test('a substring of a longer word is left intact', () => {
  assert.equal(scrubIdentities('fix: already done', ['al']), 'fix: already done');
  assert.equal(scrubIdentities('fix: bobsleigh', ['bob']), 'fix: bobsleigh');
});

test('an auto-detected label shorter than three characters is skipped', () => {
  const identities = collectIdentities([commit('a', 'x', { username: 'al' })], 'ci');
  assert.deepEqual(identities, []);
});

test('flags listed names that are short or ordinary words', () => {
  assert.deepEqual(riskyNames(['al']), ['al']);
  assert.deepEqual(riskyNames(['refactor']), ['refactor']);
  assert.deepEqual(riskyNames(['main', 'wip']), ['main', 'wip']);
  assert.deepEqual(riskyNames(['Lord-ZuzurNC', 'anothercontributor']), []);
});

test('a risky listed name is censored anyway, warning aside', () => {
  // Documents the deliberate trade-off: over-redacting mangles a word,
  // under-redacting exposes a person.
  assert.equal(
    scrubIdentities('refactor: split the parser', ['refactor']),
    'r***: split the parser',
  );
});
