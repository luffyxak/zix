// render.js: composes a single self-contained HTML file from a bundle.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cache = null;
async function loadTemplate() {
  if (cache) return cache;
  const [page, runtime, styles] = await Promise.all([
    fs.readFile(path.join(__dirname, 'template', 'page.html'), 'utf8'),
    fs.readFile(path.join(__dirname, 'template', 'runtime.js'), 'utf8'),
    fs.readFile(path.join(__dirname, 'template', 'styles.css'), 'utf8')
  ]);
  cache = { page, runtime, styles };
  return cache;
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]); }

function safeJsonForScriptTag(value) {
  // We embed the bundle inside a <script type="application/json"> tag and read
  // it via textContent + JSON.parse. We must escape '<' to avoid breaking the
  // tag, plus U+2028 / U+2029 (which JSON.parse accepts but raw script does
  // not, in older engines).
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// Plain string.replace interprets $& / $1 / $$ in the replacement. Our
// substitutions (CSS, JSON, JS source) can legitimately contain these
// sequences, so we splice manually instead.
function spliceTokens(template, mapping) {
  let out = template;
  for (const [token, value] of Object.entries(mapping)) {
    const idx = out.indexOf(token);
    if (idx === -1) continue;
    out = out.slice(0, idx) + value + out.slice(idx + token.length);
  }
  return out;
}

export async function renderHtml(bundle, opts = {}) {
  const { theme = 'auto', version = '0.1.0' } = opts;
  const { page, runtime, styles } = await loadTemplate();
  return spliceTokens(page, {
    '__THEME__':   esc(theme),
    '__VERSION__': esc(version),
    '__TITLE__':   esc(bundle.title || 'Zix'),
    '__STYLES__':  styles,
    '__BUNDLE__':  safeJsonForScriptTag(bundle),
    '__RUNTIME__': runtime
  });
}
