import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pack } from '../src/pack.js';

async function tmpdir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'zix-test-'));
}

test('packs a folder of mixed files', async () => {
  const dir = await tmpdir();
  await fs.mkdir(path.join(dir, 'sub'), { recursive: true });
  await fs.writeFile(path.join(dir, 'README.md'), '# hello');
  await fs.writeFile(path.join(dir, 'app.js'), 'const x = 1;');
  await fs.writeFile(path.join(dir, 'sub', 'data.json'), '{"a":1}');
  const bundle = await pack(dir);
  assert.equal(bundle.encrypted, false);
  assert.equal(bundle.files['README.md'].kind, 'markdown');
  assert.equal(bundle.files['app.js'].kind, 'code');
  assert.equal(bundle.files['app.js'].lang, 'js');
  assert.equal(bundle.files['sub/data.json'].kind, 'code');
});

test('honors max-size by skipping', async () => {
  const dir = await tmpdir();
  await fs.writeFile(path.join(dir, 'small.txt'), 'a'.repeat(10));
  await fs.writeFile(path.join(dir, 'big.txt'), 'a'.repeat(2_000));
  const bundle = await pack(dir, { maxSize: 1_000 });
  assert.ok(bundle.files['small.txt']);
  assert.ok(!bundle.files['big.txt']);
  assert.equal(bundle.skipped.length, 1);
});

test('honors exclude patterns', async () => {
  const dir = await tmpdir();
  await fs.writeFile(path.join(dir, 'keep.md'), '# k');
  await fs.writeFile(path.join(dir, 'skip.log'), 'noise');
  const bundle = await pack(dir, { exclude: ['*.log'] });
  assert.ok(bundle.files['keep.md']);
  assert.ok(!bundle.files['skip.log']);
});

test('encrypted mode produces valid manifest', async () => {
  const dir = await tmpdir();
  await fs.writeFile(path.join(dir, 'note.md'), '# secret');
  const bundle = await pack(dir, { password: 'pw' });
  assert.equal(bundle.encrypted, true);
  assert.ok(bundle.kdf.salt);
  assert.ok(bundle.check.iv);
  const rec = bundle.files['note.md'];
  assert.ok(rec.iv && rec.ct);
});
