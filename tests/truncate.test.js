import test from 'node:test';
import assert from 'node:assert/strict';
import { truncateSubject } from '../src/truncate.js';

test('returns the text unchanged when within the budget', () => {
  assert.equal(truncateSubject('short subject', 120), 'short subject');
});

test('returns the text unchanged when exactly at the budget', () => {
  assert.equal(truncateSubject('12345', 5), '12345');
});

test('truncates and appends an ellipsis when over budget', () => {
  const result = truncateSubject('this is a long commit subject line', 10);
  assert.ok(result.endsWith('…'));
  assert.ok(Array.from(result).length <= 11);
});

test('prefers a word boundary within the budget', () => {
  const result = truncateSubject('fix the parser bug today', 12);
  // Budget cuts mid-word ("fix the pars|er"); a word boundary before that is preferred.
  assert.equal(result, 'fix the…');
});

test('falls back to a hard cut when no word boundary is available', () => {
  const result = truncateSubject('supercalifragilisticexpialidocious', 10);
  assert.equal(Array.from(result.slice(0, -1)).length, 10);
  assert.ok(result.endsWith('…'));
});

test('never splits a surrogate pair (emoji stay intact)', () => {
  const text = 'deploy 🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉 release';
  const result = truncateSubject(text, 9);
  // Every codepoint in the result (minus the ellipsis) must be a complete emoji or letter.
  const withoutEllipsis = result.slice(0, -1);
  for (const ch of withoutEllipsis) {
    assert.equal(ch.length <= 2, true);
  }
  // No lone surrogate half should appear.
  assert.doesNotMatch(withoutEllipsis, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  assert.doesNotMatch(withoutEllipsis, /(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
});

test('never cuts inside a code span', () => {
  const text = 'fix `the parser internals` for real';
  const result = truncateSubject(text, 10);
  const backtickCount = (result.match(/`/g) || []).length;
  assert.equal(backtickCount % 2, 0);
});

test('never cuts inside the text or target of a Markdown link', () => {
  const text = 'see [the discussion thread](https://example.com/very/long/path) for context';
  const result = truncateSubject(text, 10);
  // Either the whole link survives, or none of it does.
  const hasOpenBracket = result.includes('[');
  const hasCloseParen = result.includes(')');
  assert.equal(hasOpenBracket, hasCloseParen);
});

test('zero-length budget still returns a single ellipsis', () => {
  assert.equal(truncateSubject('anything', 0), '…');
});

test('empty subject stays empty when within budget', () => {
  assert.equal(truncateSubject('', 10), '');
});
