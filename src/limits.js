// Discord's hard caps on an embed. Exceeding any of them makes the webhook
// answer HTTP 400 and the whole post is lost.
export const LIMITS = {
  title: 256,
  description: 4096,
  footerText: 2048,
  authorName: 256,
};

const ELLIPSIS = '…';

/**
 * Clamp a plain-text field to its Discord limit.
 *
 * Slicing by codepoints so a surrogate pair is never split in half.
 */
export function clampText(text, limit) {
  const value = typeof text === 'string' ? text : '';
  const codePoints = Array.from(value);
  if (codePoints.length <= limit) {
    return value;
  }
  return codePoints.slice(0, limit - 1).join('') + ELLIPSIS;
}

/**
 * Assemble the description, dropping commit lines until it fits.
 *
 * `max_commits` alone does not bound the description: 25 commits with a
 * generous `commit_message_max_length` can exceed 4096 characters, and a
 * custom `commit_format` can add more on every line. Dropping whole lines and
 * recounting the remainder keeps the result honest, where a blind cut would
 * leave a half-written commit and an inaccurate total.
 */
export function fitDescription(
  commitLines,
  totalCommits,
  buildMoreLine,
  limit = LIMITS.description,
) {
  for (let shown = commitLines.length; shown > 0; shown -= 1) {
    const lines = commitLines.slice(0, shown);
    const remaining = totalCommits - shown;
    if (remaining > 0) {
      lines.push(buildMoreLine(remaining));
    }
    const text = lines.join('\n');
    if (text.length <= limit) {
      return text;
    }
  }

  // A single line longer than the whole budget: clamp it rather than post nothing.
  return clampText(commitLines[0] ?? '', limit);
}
