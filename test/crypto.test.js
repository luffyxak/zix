import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveKey, encryptFile, decryptFile, newSalt } from '../src/crypto.js';

test('round-trips a file', async () => {
  const salt = newSalt();
  const key = await deriveKey('hunter2', salt);
  const { iv, ct } = await encryptFile(key, 'docs/readme.md', 'hello world');
  const pt = await decryptFile(key, 'docs/readme.md', iv, ct);
  assert.equal(new TextDecoder().decode(pt), 'hello world');
});

test('rejects wrong password', async () => {
  const salt = newSalt();
  const key1 = await deriveKey('right', salt);
  const key2 = await deriveKey('wrong', salt);
  const { iv, ct } = await encryptFile(key1, 'a.txt', 'secret');
  await assert.rejects(() => decryptFile(key2, 'a.txt', iv, ct));
});

test('rejects wrong path (AAD swap)', async () => {
  const salt = newSalt();
  const key = await deriveKey('pw', salt);
  const { iv, ct } = await encryptFile(key, 'a.txt', 'secret');
  // attacker swaps the path
  await assert.rejects(() => decryptFile(key, 'b.txt', iv, ct));
});

test('different IVs across calls', async () => {
  const salt = newSalt();
  const key = await deriveKey('pw', salt);
  const a = await encryptFile(key, 'x', 'same');
  const b = await encryptFile(key, 'x', 'same');
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});
