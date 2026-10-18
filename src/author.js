/**
 * Resolve the author label for a commit, matching GitHub's own fallback chain.
 *
 * `commit.author.username` is frequently absent: commits authored through the
 * GitHub web UI, by bots, or by an email address not linked to any GitHub
 * account carry no `username`. Falling through to `name`, then to the
 * literal `unknown`, keeps the action from crashing on these commits.
 */
export function resolveAuthorLabel(author) {
  const username = author?.username;
  if (typeof username === 'string' && username.length > 0) {
    return username;
  }

  const name = author?.name;
  if (typeof name === 'string' && name.length > 0) {
    return name;
  }

  return 'unknown';
}

/**
 * Censor an author label down to its first character plus three asterisks.
 *
 * Only the first character is ever revealed: showing the last character too
 * would leak more identifying information than the option is meant to hide.
 */
export function censorLabel(label) {
  if (!label) {
    return '***';
  }

  const firstCodePoint = Array.from(label)[0];
  return `${firstCodePoint}***`;
}

// Auto-detected identities below this length are not scrubbed. An explicit
// `censor_names` entry is honoured whatever its length: the user asked for it by
// name, and silently ignoring it in a privacy feature would be worse than the
// mangling it may cause. A warning is emitted instead.
const MIN_AUTO_SCRUBBABLE_LENGTH = 3;

// Names that are also ordinary words in commit messages. Censoring one of these
// redacts the word everywhere it appears, which no matching rule can avoid:
// in `refactor: split the parser`, `refactor` IS a whole word.
const COMMON_WORDS = new Set([
  'add',
  'admin',
  'all',
  'api',
  'app',
  'bot',
  'build',
  'bump',
  'chore',
  'ci',
  'core',
  'deps',
  'dev',
  'doc',
  'docs',
  'feat',
  'fix',
  'init',
  'lib',
  'main',
  'master',
  'merge',
  'new',
  'old',
  'perf',
  'prod',
  'refactor',
  'release',
  'remove',
  'revert',
  'src',
  'style',
  'test',
  'tests',
  'update',
  'user',
  'wip',
]);

// Four characters, to catch two-letter handles and the likes of `ci` and `wip`
// that would otherwise redact half a changelog.
const SHORT_NAME_LENGTH = 4;

/**
 * Report which explicitly listed names are likely to redact ordinary words.
 *
 * Returned so the caller can warn: the names are still censored, because the
 * user named them deliberately.
 */
export function riskyNames(names) {
  return (Array.isArray(names) ? names : []).filter(
    (name) => Array.from(name).length < SHORT_NAME_LENGTH || COMMON_WORDS.has(name.toLowerCase()),
  );
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the match pattern for one identity.
 *
 * Neither a word character nor a hyphen may sit against either edge. Plain
 * `\b` is not enough: it treats a hyphen as a boundary, so an author named `al`
 * would still turn `al-dente` into `a***-dente`. Hyphens inside the name itself
 * are unaffected, which keeps `Lord-ZuzurNC` matching in `github.com:Lord-ZuzurNC/repo`.
 */
function identityPattern(name) {
  return new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, 'gi');
}

/**
 * Collect every identity that appears in a push, for scrubbing out of free text.
 *
 * A commit subject routinely names an account even when the author label is
 * censored: merge commits read `Merge pull request #7 from owner/branch` and
 * `Merge branch 'main' of github.com:owner/repo`. Masking only the trailing
 * author label would leave those in clear and defeat the option.
 *
 * Returned longest first, so that a short identity cannot carve up a longer one
 * it happens to be a prefix of.
 */
export function collectIdentities(commits, pusherName, options = {}) {
  const { includeAuthors = true, explicitNames = [] } = options;
  const names = new Set();

  if (includeAuthors) {
    for (const commit of Array.isArray(commits) ? commits : []) {
      const label = resolveAuthorLabel(commit?.author);
      if (label && label !== 'unknown' && Array.from(label).length >= MIN_AUTO_SCRUBBABLE_LENGTH) {
        names.add(label);
      }
    }

    if (
      typeof pusherName === 'string' &&
      Array.from(pusherName).length >= MIN_AUTO_SCRUBBABLE_LENGTH
    ) {
      names.add(pusherName);
    }
  }

  // Explicit entries bypass the length floor on purpose.
  for (const name of explicitNames) {
    if (typeof name === 'string' && name.length > 0) {
      names.add(name);
    }
  }

  return Array.from(names).sort((a, b) => b.length - a.length);
}

/**
 * Whether `name` is one of the identities being censored, compared case-insensitively.
 */
export function isCensoredIdentity(name, identities) {
  if (typeof name !== 'string' || name.length === 0) {
    return false;
  }
  const lowered = name.toLowerCase();
  return identities.some((identity) => identity.toLowerCase() === lowered);
}

/**
 * Replace every occurrence of a known identity in `text` with its censored form.
 *
 * Matching is a literal, case-insensitive replacement of a bounded set of known
 * strings — never a heuristic guess at what might be a username.
 */
export function scrubIdentities(text, identities) {
  let result = typeof text === 'string' ? text : '';

  for (const name of identities) {
    result = result.replace(identityPattern(name), censorLabel(name));
  }

  return result;
}
