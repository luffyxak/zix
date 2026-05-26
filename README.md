# Zix

> Turn any folder into a single, self-contained, shareable HTML file. Optional client-side password protection. No server. No tracking. Just a `.html`.

```bash
npx zix pack ./my-notes
# → my-notes.zix.html
```

```bash
npx zix pack ./design --password 'hunter2' --title "Design v2"
# → design.zix.html (encrypted with AES-GCM)
```

Open the resulting file in any browser. That's it. Email it, drop it on S3, host it on GitHub Pages, attach it to a Notion page. The recipient needs a browser. Nothing else.

[![tests](https://img.shields.io/badge/tests-43%20passing-brightgreen)](#tests)
[![node](https://img.shields.io/badge/node-%E2%89%A520-blue)](#requirements)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## Why

Sharing a folder of notes, code, or design docs is annoying. You either:

- Spin up a server (overkill).
- Zip and email it (recipient has to download and unzip; no nice viewing).
- Paste into Drive/Notion/Confluence (now it's locked into a vendor and tracked).

Zix gives you a third option: one HTML file that *is* the viewer. It looks like a tiny static site, with a tree, search, and pretty rendering for markdown, code, and images. If you flip on `--password`, it's encrypted with real WebCrypto AES-GCM and unlocks in the browser.

## Features

- 📦 **Single file output.** Everything inlined: markdown, code, images, fonts (system stack).
- 🌳 **Folder tree + search.** Press `/` to jump to the search box.
- 🎨 **Markdown + syntax highlighting.** GFM-style basics and a curated set of languages (JS/TS, Python, JSON, YAML, TOML, CSS, HTML, shell, more).
- 🔒 **Optional password mode.** PBKDF2-SHA-256 (210k iters) + AES-GCM-256 with per-file IV and AAD-bound paths.
- 🌗 **Light/Dark/Auto theme.** Toggle in the UI.
- ⚡ **No runtime deps.** One small `cli.js`, one HTML template. Ships with `npx`.
- 🤝 **Plays nice.** No analytics, no telemetry, no fonts from CDNs, no outbound requests.

## Install

```bash
# one-shot, no install
npx zix pack ./folder

# or globally
npm install -g zix
zix pack ./folder
```

## Usage

```
zix pack <path> [options]

Options:
  -o, --out <file>          output path (default: <name>.zix.html)
  -p, --password <pass>     encrypt the bundle with AES-GCM
      --title <text>        page title (default: input name)
      --theme <theme>       light | dark | auto (default: auto)
      --max-size <bytes>    skip files larger than this (default 5 MB)
      --include <glob>      include patterns (repeatable)
      --exclude <glob>      exclude patterns (repeatable)
  -q, --quiet               suppress success line
  -h, --help                show this help
  -V, --version             print version
```

### Examples

```bash
# pack a notes folder, default output ./my-notes.zix.html
zix pack ./my-notes

# encrypted, custom title
zix pack ./design --password 'hunter2' --title "Design v2"

# only include markdown and js, exclude generated stuff
zix pack ./repo --include "**/*.md" --include "**/*.js" --exclude "**/dist/**"

# tighter size limit
zix pack ./big-folder --max-size 1048576

# pipe-friendly mode
zix pack ./folder -q -o out.html
```

By default the following directory names are excluded: `node_modules`, `.git`, `.DS_Store`, `dist`, `build`, `coverage`, `tmp`, `out`.

## What gets rendered

| Type | Behaviour |
|---|---|
| `.md`, `.markdown` | Rendered to HTML (headings, lists, fenced code, tables, links, images, blockquotes, hr) |
| Source code (curated set) | Tokenized highlighting (`.js .ts .jsx .tsx .py .json .yml .toml .css .html .sh .bash .zsh`) |
| Images (`.png .jpg .gif .webp .svg .ico`) | Inlined |
| Other text | Plain monospace |
| Other binary | Download link inside the page |

## Encrypted mode (threat model)

Zix's `--password` mode is real encryption, not security theater:

- Key derivation: **PBKDF2-SHA-256, 210,000 iterations** (OWASP recommendation, 2023+).
- Encryption: **AES-GCM-256**, **12-byte random IV per file**, salt is per-bundle (16 bytes).
- AAD = utf-8 of the file's path. Files cannot be swapped between paths without invalidating the tag.
- A tiny "check token" is decrypted first so a wrong password fails fast with a friendly message.
- All decryption happens **in the browser**, in memory. The HTML file itself contains only ciphertext.

It is **not** a substitute for proper auth on a server. Anyone who has both the bundle and the password can read it. If your password is weak, brute-forcing PBKDF2 is slow but possible. Use long passphrases for sensitive material, and treat encrypted bundles like you'd treat encrypted zips.

## How it works

```
┌────────────┐       ┌───────────┐       ┌────────────────────┐
│  pack.js   │──────►│ render.js │──────►│  *.zix.html (out)  │
│  walks &   │       │ inlines   │       │  HTML + CSS + JS   │
│ classifies │       │ template  │       │  + JSON bundle     │
└────────────┘       └───────────┘       └────────────────────┘
```

The output HTML embeds:
1. A `<style>` block with the full theme CSS.
2. A `<script type="application/json" id="zix-bundle">` blob with the file manifest.
3. A small JS runtime that reads the manifest, builds the tree, opens files, and (if encrypted) prompts for the password and decrypts on demand.

## Requirements

- Node ≥ 20.6.0 (for the bundled WebCrypto + `node:test` runner).
- A browser that supports WebCrypto (every modern browser).

## Development

```bash
git clone https://github.com/luffyxak/Zix
cd Zix
npm test            # runs the test suite
npm run smoke       # packs the examples/ folder to tmp/notes.zix.html
```

The test suite covers args parsing, the markdown subset, syntax highlighter, file walker, crypto round-trip, end-to-end CLI execution, and a browser-shaped decrypt round-trip.

## Project layout

```
src/
  cli.js              CLI entry point
  args.js             argv parser
  pack.js             walk + classify + manifest
  render.js           template inlining
  markdown.js         tiny safe markdown
  highlight.js        tokenizer-based code coloring
  crypto.js           WebCrypto helpers (PBKDF2 + AES-GCM)
  template/
    page.html         HTML shell
    runtime.js        browser runtime
    styles.css        theme
test/
  *.test.js           node --test suite
docs/
  PLAN.md             planning doc
examples/
  notes/              demo input
```

## Roadmap

- Drag-and-drop a folder onto the page to repack in-browser
- Diff mode (pack two folders, view side-by-side)
- Print stylesheet and PDF export
- Plugin hooks for custom renderers
- More languages in the highlighter

## Contributing

Issues and PRs welcome. Please run `npm test` and add a test for any new behavior.

## License

[MIT](LICENSE) © Zix contributors
