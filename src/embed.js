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
import { applyFormat, DEFAULT_FORMATS } from './format.js';
import { LIMITS, clampText, fitDescription } from './limits.js';

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

function buildAuthorLabel(commit, identities) {
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

  // `{sha}` is the rendered span rather than a bare id plus a separate `{url}`:
  // handing the URL to a format string would let it put a link back in and
  // defeat `hide_links`.
  const shaSpan = config.hideLinks
    ? `\`${abbreviatedId}\``
    : `[\`${abbreviatedId}\`](${commit.url})`;

  // The description renders Markdown, so the values are escaped here. The
  // format string is not escaped: it comes from the workflow and may style the
  // line on purpose.
  return applyFormat(
    config.commitFormat ?? DEFAULT_FORMATS.commitFormat,
    {
      sha: shaSpan,
      subject: escapeMarkdown(subject),
      author: escapeMarkdown(buildAuthorLabel(commit, identities)),
    },
    'commit_format',
  );
}

function branchShortName(ref) {
  const prefix = 'refs/heads/';
  if (typeof ref === 'string' && ref.startsWith(prefix)) {
    return ref.slice(prefix.length);
  }
  return typeof ref === 'string' ? ref : '';
}

function repoDisplayName(config, payload) {
  return config.repoName ? config.repoName : (payload.repository?.full_name ?? '');
}

function pluralise(count) {
  return count === 1 ? 'commit' : 'commits';
}

/**
 * Build the single Discord embed describing a push event.
 */
export function buildEmbed(payload, config) {
  const commits = Array.isArray(payload.commits) ? payload.commits : [];
  const total = commits.length;

  const listedCommits = commits.slice(0, config.maxCommits);

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

  const commitLines = listedCommits.map((commit) => buildCommitLine(commit, config, identities));

  const buildMoreLine = (remaining) =>
    applyFormat(
      config.moreFormat ?? DEFAULT_FORMATS.moreFormat,
      { count: remaining, commits: pluralise(remaining) },
      'more_format',
    );

  const branch = branchShortName(payload.ref);
  const repo = repoDisplayName(config, payload);

  const pusherName = payload.pusher?.name;
  let pusher = '';
  if (typeof pusherName === 'string' && pusherName.length > 0) {
    pusher = isCensoredIdentity(pusherName, identities) ? censorLabel(pusherName) : pusherName;
  }

  // title, author.name and footer.text are plain text in Discord: no Markdown
  // is rendered there, so escaping them would show the backslashes.
  const title = applyFormat(
    config.titleFormat ?? DEFAULT_FORMATS.titleFormat,
    { count: total, commits: pluralise(total), branch, repo },
    'title_format',
  );

  const authorName = applyFormat(
    config.repoFormat ?? DEFAULT_FORMATS.repoFormat,
    { repo, branch, count: total, commits: pluralise(total) },
    'repo_format',
  );

  const footerText = applyFormat(
    config.footerFormat ?? DEFAULT_FORMATS.footerFormat,
    { branch, pusher, repo, count: total, commits: pluralise(total) },
    'footer_format',
  );

  const author = { name: clampText(authorName, LIMITS.authorName) };
  if (!config.hideLinks && payload.compare) {
    author.url = payload.compare;
  }

  const mostRecentCommit = commits[commits.length - 1];

  return {
    author,
    title: clampText(title, LIMITS.title),
    description: fitDescription(commitLines, total, buildMoreLine),
    footer: { text: clampText(footerText, LIMITS.footerText) },
    timestamp: mostRecentCommit?.timestamp,
    color: config.color,
  };
}
