# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-27

Initial public release.

### Added
- `zix pack <path>` CLI that produces a single self-contained HTML file from a folder or file.
- Markdown rendering for `.md` and `.markdown` (headings, lists, fenced code, tables, blockquotes, links, images, hr, inline bold/italic/code).
- Syntax highlighting for a curated language set: JS/TS/JSX/TSX, Python, JSON, YAML, TOML, CSS, HTML, shell.
- Image inlining (`.png .jpg .jpeg .gif .webp .svg .ico`) as base64 or text (SVG).
- Folder tree navigation, search-as-you-type (focus with `/`).
- Light, dark, and auto themes (`--theme`).
- Encrypted bundles via `--password` using PBKDF2-SHA-256 (210,000 iterations) + AES-GCM-256, with per-file IV and AAD-bound paths.
- Argument parser with positional commands, long/short flags, `--flag=value` form, repeatable list flags.
- Exclude/include glob filters and `--max-size` for skipping large files.
- Test suite (43 tests) with `node --test` covering args, markdown, highlighter, walker, crypto, render, end-to-end CLI, and an encrypted round-trip simulating browser decrypt.
- GitHub Actions workflow for CI on Node 20 and 22.
- Example folder under `examples/notes/` for trying things quickly.
- MIT license, README with usage and threat model, planning doc under `docs/PLAN.md`.

### Security notes
- Encrypted mode uses 210k PBKDF2 iterations (OWASP 2023+ recommendation).
- AAD binding prevents file-path swapping inside an encrypted bundle.
- The HTML is self-contained; no outbound requests, no fonts pulled from CDNs, no analytics.
