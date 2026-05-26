// Tiny syntax highlighter. We tokenize for a curated set of languages and
// emit <span class="t-XYZ"> spans. Anything not in the curated set is rendered
// as plain escaped monospace text by the caller.
//
// The tokenizer is intentionally simple: it recognizes comments, strings,
// numbers, keywords and identifiers. It does not try to be a full parser.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]); }

const COMMON_JS_TS_KW = new Set([
  'as','async','await','break','case','catch','class','const','continue','debugger','default',
  'delete','do','else','enum','export','extends','false','finally','for','from','function',
  'if','implements','import','in','instanceof','interface','let','new','null','of','package',
  'private','protected','public','return','static','super','switch','this','throw','true',
  'try','type','typeof','undefined','var','void','while','with','yield'
]);

const PY_KW = new Set([
  'False','None','True','and','as','assert','async','await','break','class','continue','def',
  'del','elif','else','except','finally','for','from','global','if','import','in','is','lambda',
  'nonlocal','not','or','pass','raise','return','try','while','with','yield'
]);

const JSON_KW = new Set(['true','false','null']);

const SHELL_KW = new Set([
  'if','then','else','elif','fi','for','in','do','done','while','case','esac','function',
  'return','export','local','readonly','set','unset','source','exit','echo','cd','ls','pwd',
  'mkdir','rm','cp','mv','cat','grep','sed','awk','find','curl','wget','git','npm','node'
]);

const HTML_KW = new Set([]); // we tokenize html via a different path

const LANGS = {
  js:   { keywords: COMMON_JS_TS_KW, comments: ['//', ['/*','*/']], strings: ['"',"'",'`'] },
  ts:   { keywords: COMMON_JS_TS_KW, comments: ['//', ['/*','*/']], strings: ['"',"'",'`'] },
  jsx:  { keywords: COMMON_JS_TS_KW, comments: ['//', ['/*','*/']], strings: ['"',"'",'`'] },
  tsx:  { keywords: COMMON_JS_TS_KW, comments: ['//', ['/*','*/']], strings: ['"',"'",'`'] },
  py:   { keywords: PY_KW,           comments: ['#'],               strings: ['"',"'"] },
  json: { keywords: JSON_KW,         comments: [],                  strings: ['"'] },
  sh:   { keywords: SHELL_KW,        comments: ['#'],               strings: ['"',"'"] },
  bash: { keywords: SHELL_KW,        comments: ['#'],               strings: ['"',"'"] },
  zsh:  { keywords: SHELL_KW,        comments: ['#'],               strings: ['"',"'"] },
  yaml: { keywords: new Set(['true','false','null','yes','no','on','off']), comments: ['#'], strings: ['"',"'"] },
  toml: { keywords: new Set(['true','false']), comments: ['#'], strings: ['"',"'"] },
  css:  { keywords: new Set(['important']), comments: [['/*','*/']], strings: ['"',"'"] },
  html: { html: true },
  md:   { md: true }
};

const EXT_TO_LANG = {
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx',
  ts: 'ts', tsx: 'tsx',
  py: 'py',
  json: 'json',
  sh: 'sh', bash: 'bash', zsh: 'zsh',
  yml: 'yaml', yaml: 'yaml',
  toml: 'toml',
  css: 'css',
  html: 'html', htm: 'html',
  md: 'md', markdown: 'md'
};

export function classifyLanguage(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  if (!m) return null;
  const lang = EXT_TO_LANG[m[1].toLowerCase()];
  return lang || null;
}

export function highlight(code, lang) {
  const def = LANGS[lang];
  if (!def) return esc(code);
  if (def.html) return highlightHtml(code);
  return highlightGeneric(code, def);
}

function highlightGeneric(code, def) {
  const out = [];
  let i = 0;
  const n = code.length;

  const lineComments = (def.comments || []).filter((x) => typeof x === 'string');
  const blockComments = (def.comments || []).filter((x) => Array.isArray(x));
  const strings = def.strings || [];
  const keywords = def.keywords || new Set();

  while (i < n) {
    const c = code[i];

    // line comment
    let lineMatched = false;
    for (const pre of lineComments) {
      if (code.startsWith(pre, i)) {
        const end = code.indexOf('\n', i);
        const stop = end === -1 ? n : end;
        out.push(`<span class="t-c">${esc(code.slice(i, stop))}</span>`);
        i = stop;
        lineMatched = true;
        break;
      }
    }
    if (lineMatched) continue;

    // block comment
    let blockMatched = false;
    for (const [open, close] of blockComments) {
      if (code.startsWith(open, i)) {
        const end = code.indexOf(close, i + open.length);
        const stop = end === -1 ? n : end + close.length;
        out.push(`<span class="t-c">${esc(code.slice(i, stop))}</span>`);
        i = stop;
        blockMatched = true;
        break;
      }
    }
    if (blockMatched) continue;

    // string
    if (strings.includes(c)) {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\' && j + 1 < n) { j += 2; continue; }
        if (code[j] === quote) { j += 1; break; }
        j += 1;
      }
      out.push(`<span class="t-s">${esc(code.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    // number
    if (/[0-9]/.test(c) && !/[a-zA-Z_]/.test(code[i - 1] || '')) {
      const m = /^-?\d+(\.\d+)?([eE][-+]?\d+)?/.exec(code.slice(i));
      if (m) {
        out.push(`<span class="t-n">${esc(m[0])}</span>`);
        i += m[0].length;
        continue;
      }
    }

    // identifier / keyword
    if (/[a-zA-Z_$]/.test(c)) {
      const m = /^[a-zA-Z_$][a-zA-Z0-9_$]*/.exec(code.slice(i));
      const word = m[0];
      if (keywords.has(word)) {
        out.push(`<span class="t-k">${esc(word)}</span>`);
      } else {
        out.push(esc(word));
      }
      i += word.length;
      continue;
    }

    out.push(esc(c));
    i += 1;
  }
  return out.join('');
}

function highlightHtml(code) {
  // Minimal: tag delimiters and attribute strings.
  let out = '';
  let i = 0;
  while (i < code.length) {
    if (code[i] === '<') {
      const end = code.indexOf('>', i);
      if (end === -1) { out += esc(code.slice(i)); break; }
      const tag = code.slice(i, end + 1);
      out += `<span class="t-k">${esc(tag)}</span>`;
      i = end + 1;
    } else {
      const next = code.indexOf('<', i);
      const stop = next === -1 ? code.length : next;
      out += esc(code.slice(i, stop));
      i = stop;
    }
  }
  return out;
}
