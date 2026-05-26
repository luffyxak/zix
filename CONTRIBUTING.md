# Contributing to Zix

Thanks for your interest! Zix aims to stay tiny: a single CLI, one HTML template, no runtime dependencies. Please keep contributions aligned with that.

## Quick start

```bash
git clone https://github.com/luffyxak/Zix
cd Zix
npm test
npm run smoke
```

## Ground rules

1. **No new runtime dependencies** unless we discuss it first. Dev-time tools (test runners, linters) are fine.
2. **Add a test** for any new behavior. We use `node --test`; tests live in `test/*.test.js`.
3. **Keep the output single-file.** Anything that needs CDN fonts or external assets does not belong here.
4. **Be kind to the bundle size.** Zix's appeal is small footprint; a feature that adds 200 KB needs a strong justification.

## Areas where help is wanted

- More languages in the syntax highlighter (`src/highlight.js`).
- Print stylesheet for nicer PDF export.
- Drag-and-drop a folder onto the page (browser-side repack via the File System Access API).
- A diff mode (pack two folders, render side by side).

## Reporting issues

Please include:

- Node version (`node --version`)
- OS
- The exact command you ran
- Expected vs. actual behavior
- A minimal folder if rendering looks wrong

## Code style

- Idiomatic modern Node ESM. `async/await` over callbacks.
- Functions over classes unless state is unavoidable.
- Pure modules: `src/*.js` should not have side effects on import.
- Comments explain *why*, not *what*.

## Releasing

(For maintainers.)

```bash
npm test
# bump version in package.json + CHANGELOG.md
git tag v0.x.0
git push --tags
npm publish
```
