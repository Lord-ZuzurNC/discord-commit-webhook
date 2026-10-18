import { truncateSubject } from './truncate.js';
import {
  resolveAuthorLabel,
  censorLabel,
  collectIdentities,
  scrubIdentities,
  isCensoredIdentity,
} from './author.js';
import { stripUrls } from './links.js';
import { escapeMarkdown } from './markdown.js';

function commitSubject(commit) {
  const message = typeof commit.message === 'string' ? commit.message : '';
  return message.split('\n')[0];
}

/**
 * Whether any censoring was requested at all.
 *
 * Listing names implies censoring: there is no reason to list them otherwise.
 */
export function censoringRequested(config) {
  return Boolean(config.censorUsername) || (config.censorNames ?? []).length > 0;
}

function buildAuthorLabel(commit, config, identities) {
  const label = resolveAuthorLabel(commit.author);
  // With an explicit list, only the listed people are masked; everyone else
  // keeps their name.
  return isCensoredIdentity(label, identities) ? censorLabel(label) : label;
}

function buildCommitLine(commit, config, identities) {
  const abbreviatedId = typeof commit.id === 'string' ? commit.id.slice(0, 7) : '';

  let subject = commitSubject(commit);
  if (config.hideLinks) {
    subject = stripUrls(subject);
  }
  if (identities.length > 0) {
    // Before truncating, so the length budget applies to the displayed text.
    subject = scrubIdentities(subject, identities);
  }
  subject = truncateSubject(subject, config.commitMessageMaxLength);

  const idSpan = config.hideLinks
    ? `\`${abbreviatedId}\``
    : `[\`${abbreviatedId}\`](${commit.url})`;

  const authorLabel = buildAuthorLabel(commit, config, identities);

  // Only the free text is escaped: the id span is ours and must keep working as
  // a code span and a link.
  return `${idSpan} ${escapeMarkdown(subject)} — ${escapeMarkdown(authorLabel)}`;
}

function branchShortName(ref) {
  const prefix = 'refs/heads/';
  if (typeof ref === 'string' && ref.startsWith(prefix)) {
    return ref.slice(prefix.length);
  }
  return typeof ref === 'string' ? ref : '';
}

function buildFooterText(payload, identities) {
  const branch = branchShortName(payload.ref);
  const pusherName = payload.pusher?.name;
  if (typeof pusherName === 'string' && pusherName.length > 0) {
    // Not escaped: Discord renders no Markdown in a footer, so the mask is safe
    // here as-is and backslashes would be shown literally.
    const shown = isCensoredIdentity(pusherName, identities) ? censorLabel(pusherName) : pusherName;
    return `${branch} · ${shown}`;
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

  // Collected from every commit in the push, not just the listed ones: a listed
  // subject can name the author of a commit that did not make the cut.
  // `censor_username` sweeps in everyone it can detect; `censor_names` adds the
  // names the workflow listed, and on its own restricts censoring to them.
  const identities = censoringRequested(config)
    ? collectIdentities(commits, payload.pusher?.name, {
        includeAuthors: Boolean(config.censorUsername),
        explicitNames: config.censorNames ?? [],
      })
    : [];

  const lines = listedCommits.map((commit) => buildCommitLine(commit, config, identities));
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
    footer: { text: buildFooterText(payload, identities) },
    timestamp: mostRecentCommit?.timestamp,
    color: config.color,
  };
}
