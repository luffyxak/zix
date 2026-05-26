# Security

## Reporting

If you find a security issue (especially in the encryption code), please open a private security advisory on GitHub or email the maintainer rather than filing a public issue.

## Threat model

Zix's `--password` mode is designed to protect a bundle in transit and at rest from a casual reader who lacks the password. It is **not**:

- A replacement for server-side authentication
- Resistant to a determined offline attacker if the password is weak
- A way to revoke access once a bundle is shared

## What Zix does

- **Key derivation**: PBKDF2-SHA-256, 210,000 iterations (OWASP 2023+ recommendation), 16-byte random salt per bundle.
- **Encryption**: AES-GCM-256, 12-byte random IV per file.
- **Integrity / binding**: AAD = utf-8 of each file's path, so a file cannot be relabeled or swapped without invalidating the GCM tag.
- **Verification**: each bundle includes a tiny check token, decrypted first to fail fast on a wrong password.
- **Decryption**: happens entirely in the browser, in memory, via the WebCrypto API.

## Output hardening

The generated HTML page applies a strict Content Security Policy via a meta tag:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data:; font-src data:; connect-src 'none'; base-uri 'none';
form-action 'none'; frame-ancestors 'self'
```

Implications:
- No external script, style, image, or font can load.
- No outbound network connection is permitted (`connect-src 'none'`).
- The page cannot navigate forms or change its base URL.
- Inline script and style are required for the runtime to function in a single file, which is why those two `'unsafe-inline'` allowances exist.

In addition:
- A `<meta name="referrer" content="no-referrer">` tag prevents referrer leakage if a user clicks a link inside a markdown file.
- All file content rendered to HTML is escaped through one centralised helper.
- Markdown links with a `javascript:` scheme are rewritten to `#` before rendering.
- SVG files are rendered via an `<img>` tag with a `data:` URL, not inlined as live markup, so SVG-borne `<script>` and `onload` handlers cannot execute.

## What Zix does NOT do

- It does not implement any custom crypto primitive.
- It does not transmit the password or any data anywhere.
- It does not store keys to local storage or cookies.
- It does not validate that the recipient is authorized; possession of the password is the gate.

## Recommendations

- Use a long passphrase (a sentence is fine) for sensitive bundles.
- Treat an encrypted Zix bundle like an encrypted zip: anyone who has both the file and the password can read it.
- Don't include real production secrets; even with strong crypto, the bundle may persist in mailboxes or backups longer than you intend.
