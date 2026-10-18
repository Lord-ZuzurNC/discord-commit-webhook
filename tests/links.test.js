import test from 'node:test';
import assert from 'node:assert/strict';
import { stripUrls } from '../src/links.js';

test('removes a bare https URL from text', () => {
  assert.equal(stripUrls('see https://example.com/path for details'), 'see for details');
});

test('removes a bare http URL from text', () => {
  assert.equal(stripUrls('see http://example.com for details'), 'see for details');
});

test('removes multiple URLs', () => {
  assert.equal(stripUrls('https://a.example.com and https://b.example.com'), 'and');
});

test('leaves plain text without URLs unchanged', () => {
  assert.equal(stripUrls('fix the parser bug'), 'fix the parser bug');
});

test('does not leave double spaces behind', () => {
  assert.doesNotMatch(stripUrls('fix https://example.com the bug'), /\s{2,}/);
});
