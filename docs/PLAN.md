# Zix: Plan

A tiny Node CLI that turns any file or folder into a single, self-contained, shareable HTML page. Optional client-side password protection with WebCrypto AES-GCM.

## Goals (v0.1.0)

- One command: `zix pack <path> [--out file.html] [--password ...] [--title ...] [--theme ...]`.
- Output is **one** HTML file. No external requests, no fonts pulled from CDNs, no analytics.
- Renders:
  - Markdown (`.md`, `.markdown`) with GitHub-flavored basics (headings, code, lists, tables, links, images).
  - Code files with syntax highlighting (lightweight, no Prism/HLJS at runtime: server-side classification, monospace + Shiki-free token coloring via simple regex tokenizer for a curated set of languages, falling back to plain monospace).
  - Images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`) inlined as base64 (or text for SVG).
  - Plain text and unknown binary files (binary shown as a download link with size).
- Sidebar tree, keyboard navigation (`↑/↓`, `Enter`), in-page search, copy-as-link to a section.
- Optional password mode: each file is encrypted with AES-GCM. Page asks for the password and decrypts in-browser. Wrong password → friendly error.
- No runtime dependencies. Pure Node + WebCrypto in the browser. Dev-time tests with `node --test`.

## Non-goals (v0.1.0)

- Multi-page navigation across multiple Zix bundles.
- Editing, syncing, or live collaboration.
- Server-side rendering, hosting, or auth backends.
- Heavyweight syntax highlighting (we will ship a reasonable subset and accept that some languages render as plain monospace).

## Architecture

```
src/
  cli.js           # arg parsing, top-level orchestration
  pack.js          # walks input, classifies files, builds the manifest
  render.js        # composes the final HTML from template + manifest
  markdown.js      # tiny markdown → HTML renderer (safe by default)
  highlight.js     # tokenizer-based code coloring for a curated language set
  crypto.js        # password-mode helpers (PBKDF2 + AES-GCM) shared shape
  template/
    page.html      # the single-file page template (script + style inlined)
    runtime.js     # browser runtime: nav, search, decrypt
    styles.css     # light/dark themes
test/
  *.test.js        # node --test
docs/
  PLAN.md          # this file
  USAGE.md         # examples
README.md
LICENSE
CHANGELOG.md
```

## Crypto design (password mode)

- Key derivation: PBKDF2-SHA-256, **210,000** iterations (OWASP 2023+), 16-byte random salt per bundle.
- Encryption: AES-GCM-256, 12-byte random IV per file. AAD = file path so files cannot be swapped.
- The bundle stores: `{ salt, files: [{ path, iv, ct, meta }] }`. Metadata (mime, original size) is included inside the AAD-bound plaintext, not leaked.
- The HTML still loads without the password; the runtime asks the user, derives the key, and decrypts files on demand.
- This is real protection against casual interception, but it's not a substitute for proper auth. We document the threat model honestly.

## Plain-mode bundle shape

```jsonc
{
  "version": 1,
  "title": "string",
  "createdAt": "ISO-8601",
  "encrypted": false,
  "tree": [{ "path": "...", "type": "file|dir", "children": [...] }],
  "files": {
    "<path>": { "kind": "markdown|code|image|text|binary", "lang": "ts", "data": "..." }
  }
}
```

## CLI surface

```
zix pack <path>
  --out, -o     <file>     default: <basename>.zix.html
  --password,-p <pass>     enable encrypted mode
  --title       <text>     default: derived from input name
  --theme       light|dark|auto   default: auto
  --max-size    <bytes>    skip files larger than this (default 5MB)
  --include     <glob>     include patterns
  --exclude     <glob>     exclude patterns (default: node_modules, .git, .DS_Store)
  --quiet, -q
zix --help
zix --version
```

## Testing

- Unit tests for: argv parser, markdown subset, language classifier, file walker, manifest builder, crypto round-trip (in Node via `globalThis.crypto`).
- Snapshot test: pack a fixture folder and check the output HTML is non-empty, contains the title, and parses as valid HTML5 (lightweight check).
- E2E smoke test using a headless DOM (no Playwright; we'll spin up `linkedom` only if available: otherwise we skip that level and stick to string assertions).

## Milestones

1. Repo scaffold, README, LICENSE, package.json, CI config.
2. Pack pipeline (walk → classify → manifest), no encryption yet, basic template.
3. Markdown + highlight + image inlining + tree nav + search.
4. Password mode (PBKDF2 + AES-GCM), runtime decrypt UI.
5. Tests, CI, polish, screenshots, CHANGELOG, tag v0.1.0.

## Risks

- "Single file" can balloon for image-heavy folders. Mitigation: `--max-size`, and a clear note in README.
- Markdown subsets always disappoint someone. Mitigation: be explicit about what's supported; PRs welcome.
- Crypto is easy to get subtly wrong. Mitigation: PBKDF2 + AES-GCM with AAD, no custom primitives, round-trip tests.
