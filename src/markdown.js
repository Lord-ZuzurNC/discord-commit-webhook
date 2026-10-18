// Characters Discord treats as Markdown control characters inside an embed
// description. `\` comes first in the class so that it is escaped too, in the
// same single pass: replacing each character independently turns `\` into `\\`
// without the double-escaping a two-step replace would cause.
const MARKDOWN_SPECIALS = /[\\*_~`|[\]]/g;

/**
 * Escape Discord Markdown control characters in free text.
 *
 * Commit subjects and author labels are attacker-controlled as far as this
 * action is concerned: anyone who can push can choose them. Interpolating them
 * raw into an embed description lets them open formatting that spills across
 * the surrounding lines, because Discord pairs control characters across the
 * whole description rather than per line.
 *
 * Apply this ONLY to the description. Discord does not render Markdown in an
 * embed's `title`, `author.name` or `footer.text`, so escaping those would
 * display the backslashes themselves.
 */
export function escapeMarkdown(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replace(MARKDOWN_SPECIALS, (character) => `\\${character}`);
}
