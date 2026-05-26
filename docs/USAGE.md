# Zix usage cookbook

Practical recipes for the `zix` CLI.

## Pack a folder

```bash
zix pack ./my-notes
# wrote my-notes.zix.html (… KB, N files)
```

Open `my-notes.zix.html` in any browser.

## Pack a single file

```bash
zix pack ./README.md
# wrote README.zix.html
```

## Custom output and title

```bash
zix pack ./design \
  --out ./build/design.html \
  --title "Design Review v2"
```

## Encrypt a bundle

```bash
zix pack ./private --password 'a long passphrase you will remember'
```

The recipient needs the password to view the contents. Wrong password → friendly error in the browser.

> 🔐 Use a long passphrase. PBKDF2 is slow but a 4-character password is still cheap to brute-force offline.

## Filter what gets included

```bash
# only markdown and javascript
zix pack ./repo \
  --include "**/*.md" \
  --include "**/*.js"

# exclude generated artifacts
zix pack ./repo \
  --exclude "**/dist/**" \
  --exclude "**/coverage/**"

# tighter file size cap (1 MB)
zix pack ./repo --max-size 1048576
```

By default these directory names are excluded: `node_modules`, `.git`, `.DS_Store`, `dist`, `build`, `coverage`, `tmp`, `out`.

## Theming

```bash
zix pack ./notes --theme dark
zix pack ./notes --theme light
zix pack ./notes --theme auto    # follows system preference (default)
```

The viewer also has a theme toggle button in the top-right of the sidebar.

## Quiet mode for scripts

```bash
zix pack ./notes -q -o out.html && upload out.html
```

## CI / scripted use

```bash
# pack the docs folder on every release tag and attach to GitHub Release
zix pack ./docs --out ./build/docs.zix.html --quiet
gh release upload "$TAG" ./build/docs.zix.html
```

## Programmatic API

```js
import { pack } from 'zix/src/pack.js';
import { renderHtml } from 'zix/src/render.js';
import fs from 'node:fs/promises';

const bundle = await pack('./my-notes', {
  title: 'Hello',
  exclude: ['*.png']
});
const html = await renderHtml(bundle, { theme: 'dark', version: '0.1.0' });
await fs.writeFile('out.html', html);
```

## Troubleshooting

**"Path not found"**: double-check the relative path. Zix resolves against the current working directory.

**"Unknown flag"**: Zix is strict about flags so typos fail loudly. Run `zix --help`.

**Output is huge**: image-heavy folders explode size because images are inlined. Lower `--max-size` or `--exclude` images.

**Wrong password keeps failing**: make sure your shell isn't expanding `$` or `!` in the passphrase. Quote it with single quotes.
