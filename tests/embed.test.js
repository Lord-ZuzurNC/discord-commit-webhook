import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmbed } from '../src/embed.js';

function baseConfig(overrides = {}) {
  return {
    repoName: '',
    censorUsername: false,
    hideLinks: false,
    color: 0x7dbbe6,
    maxCommits: 10,
    commitMessageMaxLength: 120,
    ...overrides,
  };
}

function basePayload(overrides = {}) {
  return {
    ref: 'refs/heads/main',
    compare: 'https://github.com/acme/widgets/compare/aaa...bbb',
    repository: { full_name: 'acme/widgets' },
    pusher: { name: 'octocat' },
    commits: [
      {
        id: '1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        message: 'first commit\n\nlonger body here',
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

test('title pluralises correctly for a single commit', () => {
  const payload = basePayload({ commits: [basePayload().commits[0]] });
  const embed = buildEmbed(payload, baseConfig());
  assert.equal(embed.title, '1 new commit');
});

test('title pluralises correctly for multiple commits', () => {
  const embed = buildEmbed(basePayload(), baseConfig());
  assert.equal(embed.title, '2 new commits');
});

test('title has no leading, trailing, or doubled whitespace', () => {
  const embed = buildEmbed(basePayload(), baseConfig());
  assert.equal(embed.title, embed.title.trim());
  assert.doesNotMatch(embed.title, /\s{2,}/);
});

test('uses repo_name override when non-empty', () => {
  const embed = buildEmbed(basePayload(), baseConfig({ repoName: 'custom/name' }));
  assert.equal(embed.author.name, 'custom/name');
});

test('falls back to repository.full_name when repo_name is empty', () => {
  const embed = buildEmbed(basePayload(), baseConfig());
  assert.equal(embed.author.name, 'acme/widgets');
});

test('author block links to the compare URL when links are allowed', () => {
  const embed = buildEmbed(basePayload(), baseConfig({ hideLinks: false }));
  assert.equal(embed.author.url, 'https://github.com/acme/widgets/compare/aaa...bbb');
});

test('author block has no url when hide_links is enabled', () => {
  const embed = buildEmbed(basePayload(), baseConfig({ hideLinks: true }));
  assert.equal(embed.author.url, undefined);
});

test('footer combines branch and pusher name with a middle-dot separator', () => {
  const embed = buildEmbed(basePayload(), baseConfig());
  assert.equal(embed.footer.text, 'main · octocat');
});

test('footer omits the pusher segment when pusher name is absent', () => {
  const embed = buildEmbed(basePayload({ pusher: undefined }), baseConfig());
  assert.equal(embed.footer.text, 'main');
});

test('timestamp is the most recent commit timestamp', () => {
  const embed = buildEmbed(basePayload(), baseConfig());
  assert.equal(embed.timestamp, '2026-01-01T11:00:00Z');
});

test('colour is the resolved color input as an integer', () => {
  const embed = buildEmbed(basePayload(), baseConfig({ color: 0x00ff00 }));
  assert.equal(embed.color, 0x00ff00);
});

test('commits are listed oldest first, matching payload.commits order', () => {
  const embed = buildEmbed(basePayload(), baseConfig());
  const lines = embed.description.split('\n');
  assert.ok(lines[0].includes('1111111'));
  assert.ok(lines[1].includes('2222222'));
});

test('commit subject takes only the first line of the message', () => {
  const embed = buildEmbed(basePayload(), baseConfig());
  assert.ok(embed.description.includes('first commit'));
  assert.ok(!embed.description.includes('longer body here'));
});

test('commit id is a linked code span when links are allowed', () => {
  const embed = buildEmbed(basePayload(), baseConfig({ hideLinks: false }));
  assert.ok(
    embed.description.includes('[`1111111`](https://github.com/acme/widgets/commit/1111111)'),
  );
});

test('commit id is a bare code span when links are hidden', () => {
  const embed = buildEmbed(basePayload(), baseConfig({ hideLinks: true }));
  assert.ok(embed.description.includes('`1111111`'));
  assert.ok(!embed.description.includes('['));
});

test('appends a correctly pluralised "…and N more" line when commits exceed max_commits', () => {
  const commits = Array.from({ length: 12 }, (_, i) => ({
    id: `${i}`.padStart(7, '0'),
    message: `commit number ${i}`,
    url: `https://github.com/acme/widgets/commit/${i}`,
    timestamp: '2026-01-01T10:00:00Z',
    author: { username: 'alice' },
  }));
  const embed = buildEmbed(basePayload({ commits }), baseConfig({ maxCommits: 10 }));
  assert.ok(embed.description.endsWith('…and 2 more'));
});

test('uses singular "…and 1 more" when exactly one commit remains', () => {
  const commits = Array.from({ length: 11 }, (_, i) => ({
    id: `${i}`.padStart(7, '0'),
    message: `commit number ${i}`,
    url: `https://github.com/acme/widgets/commit/${i}`,
    timestamp: '2026-01-01T10:00:00Z',
    author: { username: 'alice' },
  }));
  const embed = buildEmbed(basePayload({ commits }), baseConfig({ maxCommits: 10 }));
  assert.ok(embed.description.endsWith('…and 1 more'));
});

test('no "…and N more" line when all commits fit within max_commits', () => {
  const embed = buildEmbed(basePayload(), baseConfig({ maxCommits: 10 }));
  assert.ok(!embed.description.includes('…and'));
});

test('REGRESSION: censor_username=false (via config boolean false) leaves author names intact', () => {
  const embed = buildEmbed(basePayload(), baseConfig({ censorUsername: false }));
  assert.ok(embed.description.includes('alice'));
  assert.ok(embed.description.includes('bob'));
});

test('censor_username=true masks author names, with the mask escaped', () => {
  const embed = buildEmbed(basePayload(), baseConfig({ censorUsername: true }));
  // The asterisks are escaped so they cannot open Markdown formatting that
  // spills across the surrounding commit lines.
  assert.ok(embed.description.includes('a\\*\\*\\*'));
  assert.ok(embed.description.includes('b\\*\\*\\*'));
  assert.ok(!embed.description.includes('alice'));
  assert.ok(!embed.description.includes('bob'));
});

test('a commit with no author.username falls back through the chain without crashing', () => {
  const payload = basePayload({
    commits: [
      {
        id: '3333333cccccccccccccccccccccccccccccccc',
        message: 'web ui commit',
        url: 'https://github.com/acme/widgets/commit/3333333',
        timestamp: '2026-01-01T12:00:00Z',
        author: { name: 'Web Flow', email: 'noreply@github.com' },
      },
    ],
  });
  assert.doesNotThrow(() => buildEmbed(payload, baseConfig()));
  const embed = buildEmbed(payload, baseConfig());
  assert.ok(embed.description.includes('Web Flow'));
});

test('hide_links strips bare URLs out of a commit subject', () => {
  const payload = basePayload({
    commits: [
      {
        id: '4444444dddddddddddddddddddddddddddddddd',
        message: 'see https://example.com/issue/1 for context',
        url: 'https://github.com/acme/widgets/commit/4444444',
        timestamp: '2026-01-01T12:00:00Z',
        author: { username: 'carol' },
      },
    ],
  });
  const embed = buildEmbed(payload, baseConfig({ hideLinks: true }));
  assert.doesNotMatch(embed.description, /https?:\/\//);
});

test('hide_links=true produces a description with no URL of any kind', () => {
  const embed = buildEmbed(basePayload(), baseConfig({ hideLinks: true }));
  assert.doesNotMatch(embed.description, /https?:\/\//);
  assert.equal(embed.author.url, undefined);
});

test('branch short name strips the refs/heads/ prefix', () => {
  const embed = buildEmbed(basePayload({ ref: 'refs/heads/feature/login' }), baseConfig());
  assert.ok(embed.footer.text.startsWith('feature/login'));
});

test('long commit subjects are truncated with an ellipsis', () => {
  const longMessage = 'x'.repeat(200);
  const payload = basePayload({
    commits: [
      {
        id: '5555555eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        message: longMessage,
        url: 'https://github.com/acme/widgets/commit/5555555',
        timestamp: '2026-01-01T12:00:00Z',
        author: { username: 'dave' },
      },
    ],
  });
  const embed = buildEmbed(payload, baseConfig({ commitMessageMaxLength: 20 }));
  assert.ok(embed.description.includes('…'));
  assert.ok(!embed.description.includes('x'.repeat(200)));
});
