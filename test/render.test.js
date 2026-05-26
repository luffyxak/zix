import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pack } from '../src/pack.js';
import { renderHtml } from '../src/render.js';

async function tmpdir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'zix-test-'));
}

test('renders self-contained HTML', async () => {
  const dir = await tmpdir();
  await fs.writeFile(path.join(dir, 'README.md'), '# hi\n\ntext');
  const bundle = await pack(dir, { title: 'My Bundle' });
  const html = await renderHtml(bundle, { theme: 'auto', version: '0.1.0' });
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /My Bundle/);
  assert.match(html, /__ZIX__/);
  // No external references
  assert.ok(!/<link[^>]*href=/i.test(html));
  assert.ok(!/<script[^>]*src=/i.test(html));
});

test('renders an encrypted bundle without leaking plaintext', async () => {
  const dir = await tmpdir();
  await fs.writeFile(path.join(dir, 'note.md'), '# secret-string-12345');
  const bundle = await pack(dir, { password: 'pw' });
  const html = await renderHtml(bundle);
  assert.ok(!html.includes('secret-string-12345'));
  assert.match(html, /"encrypted":true/);
});

test('escapes script-end markers inside JSON', async () => {
  const dir = await tmpdir();
  await fs.writeFile(path.join(dir, 'note.md'), 'inline </script> attempt');
  const bundle = await pack(dir);
  const html = await renderHtml(bundle);
  assert.ok(!html.toLowerCase().includes('</script> attempt'));
});
