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
