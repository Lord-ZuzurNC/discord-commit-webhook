const ELLIPSIS = '…';

/**
 * Locate `[text](target)` Markdown link spans in a string.
 *
 * Returns a list of `[start, end)` index ranges (UTF-16 code unit indices).
 */
function findLinkSpans(text) {
  const spans = [];
  const pattern = /\[[^\]\n]*\]\([^)\n]*\)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}

/**
 * Locate `` `code` `` span ranges, pairing up backticks in order.
 *
 * An unpaired trailing backtick is ignored: it opens nothing worth
 * protecting because there is no closing one to balance it.
 */
function findCodeSpans(text) {
  const spans = [];
  const positions = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '`') {
      positions.push(i);
    }
  }
  for (let i = 0; i + 1 < positions.length; i += 2) {
    spans.push([positions[i], positions[i + 1] + 1]);
  }
  return spans;
}

function spanContaining(index, spans) {
  return spans.find(([start, end]) => index > start && index < end);
}

/**
 * Pull a cut index back out of any Markdown link or code span it falls
 * inside of, so that truncation never leaves an unbalanced construct.
 */
function clampOutOfSpans(index, linkSpans, codeSpans) {
  let current = index;
  let moved = true;
  while (moved) {
    moved = false;
    const link = spanContaining(current, linkSpans);
    if (link) {
      current = link[0];
      moved = true;
      continue;
    }
    const code = spanContaining(current, codeSpans);
    if (code) {
      current = code[0];
      moved = true;
    }
  }
  return current;
}

/**
 * Find the UTF-16 index of the last whitespace character at or before
 * `index`, so truncation can prefer a word boundary within the budget.
 */
function findWordBoundaryBefore(text, index) {
  for (let i = index; i > 0; i -= 1) {
    if (/\s/.test(text[i - 1])) {
      return i - 1;
    }
  }
  return -1;
}

/**
 * Truncate a commit subject to at most `maxLength` codepoints, appending a
 * single ellipsis character.
 *
 * The cut point is adjusted so it never splits a surrogate pair, never lands
 * inside a Markdown code span, and never lands inside the text or target of
 * a Markdown link. A word boundary within the budget is preferred over a
 * mid-word cut.
 */
export function truncateSubject(text, maxLength) {
  const subject = typeof text === 'string' ? text : '';

  if (maxLength <= 0) {
    return ELLIPSIS;
  }

  const codePoints = Array.from(subject);
  if (codePoints.length <= maxLength) {
    return subject;
  }

  // Slicing by codepoints guarantees we never split a surrogate pair.
  const budgetSlice = codePoints.slice(0, maxLength).join('');
  const budgetIndex = budgetSlice.length;

  const linkSpans = findLinkSpans(subject);
  const codeSpans = findCodeSpans(subject);

  let cutIndex = clampOutOfSpans(budgetIndex, linkSpans, codeSpans);

  const wordBoundary = findWordBoundaryBefore(subject, cutIndex);
  if (wordBoundary > 0) {
    cutIndex = clampOutOfSpans(wordBoundary, linkSpans, codeSpans);
  }

  let truncated = subject.slice(0, cutIndex).replace(/\s+$/u, '');

  if (truncated.length === 0) {
    truncated = subject
      .slice(0, clampOutOfSpans(budgetIndex, linkSpans, codeSpans))
      .replace(/\s+$/u, '');
  }

  return `${truncated}${ELLIPSIS}`;
}
