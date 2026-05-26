// Simulates what the browser runtime does to decrypt an encrypted bundle
// using the same WebCrypto APIs Node 20+ ships.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pack } from '../src/pack.js';
import { fromB64 } from '../src/crypto.js';

test('encrypted bundle decrypts with correct password and fails with wrong one', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zix-rt-'));
  await fs.writeFile(path.join(tmp, 'a.md'), '# top secret');
  const bundle = await pack(tmp, { password: 'right' });
  const subtle = globalThis.crypto.subtle;

  async function deriveFromPassword(pw) {
    const baseKey = await subtle.importKey(
      'raw',
      new TextEncoder().encode(pw),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: fromB64(bundle.kdf.salt), iterations: bundle.kdf.iterations, hash: bundle.kdf.hash },
      baseKey,
      { name: 'AES-GCM', length: bundle.cipher.length },
      false,
      ['decrypt']
    );
  }

  // verify check token with right pw
  const goodKey = await deriveFromPassword('right');
  const checkPt = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(bundle.check.iv), additionalData: new TextEncoder().encode('__zix_check__') },
    goodKey,
    fromB64(bundle.check.ct)
  );
  assert.equal(new TextDecoder().decode(checkPt), 'ok');

  // decrypt actual file
  const filePath = 'a.md';
  const rec = bundle.files[filePath];
  const pt = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(rec.iv), additionalData: new TextEncoder().encode(filePath) },
    goodKey,
    fromB64(rec.ct)
  );
  const fileEntry = JSON.parse(new TextDecoder().decode(pt));
  assert.equal(fileEntry.kind, 'markdown');
  assert.match(fileEntry.text, /top secret/);

  // wrong password should fail
  const badKey = await deriveFromPassword('wrong');
  await assert.rejects(() => subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(bundle.check.iv), additionalData: new TextEncoder().encode('__zix_check__') },
    badKey,
    fromB64(bundle.check.ct)
  ));
});
