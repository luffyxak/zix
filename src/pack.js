// pack.js: walks an input path and produces the bundle data structure that
// render.js will turn into a single HTML page.
//
// The bundle is the "manifest" that the runtime in the browser consumes.

import fs from 'node:fs/promises';
import path from 'node:path';
import { classifyLanguage } from './highlight.js';
import { renderMarkdown } from './markdown.js';
import { deriveKey, encryptFile, newSalt, toB64, PBKDF2_PARAMS } from './crypto.js';

const DEFAULT_EXCLUDES = ['node_modules', '.git', '.DS_Store', 'dist', 'build', 'coverage', 'tmp', 'out'];
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const TEXT_EXT = new Set([
  '.txt','.md','.markdown','.json','.yml','.yaml','.toml','.csv','.log','.env',
  '.js','.mjs','.cjs','.jsx','.ts','.tsx','.py','.rb','.go','.rs','.java','.kt',
  '.c','.h','.cpp','.hpp','.cs','.php','.sh','.bash','.zsh','.fish','.lua',
  '.html','.htm','.css','.scss','.less','.svg','.xml','.ini','.conf','.gitignore',
  '.dockerfile'
]);
const IMAGE_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

export async function pack(inputPath, opts = {}) {
  const {
    title,
    password,
    maxSize = DEFAULT_MAX_SIZE,
    include = [],
    exclude = []
  } = opts;

  const root = path.resolve(inputPath);
  const stat = await fs.stat(root);
  const baseName = stat.isDirectory() ? path.basename(root) : path.basename(root);
  const resolvedTitle = title || baseName;

  const excludeSet = new Set([...DEFAULT_EXCLUDES, ...exclude]);
  const includeMatchers = include.map(globToRegex);
  const excludeMatchers = [...excludeSet].map(globToRegex);

  const tree = [];
  const files = {};
  const skipped = [];

  if (stat.isDirectory()) {
    await walk(root, root, tree, files, { maxSize, includeMatchers, excludeMatchers, skipped });
  } else {
    const rel = path.basename(root);
    if (!shouldInclude(rel, { includeMatchers, excludeMatchers })) {
      throw new Error(`File '${rel}' is excluded by current filters`);
    }
    const entry = await loadFile(root, rel, { maxSize });
    if (entry.skip) {
      skipped.push({ path: rel, reason: entry.skip });
    } else {
      files[rel] = entry.data;
      tree.push({ path: rel, type: 'file' });
    }
  }

  const bundle = {
    version: 1,
    title: resolvedTitle,
    createdAt: new Date().toISOString(),
    encrypted: false,
    tree,
    files,
    skipped
  };

  if (password) {
    return encryptBundle(bundle, password);
  }
  return bundle;
}

async function walk(rootDir, currentDir, treeOut, filesOut, ctx) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });
  for (const ent of entries) {
    const abs = path.join(currentDir, ent.name);
    const rel = path.relative(rootDir, abs).split(path.sep).join('/');

    if (!shouldInclude(rel, ctx)) continue;
    if (!shouldInclude(ent.name, ctx)) continue;

    if (ent.isDirectory()) {
      const node = { path: rel, type: 'dir', children: [] };
      treeOut.push(node);
      await walk(rootDir, abs, node.children, filesOut, ctx);
    } else if (ent.isFile()) {
      const loaded = await loadFile(abs, rel, ctx);
      if (loaded.skip) {
        ctx.skipped.push({ path: rel, reason: loaded.skip });
        continue;
      }
      filesOut[rel] = loaded.data;
      treeOut.push({ path: rel, type: 'file' });
    }
  }
}

async function loadFile(abs, rel, ctx) {
  const st = await fs.stat(abs);
  if (st.size > ctx.maxSize) {
    return { skip: `exceeds max size (${st.size} > ${ctx.maxSize})` };
  }
  const ext = path.extname(rel).toLowerCase();

  // Image
  if (IMAGE_EXT[ext]) {
    if (ext === '.svg') {
      const text = await fs.readFile(abs, 'utf8');
      return { data: { kind: 'image', mime: 'image/svg+xml', text, size: st.size } };
    }
    const buf = await fs.readFile(abs);
    return { data: { kind: 'image', mime: IMAGE_EXT[ext], b64: buf.toString('base64'), size: st.size } };
  }

  // Markdown
  if (ext === '.md' || ext === '.markdown') {
    const text = await fs.readFile(abs, 'utf8');
    return {
      data: {
        kind: 'markdown',
        text,
        html: renderMarkdown(text),
        size: st.size
      }
    };
  }

  // Code or text by extension
  if (TEXT_EXT.has(ext) || isProbablyText(await peek(abs))) {
    const text = await fs.readFile(abs, 'utf8');
    const lang = classifyLanguage(rel);
    if (lang) {
      return { data: { kind: 'code', lang, text, size: st.size } };
    }
    return { data: { kind: 'text', text, size: st.size } };
  }

  // Binary fallback: small enough to inline as a download link
  const buf = await fs.readFile(abs);
  return { data: { kind: 'binary', b64: buf.toString('base64'), size: st.size, mime: 'application/octet-stream' } };
}

async function peek(abs) {
  const fh = await fs.open(abs, 'r');
  try {
    const buf = Buffer.alloc(512);
    const { bytesRead } = await fh.read(buf, 0, 512, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

function isProbablyText(buf) {
  if (!buf || buf.length === 0) return true;
  let suspicious = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0) return false;
    if ((b < 9 || (b > 13 && b < 32)) && b !== 27) suspicious++;
  }
  return suspicious / buf.length < 0.05;
}

function shouldInclude(rel, ctx) {
  for (const re of ctx.excludeMatchers) {
    if (re.test(rel)) return false;
  }
  if (ctx.includeMatchers && ctx.includeMatchers.length > 0) {
    for (const re of ctx.includeMatchers) {
      if (re.test(rel)) return true;
    }
    return false;
  }
  return true;
}

function globToRegex(glob) {
  // simple: ** → .*, * → [^/]*, ? → .
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i += 1;
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '.';
    } else if ('.+^$|(){}[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`(^|/)${re}($|/)`);
}

async function encryptBundle(bundle, password) {
  const salt = newSalt();
  const key = await deriveKey(password, salt);

  const encryptedFiles = {};
  for (const [p, entry] of Object.entries(bundle.files)) {
    const ptString = JSON.stringify(entry);
    const { iv, ct } = await encryptFile(key, p, ptString);
    encryptedFiles[p] = { iv, ct };
  }

  // Self-check token: small encrypted blob that the runtime decrypts to verify
  // the password before loading any file.
  const checkToken = await encryptFile(key, '__zix_check__', 'ok');

  return {
    version: 1,
    title: bundle.title,
    createdAt: bundle.createdAt,
    encrypted: true,
    kdf: { algo: 'PBKDF2', hash: PBKDF2_PARAMS.hash, iterations: PBKDF2_PARAMS.iterations, salt: toB64(salt) },
    cipher: { algo: 'AES-GCM', length: 256, ivBytes: 12 },
    tree: bundle.tree,
    files: encryptedFiles,
    check: checkToken,
    skipped: bundle.skipped
  };
}
