// Server-side helpers for password mode. We use the same WebCrypto API in Node
// (>= 20) and in the browser, so the encrypt logic here mirrors the runtime
// decrypt logic exactly.
//
// Threat model: protect a bundle in transit so a casual reader who lacks the
// password cannot recover its contents. This is NOT a substitute for proper
// authn/authz on a server. We document this honestly in the README.
//
// Construction:
//   - PBKDF2-SHA-256, 210,000 iters (OWASP recommendation as of 2023+),
//     16-byte random salt per bundle.
//   - AES-GCM-256, 12-byte random IV per file.
//   - AAD = utf8(path) so files cannot be swapped between paths.

const PBKDF2_ITERS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function getSubtle() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('WebCrypto not available; Node >= 20 is required');
  }
  return c.subtle;
}

function randomBytes(n) {
  const arr = new Uint8Array(n);
  globalThis.crypto.getRandomValues(arr);
  return arr;
}

export async function deriveKey(password, salt) {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptFile(key, path, plaintext) {
  const subtle = getSubtle();
  const iv = randomBytes(IV_BYTES);
  const aad = new TextEncoder().encode(path);
  const ct = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    asBytes(plaintext)
  );
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function decryptFile(key, path, ivB64, ctB64) {
  const subtle = getSubtle();
  const iv = fromB64(ivB64);
  const ct = fromB64(ctB64);
  const aad = new TextEncoder().encode(path);
  const pt = await subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    ct
  );
  return new Uint8Array(pt);
}

export function newSalt() { return randomBytes(SALT_BYTES); }
export const PBKDF2_PARAMS = { iterations: PBKDF2_ITERS, hash: 'SHA-256', saltBytes: SALT_BYTES };

export function toB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  // Buffer is available in Node, btoa is available in browsers; pick what's there.
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  // eslint-disable-next-line no-undef
  return btoa(binary);
}

export function fromB64(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  // eslint-disable-next-line no-undef
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function asBytes(v) {
  if (v instanceof Uint8Array) return v;
  if (typeof v === 'string') return new TextEncoder().encode(v);
  if (v && v.buffer) return new Uint8Array(v.buffer, v.byteOffset || 0, v.byteLength);
  throw new TypeError('Unsupported plaintext type');
}
