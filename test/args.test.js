import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';

test('parses positional args', () => {
  const r = parseArgs(['pack', './folder']);
  assert.deepEqual(r._, ['pack', './folder']);
  assert.deepEqual(r.flags, {});
});

test('parses --flag value', () => {
  const r = parseArgs(['pack', '.', '--out', 'x.html']);
  assert.equal(r.flags.out, 'x.html');
});

test('parses --flag=value', () => {
  const r = parseArgs(['pack', '.', '--title=Hello World']);
  assert.equal(r.flags.title, 'Hello World');
});

test('parses short alias -p', () => {
  const r = parseArgs(['pack', '.', '-p', 'secret']);
  assert.equal(r.flags.password, 'secret');
});

test('rejects unknown flags', () => {
  assert.throws(() => parseArgs(['pack', '.', '--nope']), /Unknown flag/);
});

test('repeatable list flags', () => {
  const r = parseArgs(['pack', '.', '--exclude', '*.png', '--exclude', '*.jpg']);
  assert.deepEqual(r.flags.exclude, ['*.png', '*.jpg']);
});

test('numbers parsed as numbers', () => {
  const r = parseArgs(['pack', '.', '--max-size', '12345']);
  assert.equal(r.flags['max-size'], 12345);
  assert.equal(typeof r.flags['max-size'], 'number');
});

test('bool flags work without values', () => {
  const r = parseArgs(['pack', '.', '-q', '--help']);
  assert.equal(r.flags.quiet, true);
  assert.equal(r.flags.help, true);
});

test('rejects missing value for string flag', () => {
  assert.throws(() => parseArgs(['pack', '--out']), /expects a value/);
});
