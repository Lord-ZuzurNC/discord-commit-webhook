/**
 * The placeholders each format string accepts, and the default that reproduces
 * the layout the action shipped with.
 *
 * Single source of truth: `readInputs` reads and validates against it, and
 * `buildEmbed` falls back to it for a config built without formats.
 */
export const FORMAT_SPECS = {
  commit_format: {
    key: 'commitFormat',
    placeholders: ['sha', 'subject', 'author'],
    default: '{sha} {subject} — {author}',
  },
  title_format: {
    key: 'titleFormat',
    placeholders: ['count', 'commits', 'branch', 'repo'],
    default: '{count} new {commits}',
  },
  repo_format: {
    key: 'repoFormat',
    placeholders: ['repo', 'branch', 'count', 'commits'],
    default: '{repo}',
  },
  footer_format: {
    key: 'footerFormat',
    placeholders: ['branch', 'pusher', 'repo', 'count', 'commits'],
    default: '{branch} · {pusher}',
  },
  more_format: {
    key: 'moreFormat',
    placeholders: ['count', 'commits'],
    default: '…and {count} more',
  },
};

export const DEFAULT_FORMATS = Object.fromEntries(
  Object.values(FORMAT_SPECS).map((spec) => [spec.key, spec.default]),
);

// Matches a literal `{{`, a literal `}}`, or a `{placeholder}` token.
// One pattern, applied in a single pass: a substituted value that happens to
// contain `{author}` is never rescanned, so a commit message cannot smuggle a
// placeholder of its own into the output.
const TOKEN_PATTERN = /\{\{|\}\}|\{([a-z_]+)\}/g;

// Marks the spot where a placeholder resolved to nothing, so a dangling
// separator can be removed afterwards without ever touching real content: the
// sentinel only exists where a value was genuinely empty.
const EMPTY = '\u0000';

// Separators a format string is likely to put between two placeholders.
const SEPARATORS = '·—|/,-';

/**
 * Remove a separator left stranded by an empty placeholder.
 *
 * `{branch} · {pusher}` with no pusher must read `main`, not `main · `. The
 * collapse is driven by the sentinel rather than by the result's edges, so a
 * commit subject that legitimately ends in `-` is never trimmed.
 */
function collapseEmpties(text) {
  const sep = `[${SEPARATORS}]`;
  return text
    .replace(new RegExp(`\\s*${sep}\\s*${EMPTY}`, 'g'), '')
    .replace(new RegExp(`${EMPTY}\\s*${sep}\\s*`, 'g'), '')
    .split(EMPTY)
    .join('')
    .trim();
}

/**
 * Substitute `{placeholder}` tokens in a format string.
 *
 * The format string itself comes from the workflow, which is already trusted,
 * so it may carry Markdown of the author's choosing. The *values* are the
 * untrusted part and must already be escaped by the caller where the field
 * renders Markdown.
 *
 * `{{` and `}}` produce literal braces.
 *
 * An unknown placeholder is a hard error naming the input and listing what is
 * available: a silent empty string would look like the action had lost data.
 */
export function applyFormat(template, values, inputName) {
  const allowed = Object.keys(values).sort();

  const substituted = String(template).replace(TOKEN_PATTERN, (match, name) => {
    if (match === '{{') {
      return '{';
    }
    if (match === '}}') {
      return '}';
    }
    if (!Object.hasOwn(values, name)) {
      throw new Error(
        `Input "${inputName}" uses the unknown placeholder {${name}}. Available placeholders: ${allowed
          .map((key) => `{${key}}`)
          .join(', ')}.`,
      );
    }
    const value = values[name];
    const text = value === undefined || value === null ? '' : String(value);
    return text.length === 0 ? EMPTY : text;
  });

  return collapseEmpties(substituted);
}

/**
 * Validate a format string against the placeholders it will be given.
 *
 * Called once per run at input-reading time so a typo fails the step
 * immediately, with the same message it would produce later, rather than
 * halfway through building the embed.
 */
export function validateFormat(template, allowedNames, inputName) {
  const probe = Object.fromEntries(allowedNames.map((name) => [name, '']));
  applyFormat(template, probe, inputName);
}
