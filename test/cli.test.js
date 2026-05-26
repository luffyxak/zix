import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'src', 'cli.js');

function run(args, opts = {}) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: opts.cwd || ROOT });
}

test('--version prints version', () => {
  const r = run(['--version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^zix v\d+\.\d+\.\d+/);
});

test('--help prints usage', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});

test('pack produces valid html with embedded bundle', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zix-cli-'));
  await fs.writeFile(path.join(tmp, 'note.md'), '# title\n\nbody');
  const out = path.join(tmp, 'out.html');
  const r = run(['pack', tmp, '--out', out, '--quiet']);
  assert.equal(r.status, 0, r.stderr);
  const html = await fs.readFile(out, 'utf8');
  assert.match(html, /^<!doctype html>/i);
  // Pull JSON out of <script id="zix-bundle">
  const m = /<script id="zix-bundle" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'bundle script not found');
  const data = JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u2028/g, '\u2028').replace(/\\u2029/g, '\u2029'));
  assert.equal(data.encrypted, false);
  assert.ok(data.files['note.md']);
});

test('pack with --password produces encrypted bundle', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zix-cli-'));
  await fs.writeFile(path.join(tmp, 'a.md'), '# secret-payload-99');
  const out = path.join(tmp, 'locked.html');
  const r = run(['pack', tmp, '--password', 'pw', '--out', out, '--quiet']);
  assert.equal(r.status, 0, r.stderr);
  const html = await fs.readFile(out, 'utf8');
  assert.ok(!html.includes('secret-payload-99'));
  assert.match(html, /"encrypted":true/);
});

test('exits non-zero for missing path', () => {
  const r = run(['pack', '/definitely/not/here']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Path not found/);
});
