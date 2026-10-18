import { truncateSubject } from './truncate.js';
import { resolveAuthorLabel, censorLabel } from './author.js';
import { stripUrls } from './links.js';

function commitSubject(commit) {
  const message = typeof commit.message === 'string' ? commit.message : '';
  return message.split('\n')[0];
}

function buildAuthorLabel(commit, config) {
  const label = resolveAuthorLabel(commit.author);
  return config.censorUsername ? censorLabel(label) : label;
}

function buildCommitLine(commit, config) {
  const abbreviatedId = typeof commit.id === 'string' ? commit.id.slice(0, 7) : '';

  let subject = commitSubject(commit);
  if (config.hideLinks) {
    subject = stripUrls(subject);
  }
  subject = truncateSubject(subject, config.commitMessageMaxLength);

  const idSpan = config.hideLinks
    ? `\`${abbreviatedId}\``
    : `[\`${abbreviatedId}\`](${commit.url})`;

  const authorLabel = buildAuthorLabel(commit, config);

  return `${idSpan} ${subject} — ${authorLabel}`;
}

function branchShortName(ref) {
  const prefix = 'refs/heads/';
  if (typeof ref === 'string' && ref.startsWith(prefix)) {
    return ref.slice(prefix.length);
  }
  return typeof ref === 'string' ? ref : '';
}

function buildFooterText(payload) {
  const branch = branchShortName(payload.ref);
  const pusherName = payload.pusher?.name;
  if (typeof pusherName === 'string' && pusherName.length > 0) {
    return `${branch} · ${pusherName}`;
  }
  return branch;
}

function repoDisplayName(config, payload) {
  return config.repoName ? config.repoName : payload.repository?.full_name;
}

/**
 * Build the single Discord embed describing a push event.
 */
export function buildEmbed(payload, config) {
  const commits = Array.isArray(payload.commits) ? payload.commits : [];
  const total = commits.length;

  const listedCommits = commits.slice(0, config.maxCommits);
  const remaining = total - listedCommits.length;

  const lines = listedCommits.map((commit) => buildCommitLine(commit, config));
  if (remaining > 0) {
    lines.push(`…and ${remaining} more`);
  }

  const title = `${total} new commit${total === 1 ? '' : 's'}`;
  const mostRecentCommit = commits[commits.length - 1];

  const author = { name: repoDisplayName(config, payload) };
  if (!config.hideLinks && payload.compare) {
    author.url = payload.compare;
  }

  return {
    author,
    title,
    description: lines.join('\n'),
    footer: { text: buildFooterText(payload) },
    timestamp: mostRecentCommit?.timestamp,
    color: config.color,
  };
}
