#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './args.js';
import { pack } from './pack.js';
import { renderHtml } from './render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(rawArgv) {
  let parsed;
  try {
    parsed = parseArgs(rawArgv);
  } catch (e) {
    fail(e.message);
    return;
  }

  if (parsed.flags.version) {
    const pkg = await readPkg();
    process.stdout.write(`zix v${pkg.version}\n`);
    return;
  }
  if (parsed.flags.help || parsed._.length === 0) {
    process.stdout.write(usage());
    return;
  }

  const cmd = parsed._[0];
  if (cmd !== 'pack') {
    fail(`Unknown command '${cmd}'. Try 'zix --help'.`);
    return;
  }

  const target = parsed._[1];
  if (!target) {
    fail("Missing input path. Usage: zix pack <path> [options]");
    return;
  }
  const absTarget = path.resolve(target);
  try {
    await fs.stat(absTarget);
  } catch {
    fail(`Path not found: ${target}`);
    return;
  }

  const opts = {
    title: parsed.flags.title,
    password: parsed.flags.password,
    maxSize: parsed.flags['max-size'],
    include: parsed.flags.include || [],
    exclude: parsed.flags.exclude || []
  };

  const stat = await fs.stat(absTarget);
  const bundle = await pack(absTarget, opts);

  const pkg = await readPkg();
  const html = await renderHtml(bundle, {
    theme: parsed.flags.theme || 'auto',
    version: pkg.version
  });

  const defaultName = (stat.isDirectory() ? path.basename(absTarget) : path.basename(absTarget, path.extname(absTarget))) + '.zix.html';
  const outPath = path.resolve(parsed.flags.out || defaultName);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, html, 'utf8');

  if (!parsed.flags.quiet) {
    const size = (await fs.stat(outPath)).size;
    const fileCount = countFiles(bundle.tree);
    const skipped = (bundle.skipped || []).length;
    const lock = bundle.encrypted ? ' 🔒' : '';
    process.stdout.write(
      `zix${lock}: wrote ${path.relative(process.cwd(), outPath)} ` +
      `(${humanSize(size)}, ${fileCount} files${skipped ? `, ${skipped} skipped` : ''})\n`
    );
  }
}

function countFiles(tree) {
  let n = 0;
  for (const node of tree) {
    if (node.type === 'file') n++;
    else if (node.children) n += countFiles(node.children);
  }
  return n;
}

function humanSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

async function readPkg() {
  const txt = await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf8');
  return JSON.parse(txt);
}

function fail(msg) {
  process.stderr.write(`zix: ${msg}\n`);
  process.exitCode = 1;
}

function usage() {
  return `zix: turn any folder into a single shareable HTML file

Usage:
  zix pack <path> [options]

Options:
  -o, --out <file>          output path (default: <name>.zix.html)
  -p, --password <pass>     encrypt the bundle with AES-GCM
      --title <text>        page title (default: input name)
      --theme <theme>       light | dark | auto (default: auto)
      --max-size <bytes>    skip files larger than this (default 5MB)
      --include <glob>      include patterns (repeatable)
      --exclude <glob>      exclude patterns (repeatable)
  -q, --quiet               suppress success line
  -h, --help                show this help
  -V, --version             print version

Examples:
  zix pack ./my-notes
  zix pack ./design --password hunter2 --title "Design v2"
  zix pack ./repo --exclude "**/*.png" --max-size 1048576
`;
}

main(process.argv.slice(2)).catch((e) => {
  fail(e.stack || e.message || String(e));
});
