// Regression tests for security and templating bugs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pack } from '../src/pack.js';
import { renderHtml } from '../src/render.js';

async function tmpdir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'zix-sec-'));
}

test('output has no unsubstituted template tokens', async () => {
  const dir = await tmpdir();
  await fs.writeFile(path.join(dir, 'a.md'), '# hi');
  const bundle = await pack(dir);
  const html = await renderHtml(bundle, { version: '9.9.9' });
  for (const tok of ['__THEME__', '__VERSION__', '__TITLE__', '__STYLES__', '__BUNDLE__', '__RUNTIME__']) {
    assert.ok(!html.includes(tok), `template token leaked: ${tok}`);
  }
});

test('runtime contains $& replacement spec verbatim (no String.replace mangling)', async () => {
  const dir = await tmpdir();
  await fs.writeFile(path.join(dir, 'a.md'), '# hi');
  const bundle = await pack(dir);
  const html = await renderHtml(bundle);
  // The runtime uses /["\\]/g and replaces with '\\$&'. If we accidentally
  // pass the runtime through String.replace as the replacement argument,
  // the $& is interpreted as the matched text and our code is corrupted.
  assert.match(html, /\\\$&/);
});

test('CSP meta tag is present and forbids outbound connections', async () => {
  const dir = await tmpdir();
  await fs.writeFile(path.join(dir, 'a.md'), '# hi');
  const bundle = await pack(dir);
  const html = await renderHtml(bundle);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /default-src 'none'/);
});

test('SVG is rendered via <img> tag, not raw inline', async () => {
  const dir = await tmpdir();
  // SVG with an inline event handler that should never execute
  const evil = '<svg xmlns="http://www.w3.org/2000/svg" onload="window.__pwn=1"><script>window.__pwn=2</script></svg>';
  await fs.writeFile(path.join(dir, 'pic.svg'), evil);
  const bundle = await pack(dir);
  const html = await renderHtml(bundle);
  // Raw payload must not appear inside the document body as live markup.
  // It should appear only base64-encoded inside the JSON bundle (if at all).
  assert.ok(!html.includes('onload="window.__pwn=1"'));
  assert.ok(!html.includes('<script>window.__pwn=2</script>'));
});

test('no outbound network references in the output', async () => {
  const dir = await tmpdir();
  await fs.writeFile(path.join(dir, 'a.md'), '# hi');
  const bundle = await pack(dir);
  const html = await renderHtml(bundle);
  // No <link rel="stylesheet" href=...>
  assert.ok(!/<link[^>]*\bhref\s*=/i.test(html));
  // No <script src=...>
  assert.ok(!/<script[^>]*\bsrc\s*=/i.test(html));
  // No remote http(s) URL outside of the bundle JSON's escaped strings (we
  // can't easily check inside JSON, but the body's HTML markup is inspectable).
});
