// Browser runtime for a Zix bundle. Reads window.__ZIX__ and renders the page.
// For encrypted bundles, prompts for password and decrypts in memory.
(function () {
  'use strict';
  var bundle = window.__ZIX__;
  if (!bundle) {
    document.body.innerHTML = '<pre>Zix: missing bundle data</pre>';
    return;
  }

  var ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ESCAPES[c]; }); }

  function fromB64(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function applyTheme(theme) {
    var t = theme || bundle.theme || 'auto';
    document.documentElement.setAttribute('data-theme', t);
  }

  function flattenTree(tree, depth, acc) {
    depth = depth || 0;
    acc = acc || [];
    for (var i = 0; i < tree.length; i++) {
      var n = tree[i];
      acc.push({ depth: depth, type: n.type, path: n.path, name: n.path.split('/').pop() });
      if (n.type === 'dir' && n.children) flattenTree(n.children, depth + 1, acc);
    }
    return acc;
  }

  function renderTree(filter) {
    var nodes = flattenTree(bundle.tree);
    var listing = document.getElementById('zix-tree');
    listing.innerHTML = '';
    var lower = (filter || '').toLowerCase();
    var anyFile = false;
    var firstFile = null;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (lower && node.path.toLowerCase().indexOf(lower) === -1) continue;
      var div = document.createElement('div');
      div.className = 'zix-node ' + (node.type === 'dir' ? 'is-dir' : 'is-file');
      div.setAttribute('data-depth', String(Math.min(node.depth, 4)));
      div.setAttribute('data-path', node.path);
      div.setAttribute('data-type', node.type);
      var icon = node.type === 'dir' ? '▸' : '·';
      div.innerHTML = '<span class="zix-icon">' + icon + '</span>' + esc(node.name);
      listing.appendChild(div);
      if (node.type === 'file') {
        anyFile = true;
        if (!firstFile) firstFile = node.path;
        div.addEventListener('click', (function (p) { return function () { openFile(p); }; })(node.path));
      }
    }
    if (!anyFile) {
      listing.innerHTML = '<div class="zix-node is-dir">no matches</div>';
    }
    return firstFile;
  }

  var key = null;     // CryptoKey if encrypted
  var fileCache = {}; // decrypted file cache

  async function decryptFileEntry(path) {
    if (fileCache[path]) return fileCache[path];
    var rec = bundle.files[path];
    if (!rec) return null;
    if (!bundle.encrypted) {
      fileCache[path] = rec;
      return rec;
    }
    var iv = fromB64(rec.iv);
    var ct = fromB64(rec.ct);
    var aad = new TextEncoder().encode(path);
    var pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv, additionalData: aad },
      key,
      ct
    );
    var json = new TextDecoder().decode(pt);
    var parsed = JSON.parse(json);
    fileCache[path] = parsed;
    return parsed;
  }

  function langClass(lang) {
    return 'language-' + (lang || 'plain');
  }

  function highlightCode(code, lang) {
    // Runtime is intentionally dumb: it trusts the server-rendered markdown
    // (which is already highlighted), and for raw code files it falls back to
    // plain monospace. The escaping above keeps this safe.
    return esc(code);
  }

  async function openFile(path) {
    var rec = await decryptFileEntry(path);
    var main = document.getElementById('zix-main');
    document.querySelectorAll('.zix-node').forEach(function (n) { n.classList.remove('is-active'); });
    var active = document.querySelector('.zix-node[data-path="' + cssEscape(path) + '"]');
    if (active) active.classList.add('is-active');

    if (!rec) { main.innerHTML = '<div id="zix-empty">file not found</div>'; return; }

    var html = '';
    html += '<h1>' + esc(path) + '</h1>';
    html += '<div class="zix-meta">' + rec.kind + ' · ' + (rec.size != null ? humanSize(rec.size) : '') + (rec.lang ? ' · ' + esc(rec.lang) : '') + '</div>';

    if (rec.kind === 'markdown') {
      html += rec.html;
    } else if (rec.kind === 'code') {
      html += '<pre><code class="' + esc(langClass(rec.lang)) + '">' + highlightCode(rec.text, rec.lang) + '</code></pre>';
    } else if (rec.kind === 'text') {
      html += '<pre><code>' + esc(rec.text) + '</code></pre>';
    } else if (rec.kind === 'image') {
      // SVG can carry inline scripts and event handlers. Render every image
      // (including SVG) inside an <img> tag so the browser treats it as a
      // passive image and does not execute its contents.
      var src;
      if (rec.mime === 'image/svg+xml') {
        src = 'data:image/svg+xml;base64,' + (rec.b64 || btoa(unescape(encodeURIComponent(rec.text || ''))));
      } else {
        src = 'data:' + esc(rec.mime) + ';base64,' + rec.b64;
      }
      html += '<img alt="' + esc(path) + '" src="' + src + '">';
    } else if (rec.kind === 'binary') {
      var href = 'data:' + esc(rec.mime || 'application/octet-stream') + ';base64,' + rec.b64;
      html += '<p><a download="' + esc(path.split('/').pop()) + '" href="' + href + '">Download ' + esc(path) + '</a> (' + humanSize(rec.size) + ')</p>';
    } else {
      html += '<pre>' + esc(JSON.stringify(rec, null, 2)) + '</pre>';
    }

    main.innerHTML = html;
    main.scrollTop = 0;
  }

  function humanSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/["\\]/g, '\\$&');
  }

  function setupChrome() {
    var root = document.getElementById('zix-root');
    if (root) return;
    document.body.innerHTML =
      '<div id="zix-root">' +
        '<aside id="zix-side">' +
          '<div id="zix-head">' +
            '<div id="zix-title"></div>' +
            '<button id="zix-theme" title="Toggle theme">◐</button>' +
          '</div>' +
          '<div id="zix-search"><input type="search" placeholder="Search files…" /></div>' +
          '<div id="zix-tree"></div>' +
        '</aside>' +
        '<main id="zix-main"><div id="zix-empty">Select a file</div></main>' +
      '</div>';
    document.getElementById('zix-title').textContent = bundle.title || 'Zix';
    document.title = (bundle.title || 'Zix') + ' · Zix';
    document.getElementById('zix-theme').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') || 'auto';
      var order = ['auto', 'light', 'dark'];
      var next = order[(order.indexOf(cur) + 1) % order.length];
      applyTheme(next);
    });
    var input = document.querySelector('#zix-search input');
    input.addEventListener('input', function () { renderTree(input.value); });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
    });
  }

  async function start() {
    setupChrome();
    applyTheme();
    var first = renderTree('');
    if (first) openFile(first);
  }

  function showLock() {
    document.body.innerHTML =
      '<div id="zix-lock"><div id="zix-lock-card">' +
        '<h2>🔒 Locked</h2>' +
        '<p>This Zix bundle is encrypted. Enter the password to view.</p>' +
        '<input id="zix-pw" type="password" autofocus placeholder="password" />' +
        '<button id="zix-go">Unlock</button>' +
        '<div id="zix-lock-error"></div>' +
      '</div></div>';
    var pw = document.getElementById('zix-pw');
    var err = document.getElementById('zix-lock-error');
    var btn = document.getElementById('zix-go');
    async function tryUnlock() {
      err.textContent = '';
      btn.disabled = true; btn.textContent = 'Unlocking…';
      try {
        var salt = fromB64(bundle.kdf.salt);
        var baseKey = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(pw.value),
          { name: 'PBKDF2' },
          false,
          ['deriveKey']
        );
        var derived = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: bundle.kdf.iterations, hash: bundle.kdf.hash },
          baseKey,
          { name: 'AES-GCM', length: bundle.cipher.length },
          false,
          ['encrypt', 'decrypt']
        );
        // verify against the check token
        var iv = fromB64(bundle.check.iv);
        var ct = fromB64(bundle.check.ct);
        var aad = new TextEncoder().encode('__zix_check__');
        var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv, additionalData: aad }, derived, ct);
        var ok = new TextDecoder().decode(pt);
        if (ok !== 'ok') throw new Error('bad token');
        key = derived;
        await start();
      } catch (e) {
        err.textContent = 'Wrong password or corrupted bundle';
        btn.disabled = false; btn.textContent = 'Unlock';
        pw.focus(); pw.select();
      }
    }
    btn.addEventListener('click', tryUnlock);
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryUnlock(); });
  }

  if (bundle.encrypted) {
    showLock();
  } else {
    start();
  }
})();
