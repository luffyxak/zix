import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/markdown.js';

test('renders heading', () => {
  const html = renderMarkdown('# Hello');
  assert.match(html, /<h1[^>]*>Hello<\/h1>/);
});

test('renders paragraphs', () => {
  const html = renderMarkdown('first line\nsame para\n\nsecond para');
  assert.match(html, /<p>first line\nsame para<\/p>/);
  assert.match(html, /<p>second para<\/p>/);
});

test('renders fenced code with known language', () => {
  const html = renderMarkdown('```js\nconst x = 1;\n```');
  assert.match(html, /<pre class="zix-code"[^>]*><code>/);
  assert.match(html, /class="t-k"/); // const should be a keyword
});

test('escapes html in inline text', () => {
  const html = renderMarkdown('hello <script>alert(1)</script>');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('renders bold and italic', () => {
  const html = renderMarkdown('this is **bold** and *italic*');
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
});

test('renders links', () => {
  const html = renderMarkdown('[link](https://example.com)');
  assert.match(html, /<a href="https:\/\/example.com"/);
});

test('strips javascript: links', () => {
  const html = renderMarkdown('[bad](javascript:alert(1))');
  assert.ok(!html.includes('javascript:'));
});

test('renders unordered list', () => {
  const html = renderMarkdown('- a\n- b\n- c');
  assert.match(html, /<ul><li>a<\/li><li>b<\/li><li>c<\/li><\/ul>/);
});

test('renders table', () => {
  const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
  assert.match(html, /<table>/);
  assert.match(html, /<th>a<\/th>/);
  assert.match(html, /<td>1<\/td>/);
});
