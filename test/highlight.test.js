import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highlight, classifyLanguage } from '../src/highlight.js';

test('classifies common extensions', () => {
  assert.equal(classifyLanguage('a.ts'), 'ts');
  assert.equal(classifyLanguage('a.py'), 'py');
  assert.equal(classifyLanguage('a.json'), 'json');
  assert.equal(classifyLanguage('a.unknown'), null);
  assert.equal(classifyLanguage('Dockerfile'), null);
});

test('keywords are wrapped', () => {
  const html = highlight('const x = 1;', 'js');
  assert.match(html, /<span class="t-k">const<\/span>/);
});

test('strings are wrapped', () => {
  const html = highlight('"hello"', 'js');
  assert.match(html, /<span class="t-s">&quot;hello&quot;<\/span>/);
});

test('numbers are wrapped', () => {
  const html = highlight('42 + 3.14', 'js');
  assert.match(html, /<span class="t-n">42<\/span>/);
  assert.match(html, /<span class="t-n">3\.14<\/span>/);
});

test('line comments are wrapped', () => {
  const html = highlight('// hi\nx', 'js');
  assert.match(html, /<span class="t-c">\/\/ hi<\/span>/);
});

test('block comments are wrapped', () => {
  const html = highlight('/* hi */ x', 'ts');
  assert.match(html, /<span class="t-c">\/\* hi \*\/<\/span>/);
});

test('html falls back gracefully', () => {
  const html = highlight('plain text', 'unknown');
  assert.equal(html, 'plain text');
});

test('escapes special chars', () => {
  const html = highlight('<a>', 'js');
  assert.match(html, /&lt;a&gt;/);
});
