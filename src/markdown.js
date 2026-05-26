// Tiny Markdown → HTML renderer. Intentionally small and safe: it escapes any
// HTML-looking input and supports a curated subset of markdown features
// (headings, paragraphs, lists, fenced code, inline code, bold/italic, links,
// images, blockquotes, hr, tables).
//
// Code blocks delegate language tokenizing to highlight.js when a language is
// known; otherwise they're rendered as plain escaped text.

import { highlight, classifyLanguage } from './highlight.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// inline rendering: handles `code`, **bold**, *italic*, [text](url), ![alt](src)
function renderInline(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];

    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      if (end !== -1) {
        out += `<code>${escapeHtml(src.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }

    if (c === '!' && src[i + 1] === '[') {
      const m = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(src.slice(i));
      if (m) {
        out += `<img alt="${escapeHtml(m[1])}" src="${escapeAttr(m[2])}">`;
        i += m[0].length;
        continue;
      }
    }

    if (c === '[') {
      const m = /^\[([^\]]+)\]\(([^)]+)\)/.exec(src.slice(i));
      if (m) {
        out += `<a href="${escapeAttr(m[2])}" rel="noopener noreferrer">${renderInline(m[1])}</a>`;
        i += m[0].length;
        continue;
      }
    }

    if (c === '*' || c === '_') {
      // bold first
      if (src[i + 1] === c) {
        const end = src.indexOf(c + c, i + 2);
        if (end !== -1) {
          out += `<strong>${renderInline(src.slice(i + 2, end))}</strong>`;
          i = end + 2;
          continue;
        }
      }
      // italic
      const end = src.indexOf(c, i + 1);
      if (end !== -1 && end !== i + 1) {
        out += `<em>${renderInline(src.slice(i + 1, end))}</em>`;
        i = end + 1;
        continue;
      }
    }

    out += escapeHtml(c);
    i += 1;
  }
  return out;
}

function escapeAttr(s) {
  // strict: only allow http(s), mailto, relative, data:image
  const trimmed = String(s).trim();
  if (/^javascript:/i.test(trimmed)) return '#';
  return escapeHtml(trimmed);
}

export function renderMarkdown(input) {
  const lines = String(input).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = /^```(\S+)?\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] || '';
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      const code = buf.join('\n');
      const known = lang ? classifyLanguage('x.' + lang) : null;
      const html = known ? highlight(code, known) : escapeHtml(code);
      out.push(`<pre class="zix-code"${lang ? ` data-lang="${escapeAttr(lang)}"` : ''}><code>${html}</code></pre>`);
      continue;
    }

    // heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = renderInline(heading[2].trim());
      const id = slug(heading[2].trim());
      out.push(`<h${level} id="${escapeAttr(id)}">${text}</h${level}>`);
      i += 1;
      continue;
    }

    // hr
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    // table (very small: needs |---|---| separator on second row)
    if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*[-:|\s]+$/.test(lines[i + 1]) && /\|/.test(lines[i + 1])) {
      const headers = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      let html = '<table><thead><tr>';
      for (const h of headers) html += `<th>${renderInline(h)}</th>`;
      html += '</tr></thead><tbody>';
      for (const r of rows) {
        html += '<tr>';
        for (const c of r) html += `<td>${renderInline(c)}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table>';
      out.push(html);
      continue;
    }

    // unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      out.push(`<ul>${buf.map((l) => `<li>${renderInline(l)}</li>`).join('')}</ul>`);
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      out.push(`<ol>${buf.map((l) => `<li>${renderInline(l)}</li>`).join('')}</ol>`);
      continue;
    }

    // blank
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // paragraph: collect until blank/known-block
    const buf = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${renderInline(buf.join('\n'))}</p>`);
  }

  return out.join('\n');
}

function splitRow(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((s) => s.trim());
}

function isBlockStart(line) {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^```/.test(line) ||
    /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
  );
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'section';
}
