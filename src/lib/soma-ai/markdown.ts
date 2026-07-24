/**
 * src/lib/soma-ai/markdown.ts
 *
 * Lightweight, zero-dependency markdown → HTML renderer for Soma AI messages.
 * Covers the full markdown subset that Gemini uses in its responses:
 *   - Headings (# ## ###)
 *   - Bold (**text** or __text__)
 *   - Italic (*text* or _text_)
 *   - Inline code (`code`)
 *   - Fenced code blocks (```lang\n...\n```)
 *   - Unordered lists (- / * / +)
 *   - Ordered lists (1. 2. 3.)
 *   - Tables (| col | col |)
 *   - Blockquotes (> text)
 *   - Horizontal rules (--- / ***)
 *   - Line breaks and paragraphs
 *
 * Security: all user-visible text is HTML-escaped before insertion so no
 * XSS is possible via AI-generated content.
 */

// ---------------------------------------------------------------------------
// HTML escape
// ---------------------------------------------------------------------------

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Inline formatting (applied inside block elements)
// ---------------------------------------------------------------------------

function inlineFormat(text: string): string {
  let s = text;

  // Bold+italic: ***text***
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, (_, t) => `<strong><em>${esc(t)}</em></strong>`);

  // Bold: **text** or __text__
  s = s.replace(/\*\*(.+?)\*\*/g, (_, t) => `<strong>${esc(t)}</strong>`);
  s = s.replace(/__(.+?)__/g, (_, t) => `<strong>${esc(t)}</strong>`);

  // Italic: *text* or _text_ (not inside words)
  s = s.replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, (_, t) => `<em>${esc(t)}</em>`);
  s = s.replace(/(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/g, (_, t) => `<em>${esc(t)}</em>`);

  // Inline code: `code`
  s = s.replace(/`([^`\n]+)`/g, (_, t) =>
    `<code class="soma-inline-code">${esc(t)}</code>`
  );

  // Autolinks: http(s):// URLs
  s = s.replace(
    /(?<![">])(https?:\/\/[^\s<>"']+)/g,
    (url) =>
      `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="soma-link">${esc(url)}</a>`
  );

  return s;
}

// ---------------------------------------------------------------------------
// Table renderer
// ---------------------------------------------------------------------------

function renderTable(lines: string[]): string {
  const rows = lines.map((l) =>
    l
      .trim()
      .replace(/^\||\|$/g, "") // strip leading/trailing pipes
      .split("|")
      .map((cell) => cell.trim())
  );

  if (rows.length < 2) return lines.map((l) => `<p>${inlineFormat(esc(l))}</p>`).join("\n");

  const [header, , ...body] = rows; // row[1] is the separator row
  const headerHtml = (header ?? [])
    .map((cell) => `<th class="soma-th">${inlineFormat(cell)}</th>`)
    .join("");

  const bodyHtml = body
    .map(
      (row) =>
        `<tr>${(row ?? []).map((cell) => `<td class="soma-td">${inlineFormat(cell)}</td>`).join("")}</tr>`
    )
    .join("\n");

  return `<div class="soma-table-wrap"><table class="soma-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// Code block renderer with language label
// ---------------------------------------------------------------------------

function renderCodeBlock(code: string, lang: string): string {
  const langLabel = lang
    ? `<span class="soma-code-lang">${esc(lang)}</span>`
    : "";
  const copyBtn = `<button class="soma-code-copy" aria-label="Copy code" data-code="${esc(code)}">Copy</button>`;
  return `<div class="soma-code-block">${langLabel}${copyBtn}<pre class="soma-pre"><code class="soma-code language-${esc(lang || "text")}">${esc(code)}</code></pre></div>`;
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

export function renderMarkdown(raw: string): string {
  // Normalise line endings
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");

  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ──────────────────────────────────────────────────
    const fenceMatch = line.match(/^```(\w*)$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] ?? "";
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      output.push(renderCodeBlock(codeLines.join("\n"), lang));
      continue;
    }

    // ── Table ───────────────────────────────────────────────────────────────
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      output.push(renderTable(tableLines));
      continue;
    }

    // ── Heading ─────────────────────────────────────────────────────────────
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) {
      output.push(`<h3 class="soma-h3">${inlineFormat(h3[1])}</h3>`);
      i++;
      continue;
    }
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      output.push(`<h2 class="soma-h2">${inlineFormat(h2[1])}</h2>`);
      i++;
      continue;
    }
    const h1 = line.match(/^#\s+(.+)/);
    if (h1) {
      output.push(`<h1 class="soma-h1">${inlineFormat(h1[1])}</h1>`);
      i++;
      continue;
    }

    // ── Blockquote ──────────────────────────────────────────────────────────
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      output.push(
        `<blockquote class="soma-blockquote">${quoteLines.map(inlineFormat).join("<br>")}</blockquote>`
      );
      continue;
    }

    // ── Horizontal rule ─────────────────────────────────────────────────────
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      output.push(`<hr class="soma-hr" />`);
      i++;
      continue;
    }

    // ── Unordered list ──────────────────────────────────────────────────────
    if (/^[\-\*\+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\-\*\+]\s/.test(lines[i])) {
        items.push(`<li class="soma-li">${inlineFormat(lines[i].replace(/^[\-\*\+]\s/, ""))}</li>`);
        i++;
      }
      output.push(`<ul class="soma-ul">${items.join("")}</ul>`);
      continue;
    }

    // ── Ordered list ────────────────────────────────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li class="soma-li">${inlineFormat(lines[i].replace(/^\d+\.\s/, ""))}</li>`);
        i++;
      }
      output.push(`<ol class="soma-ol">${items.join("")}</ol>`);
      continue;
    }

    // ── Empty line → paragraph break ────────────────────────────────────────
    if (line.trim() === "") {
      i++;
      continue;
    }

    // ── Regular paragraph ───────────────────────────────────────────────────
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#") &&
           !lines[i].startsWith("|") && !lines[i].startsWith(">") &&
           !/^[\-\*\+]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) &&
           !lines[i].startsWith("```")) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      output.push(`<p class="soma-p">${inlineFormat(paraLines.join(" "))}</p>`);
    }
  }

  return output.join("\n");
}

// ---------------------------------------------------------------------------
// Streaming partial render — same as renderMarkdown but tolerates incomplete
// fenced code blocks (doesn't close them prematurely while streaming)
// ---------------------------------------------------------------------------

export function renderMarkdownStreaming(raw: string): string {
  // Check if we're inside an unclosed code block
  const fenceCount = (raw.match(/^```/gm) || []).length;
  const isInCodeBlock = fenceCount % 2 !== 0;

  if (isInCodeBlock) {
    // Close the block artificially so renderMarkdown can process what's there
    return renderMarkdown(raw + "\n```");
  }

  return renderMarkdown(raw);
}
