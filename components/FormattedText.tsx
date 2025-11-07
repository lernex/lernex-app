"use client";
import React, { useMemo, memo } from "react";
import katex from "katex";
import {
  collapseMacroEscapes,
  normalizeLatexDelimiters,
  LATEX_TEXT_BRACED_MACROS,
  LATEX_TEXT_SYMBOL_MACROS,
  LATEX_TEXT_BARE_MACROS,
  LATEX_TEXT_SINGLE_LETTER_MACROS,
  MATH_TRIGGER_RE,
} from "@/lib/latex";

// Lightweight debug helpers
function devLog(...args: unknown[]) {
  try {
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      console.debug("[FormattedText]", ...args);
    }
  } catch {}
}

function devWarn(...args: unknown[]) {
  try {
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      console.warn("[FormattedText]", ...args);
    }
  } catch {}
}

// Precompiled regexes to reduce repeated work
// Bold patterns - improved to handle word boundaries and prevent false matches
const RE_BOLD_DOUBLE_ASTERISK = /\*\*(?=\S)((?:(?!\*\*).)+?)(?<=\S)\*\*/g;
const RE_BOLD_DOUBLE_UNDERSCORE = /__(?=\S)((?:(?!__).)+?)(?<=\S)__/g;
const RE_BOLD_SINGLE_ASTERISK = /(?<![*\w])\*(?=\S)((?:(?!\*).)+?)(?<=\S)\*(?![*\w])/g;
const RE_BOLD_SINGLE_UNDERSCORE = /(?<![\w_])_(?=\S)((?:(?!_).)+?)(?<=\S)_(?![\w_])/g;
const RE_DEL = /~~(?=\S)((?:(?!~~).)+?)(?<=\S)~~/g;
const RE_CODE = /`([^`]+)`/g;
const RE_CODE_BLOCK = /```[\s\S]*?```/g;
const RE_HEADER = /^(#{1,6})\s+(.+?)$/gm;
const RE_BEGIN_END = /\\begin\{([^}]+)\}[\s\S]*?\\end\{\1\}/g;
// Improved subscript: only match single letter or single digit followed by subscript (not multi-word variable names)
// Matches: x_i, x_1, T_max, E_k, but NOT: my_variable, test_case, some_function
const RE_SUBSCRIPT = /\b([A-Za-z])_(\{[^}]+\}|\d+|[A-Za-z]+)\b/g;
const RE_DOUBLE_BAR = /\|\|([^|]{1,80})\|\|/g;
// Angle brackets ⟨...⟩ and square root √(...) using literal UTF-8 characters
const RE_ANGLE = /⟨([^⟩]{1,80})⟩/g;
const RE_SQRT = /√\s*\(?([0-9A-Za-z+\-*/^\s,.]+?)\)?(?=(\s|[.,;:)\]]|$))/g;
// Improved superscript: match numbers or single letters with exponents, but avoid ordinals (1st, 2nd, 3rd)
// Matches: x^2, e^{-x}, 10^6, but NOT: 1st, 2nd, 3rd, 21st
const RE_SUPERSCRIPT = /\b([A-Za-z]|\d+)\^(\{[^}]+\}|[\d+\-*/A-Za-z]+)(?![a-z]{2})\b/g;
// Markdown list patterns
const RE_UNORDERED_LIST = /^[ \t]*[-*+]\s+(.+)$/gm;
const RE_ORDERED_LIST = /^[ \t]*(\d+)\.\s+(.+)$/gm;
// LaTeX table pattern - matches tabular environment
const RE_LATEX_TABLE = /\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g;
// Markdown table pattern - matches pipe-delimited tables with header separator
// Improved to handle empty cells, various spacing, and tables at end of text
const RE_MARKDOWN_TABLE = /^\|.*\|[ \t]*\r?\n\|[-:\s|]+\|[ \t]*\r?\n(?:\|.*\|[ \t]*(?:\r?\n|$))+/gm;

const SINGLE_DOLLAR_MAX_DISTANCE = 240;
const SYMBOL_MACRO_SET = new Set<string>(Array.from(LATEX_TEXT_SYMBOL_MACROS));
const BARE_MACRO_SET = new Set<string>(Array.from(LATEX_TEXT_BARE_MACROS));
const SINGLE_LETTER_MACRO_SET = new Set<string>(Array.from(LATEX_TEXT_SINGLE_LETTER_MACROS));
// Improved macro detection: only match when NOT preceded by alphanumeric (avoid matching in paths/URLs)
const RE_BACKSLASH_MACRO = /(?<![A-Za-z0-9])\\([A-Za-z]+)\b/g;
const RE_BARE_MACROS = /(^|[^\\])([A-Za-z]+)\b/g;
const RE_SINGLE_LETTER_ARG = /\\([A-Za-z]+)([A-Za-z])(?![A-Za-z])/g;

// Common programming/English words that could be mistaken for math macros
// When these appear as standalone words (not with \), don't auto-wrap them
const AMBIGUOUS_WORDS = new Set([
  "int", "float", "double", "char", "bool", "void", "string",
  "var", "let", "const", "function", "return", "if", "else",
  "for", "while", "switch", "case", "break", "continue",
  "class", "interface", "enum", "namespace", "public", "private",
  "print", "console", "array", "list", "map", "set"
]);

const BRACED_MACRO_ARG_COUNTS: Record<string, number> = Object.fromEntries(
  LATEX_TEXT_BRACED_MACROS.map((name) => [name, 1])
);
for (const name of ["frac", "binom"]) {
  BRACED_MACRO_ARG_COUNTS[name] = 2;
}

const MACROS_ALLOW_SINGLE_TOKEN = new Set<string>([
  "vec",
  "mathbf",
  "mathbb",
  "mathcal",
  "hat",
  "bar",
  "underline",
  "overline",
]);

const MACROS_WITH_OPTIONAL_BRACKET = new Set<string>(["sqrt"]);
const BRACED_MACRO_SET = new Set<string>(LATEX_TEXT_BRACED_MACROS);

// Utilities kept outside React so they aren't re-created every render
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

function normalizeBackslashes(src: string) {
  return normalizeLatexDelimiters(src);
}

function countPrecedingBackslashes(text: string, index: number) {
  let count = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (text[i] === "\\") count++;
    else break;
  }
  return count;
}

function isEscaped(text: string, index: number) {
  return (countPrecedingBackslashes(text, index) % 2) === 1;
}

function skipWhitespace(text: string, index: number) {
  let i = index;
  while (i < text.length) {
    const ch = text[i];
    if (ch === undefined || !/\s/.test(ch)) break;
    i++;
  }
  return i;
}

function consumeBraceGroup(text: string, start: number): number | null {
  if (text[start] !== "{") return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" && !isEscaped(text, i)) depth++;
    else if (ch === "}" && !isEscaped(text, i)) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

function consumeBracketGroup(text: string, start: number): number | null {
  if (text[start] !== "[") return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "[" && !isEscaped(text, i)) depth++;
    else if (ch === "]" && !isEscaped(text, i)) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

function readMacroName(text: string, start: number): { name: string; end: number } | null {
  let end = start;
  while (end < text.length && /[A-Za-z]/.test(text[end]!)) end++;
  if (end === start) return null;
  return { name: text.slice(start, end), end };
}

function consumeMacro(text: string, start: number, macroName: string): number | null {
  if (!BRACED_MACRO_SET.has(macroName)) return null;
  let cursor = skipWhitespace(text, start + 1 + macroName.length);
  if (MACROS_WITH_OPTIONAL_BRACKET.has(macroName)) {
    if (text[cursor] === "[") {
      const optionalEnd = consumeBracketGroup(text, cursor);
      if (optionalEnd == null) return null;
      cursor = skipWhitespace(text, optionalEnd);
    }
  }
  let consumed = 0;
  const requiredArgs = BRACED_MACRO_ARG_COUNTS[macroName] ?? 0;
  while (consumed < requiredArgs) {
    cursor = skipWhitespace(text, cursor);
    if (cursor >= text.length) return null;
    if (text[cursor] === "{") {
      const groupEnd = consumeBraceGroup(text, cursor);
      if (groupEnd == null) return null;
      cursor = groupEnd;
    } else if (MACROS_ALLOW_SINGLE_TOKEN.has(macroName)) {
      if (cursor >= text.length) return null;
      cursor += 1;
    } else {
      return null;
    }
    consumed++;
  }
  return cursor;
}

function findPrevNonWhitespace(text: string, index: number) {
  for (let i = index; i >= 0; i--) {
    const ch = text[i];
    if (ch == null) break;
    if (!/\s/.test(ch)) return ch;
  }
  return null;
}

function findNextNonWhitespace(text: string, index: number) {
  for (let i = index; i < text.length; i++) {
    const ch = text[i];
    if (!/\s/.test(ch)) return ch;
  }
  return null;
}

function isLikelyDisplayDelimiter(text: string, index: number) {
  const immediateNext = text[index + 2] ?? "";
  if (/[0-9]/.test(immediateNext)) return false;
  const prev = findPrevNonWhitespace(text, index - 1);
  if (prev === "$") return false;
  const next = findNextNonWhitespace(text, index + 2);
  if (prev && /[0-9]/.test(prev) && next && /[0-9]/.test(next)) return false;
  return true;
}

function isLikelyCurrency(text: string, index: number) {
  const nextChar = text[index + 1] ?? "";
  return /[0-9]/.test(nextChar);
}

function findClosingSingleDollar(text: string, start: number, maxDistance = SINGLE_DOLLAR_MAX_DISTANCE) {
  const limit = Math.min(text.length, start + maxDistance);
  for (let i = start; i < limit; i++) {
    if (text[i] !== '$') continue;
    if (text[i + 1] === '$') { i++; continue; }
    if (isEscaped(text, i)) continue;
    return i;
  }
  return -1;
}

function wrapBracedMacros(src: string, wrap: (tex: string) => string) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      const macro = readMacroName(src, i + 1);
      if (macro) {
        if (BRACED_MACRO_SET.has(macro.name)) {
          const end = consumeMacro(src, i, macro.name);
          if (end != null) {
            out += wrap(src.slice(i, end));
            i = end;
            continue;
          }
        }
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

function balanceDelimiters(src: string) {
  const stack: ("\\(" | "\\[")[] = [];
  let unmatchedDisplay = 0;
  const origLen = src.length;
  for (let i = 0; i < src.length;) {
    if (src.startsWith("\\(", i) && !isEscaped(src, i)) {
      stack.push("\\(");
      i += 2;
      continue;
    }
    if (src.startsWith("\\[", i) && !isEscaped(src, i)) {
      stack.push("\\[");
      i += 2;
      continue;
    }
    if (src.startsWith("\\)", i) && !isEscaped(src, i)) {
      if (stack[stack.length - 1] === "\\(") stack.pop();
      i += 2;
      continue;
    }
    if (src.startsWith("\\]", i) && !isEscaped(src, i)) {
      if (stack[stack.length - 1] === "\\[") stack.pop();
      i += 2;
      continue;
    }
    if (src.startsWith("$$", i) && !isEscaped(src, i)) {
      if (unmatchedDisplay > 0) {
        // treat as closing when we already have an open block
        if (isLikelyDisplayDelimiter(src, i)) {
          unmatchedDisplay = Math.max(0, unmatchedDisplay - 1);
        }
      } else if (isLikelyDisplayDelimiter(src, i)) {
        unmatchedDisplay++;
      }
      i += 2;
      continue;
    }
    i += 1;
  }
  let appended = 0;
  while (stack.length) {
    src += stack.pop() === "\\(" ? "\\)" : "\\]";
    appended++;
  }
  if (unmatchedDisplay > 0) {
    src += "$$".repeat(unmatchedDisplay);
    appended += unmatchedDisplay;
  }
  if (appended > 0) {
    devWarn("auto-balanced-delimiters", { appended, origLen, newLen: src.length });
  }
  return src;
}

type Seg = { math: boolean; t: string; displayMode?: boolean };
function splitMathSegments(src: string): Seg[] {
  const segs: Seg[] = [];
  let i = 0;
  let start = 0;
  let inMath = false;
  let opener: "\\(" | "\\[" | "$$" | "$" | null = null;
  const commit = (end: number) => {
    if (end > start) {
      const isDisplay = opener === "\\[" || opener === "$$";
      segs.push({ math: inMath, t: src.slice(start, end), displayMode: isDisplay });
    }
    start = end;
  };
  while (i < src.length) {
    if (!inMath) {
      if (src.startsWith("\\(", i) && !isEscaped(src, i)) {
        commit(i);
        opener = "\\(";
        inMath = true;
        i += 2;
      } else if (src.startsWith("\\[", i) && !isEscaped(src, i)) {
        commit(i);
        opener = "\\[";
        inMath = true;
        i += 2;
      } else if (src.startsWith("$$", i) && !isEscaped(src, i) && isLikelyDisplayDelimiter(src, i)) {
        commit(i);
        opener = "$$";
        inMath = true;
        i += 2;
      } else if (src[i] === '$') {
        if (!isEscaped(src, i) && src[i + 1] !== '$' && !isLikelyCurrency(src, i)) {
          const closing = findClosingSingleDollar(src, i + 1);
          if (closing !== -1) {
            commit(i);
            opener = '$';
            inMath = true;
            i += 1;
            continue;
          }
        }
        i += 1;
      } else {
        i += 1;
      }
    } else {
      const close = opener === "\\(" ? "\\)" : opener === "\\[" ? "\\]" : opener === "$$" ? "$$" : "$";
      if (close === "$$") {
        if (src.startsWith("$$", i) && !isEscaped(src, i) && isLikelyDisplayDelimiter(src, i)) {
          i += 2;
          commit(i);
          inMath = false;
          opener = null;
        } else {
          i += 1;
        }
      } else if (close === "$") {
        if (src[i] === '$' && !isEscaped(src, i)) {
          i += 1;
          commit(i);
          inMath = false;
          opener = null;
        } else {
          i += 1;
        }
      } else if (src.startsWith(close, i) && !isEscaped(src, i)) {
        i += close.length;
        commit(i);
        inMath = false;
        opener = null;
      } else {
        i += 1;
      }
    }
  }
  commit(src.length);
  return segs;
}

function parseLatexTable(match: string, content: string): string {
  // Extract column spec from \begin{tabular}{...}
  const colSpecMatch = match.match(/\\begin\{tabular\}\{([^}]*)\}/);
  const colSpec = colSpecMatch?.[1] || '';

  // Parse alignment from column spec (l=left, c=center, r=right)
  const alignments = colSpec.split('').filter(c => ['l', 'c', 'r'].includes(c)).map(c => {
    if (c === 'c') return 'center';
    if (c === 'r') return 'right';
    return 'left';
  });

  // Split into rows by \\ (but not \\\\ which might be escaped)
  const rows = content.split('\\\\').map(r => r.trim()).filter(r => r && r !== '\\hline');

  if (rows.length === 0) return match; // Return original if parsing fails

  // Helper to process cell content (wrap in math mode for LaTeX rendering)
  const processCell = (cell: string): string => {
    const trimmed = cell.trim();

    if (!trimmed) return ''; // Handle empty cells

    // Check if cell contains ANY math delimiters (not just fully wrapped)
    // This handles mixed content like "slope \(m\), intercept \(b\)"
    const hasMathDelimiters =
      trimmed.includes('\\(') || trimmed.includes('\\)') ||
      trimmed.includes('\\[') || trimmed.includes('\\]') ||
      trimmed.includes('$$') ||
      /(?<!\$)\$(?!\$)/.test(trimmed); // single $ but not $$

    if (hasMathDelimiters) {
      // Already has math delimiters - render math inline with KaTeX
      return renderMathInText(trimmed);
    }

    // If cell contains LaTeX commands or symbols but no delimiters, wrap it
    if (trimmed.includes('\\') || /[\^_{}]/.test(trimmed)) {
      try {
        return katex.renderToString(trimmed, { displayMode: false, throwOnError: false });
      } catch {
        return escapeHtml(trimmed);
      }
    }

    // Plain text - escape HTML for safety
    return escapeHtml(trimmed);
  };

  // Build HTML table
  let html = '<table class="latex-table">';

  // First row is typically the header (after first \hline if present)
  const hasHeader = rows.length > 1;
  const headerRow = hasHeader ? rows[0]!.replace(/\\hline/g, '').split('&').map(c => c.trim()) : [];
  const dataRows = hasHeader ? rows.slice(1) : rows;

  // Build header if present
  if (hasHeader && headerRow.length > 0) {
    html += '<thead><tr>';
    headerRow.forEach((cell, i) => {
      const align = alignments[i] || 'left';
      html += `<th style="text-align:${align}">${processCell(cell)}</th>`;
    });
    html += '</tr></thead>';
  }

  // Build body
  html += '<tbody>';
  dataRows.forEach(row => {
    const cells = row.replace(/\\hline/g, '').split('&').map(c => c.trim());
    if (cells.length > 0 && cells[0]) {
      html += '<tr>';
      cells.forEach((cell, i) => {
        const align = alignments[i] || 'left';
        html += `<td style="text-align:${align}">${processCell(cell)}</td>`;
      });
      html += '</tr>';
    }
  });
  html += '</tbody></table>';

  return html;
}

// Helper to split table row by pipes while respecting math delimiters
function splitTableRow(row: string): string[] {
  const cells: string[] = [];
  let currentCell = '';
  let inMath = false;
  let mathDelimiter: string | null = null;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    const next = row[i + 1];
    const prev = row[i - 1];

    // Check for math delimiter starts
    if (!inMath) {
      if (char === '\\' && next === '(') {
        inMath = true;
        mathDelimiter = '\\(';
        currentCell += char + next;
        i++; // Skip next char
        continue;
      }
      if (char === '\\' && next === '[') {
        inMath = true;
        mathDelimiter = '\\[';
        currentCell += char + next;
        i++; // Skip next char
        continue;
      }
      if (char === '$' && next === '$') {
        inMath = true;
        mathDelimiter = '$$';
        currentCell += char + next;
        i++; // Skip next char
        continue;
      }
      if (char === '$' && next !== '$' && prev !== '$') {
        inMath = true;
        mathDelimiter = '$';
        currentCell += char;
        continue;
      }
    } else {
      // Check for math delimiter ends
      if (mathDelimiter === '\\(' && char === '\\' && next === ')') {
        inMath = false;
        mathDelimiter = null;
        currentCell += char + next;
        i++; // Skip next char
        continue;
      }
      if (mathDelimiter === '\\[' && char === '\\' && next === ']') {
        inMath = false;
        mathDelimiter = null;
        currentCell += char + next;
        i++; // Skip next char
        continue;
      }
      if (mathDelimiter === '$$' && char === '$' && next === '$') {
        inMath = false;
        mathDelimiter = null;
        currentCell += char + next;
        i++; // Skip next char
        continue;
      }
      if (mathDelimiter === '$' && char === '$' && prev !== '$' && next !== '$') {
        inMath = false;
        mathDelimiter = null;
        currentCell += char;
        continue;
      }
    }

    // Split on pipe only if not in math
    if (char === '|' && !inMath) {
      cells.push(currentCell);
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  // Add the last cell
  if (currentCell || cells.length > 0) {
    cells.push(currentCell);
  }

  return cells.map(c => c.trim()).filter((c, i, arr) => {
    // Remove empty cells at start/end (from leading/trailing pipes)
    // but keep empty cells in the middle
    if (i === 0 && !c) return false;
    if (i === arr.length - 1 && !c) return false;
    return true;
  });
}

function parseMarkdownTable(match: string): string {
  const lines = match.trim().split('\n').map(l => l.trim());
  if (lines.length < 3) return match; // Need at least header, separator, and one data row

  // Parse header row using smart split
  const headerCells = splitTableRow(lines[0]!);

  // Parse alignment from separator row using smart split
  const separatorCells = splitTableRow(lines[1]!);
  const alignments = separatorCells.map(cell => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });

  // Helper to process cell content (wrap in math mode for LaTeX rendering if needed)
  const processCell = (cell: string): string => {
    const trimmed = cell.trim();

    if (!trimmed) return ''; // Handle empty cells

    // Check if cell contains ANY math delimiters (not just fully wrapped)
    // This handles mixed content like "slope \(m\), intercept \(b\)"
    const hasMathDelimiters =
      trimmed.includes('\\(') || trimmed.includes('\\)') ||
      trimmed.includes('\\[') || trimmed.includes('\\]') ||
      trimmed.includes('$$') ||
      /(?<!\$)\$(?!\$)/.test(trimmed); // single $ but not $$

    if (hasMathDelimiters) {
      // Already has math delimiters - render math inline with KaTeX
      return renderMathInText(trimmed);
    }

    // If cell contains LaTeX commands or symbols but no delimiters, wrap it
    if (trimmed.includes('\\') || /[\^_{}]/.test(trimmed)) {
      try {
        return katex.renderToString(trimmed, { displayMode: false, throwOnError: false });
      } catch {
        return escapeHtml(trimmed);
      }
    }

    // Plain text - escape HTML for safety
    return escapeHtml(trimmed);
  };

  // Build HTML table with AP/College Board styling
  let html = '<table class="markdown-table ap-table">';

  // Build header
  html += '<thead><tr>';
  headerCells.forEach((cell, i) => {
    const align = alignments[i] || 'left';
    html += `<th style="text-align:${align}">${processCell(cell)}</th>`;
  });
  html += '</tr></thead>';

  // Build body rows
  html += '<tbody>';
  const expectedColumnCount = headerCells.length;
  for (let i = 2; i < lines.length; i++) {
    const row = lines[i]!;
    if (!row) continue;
    let cells = splitTableRow(row);

    // Handle inconsistent column counts
    if (cells.length < expectedColumnCount) {
      // Pad with empty cells
      while (cells.length < expectedColumnCount) {
        cells.push('');
      }
    } else if (cells.length > expectedColumnCount) {
      // Truncate extra cells
      cells = cells.slice(0, expectedColumnCount);
    }

    if (cells.length > 0) {
      html += '<tr>';
      cells.forEach((cell, j) => {
        const align = alignments[j] || 'left';
        html += `<td style="text-align:${align}">${processCell(cell)}</td>`;
      });
      html += '</tr>';
    }
  }
  html += '</tbody></table>';

  return html;
}

// Helper function to render math expressions within text
function renderMathInText(text: string): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    // Check for display math $$...$$
    if (text.startsWith('$$', i) && !isEscaped(text, i)) {
      const closeIdx = text.indexOf('$$', i + 2);
      if (closeIdx !== -1) {
        const mathContent = text.slice(i + 2, closeIdx);
        try {
          result += katex.renderToString(mathContent, { displayMode: true, throwOnError: false });
        } catch {
          result += escapeHtml(text.slice(i, closeIdx + 2));
        }
        i = closeIdx + 2;
        continue;
      }
    }

    // Check for display math \[...\]
    if (text.startsWith('\\[', i) && !isEscaped(text, i)) {
      const closeIdx = text.indexOf('\\]', i + 2);
      if (closeIdx !== -1) {
        const mathContent = text.slice(i + 2, closeIdx);
        try {
          result += katex.renderToString(mathContent, { displayMode: true, throwOnError: false });
        } catch {
          result += escapeHtml(text.slice(i, closeIdx + 2));
        }
        i = closeIdx + 2;
        continue;
      }
    }

    // Check for inline math \(...\)
    if (text.startsWith('\\(', i) && !isEscaped(text, i)) {
      const closeIdx = text.indexOf('\\)', i + 2);
      if (closeIdx !== -1) {
        const mathContent = text.slice(i + 2, closeIdx);
        try {
          result += katex.renderToString(mathContent, { displayMode: false, throwOnError: false });
        } catch {
          result += escapeHtml(text.slice(i, closeIdx + 2));
        }
        i = closeIdx + 2;
        continue;
      }
    }

    // Check for inline math $...$
    if (text[i] === '$' && !isEscaped(text, i) && text[i + 1] !== '$') {
      const closeIdx = findClosingSingleDollar(text, i + 1);
      if (closeIdx !== -1) {
        const mathContent = text.slice(i + 1, closeIdx);
        try {
          result += katex.renderToString(mathContent, { displayMode: false, throwOnError: false });
        } catch {
          result += escapeHtml(text.slice(i, closeIdx + 1));
        }
        i = closeIdx + 1;
        continue;
      }
    }

    result += text[i];
    i++;
  }

  return result;
}

function formatNonMath(s: string, existingReplacements?: Map<string, string>, placeholderCounter?: { value: number }) {
  const wrap = (tex: string) => {
    try {
      return katex.renderToString(tex, { displayMode: false, throwOnError: false });
    } catch {
      return escapeHtml(tex);
    }
  };

  const replacements = existingReplacements || new Map<string, string>();
  const counter = placeholderCounter || { value: 0 };

  // First, protect markdown tables from all processing (skip if already extracted)
  const withMarkdownTablePlaceholders = existingReplacements
    ? s
    : s.replace(RE_MARKDOWN_TABLE, (match) => {
        const key = `\u{FFFC}PLACEHOLDER${counter.value++}\u{FFFC}`;
        replacements.set(key, parseMarkdownTable(match));
        return key;
      });

  // Second, protect LaTeX tables from all processing (skip if already extracted)
  const withTablePlaceholders = existingReplacements
    ? withMarkdownTablePlaceholders
    : withMarkdownTablePlaceholders.replace(RE_LATEX_TABLE, (match, content) => {
        const key = `\u{FFFC}PLACEHOLDER${counter.value++}\u{FFFC}`;
        replacements.set(key, parseLatexTable(match, content));
        return key;
      });

  // Then protect code blocks from all processing
  const withCodeBlockPlaceholders = withTablePlaceholders.replace(RE_CODE_BLOCK, (match) => {
    const key = `\u{FFFC}PLACEHOLDER${counter.value++}\u{FFFC}`;
    replacements.set(key, `<pre><code>${escapeHtml(match.slice(3, -3))}</code></pre>`);
    return key;
  });

  // Then protect inline code spans
  const withPlaceholders = withCodeBlockPlaceholders.replace(RE_CODE, (_match, inner: string) => {
    const key = `\u{FFFC}PLACEHOLDER${counter.value++}\u{FFFC}`;
    replacements.set(key, `<code>${escapeHtml(inner)}</code>`);
    return key;
  });

  // Escape HTML in the remaining text
  let out = escapeHtml(withPlaceholders);

  // Process markdown headers first (before bold/italic to handle nested formatting like "### **Bold Header**")
  out = out.replace(RE_HEADER, (_match, hashes: string, content: string) => {
    const level = Math.min(6, hashes.length); // Cap at h6
    const tag = `h${level}`;
    // Process inline formatting within headers
    let headerContent = content;
    headerContent = headerContent.replace(RE_BOLD_DOUBLE_ASTERISK, "<strong>$1</strong>");
    headerContent = headerContent.replace(RE_BOLD_DOUBLE_UNDERSCORE, "<strong>$1</strong>");
    headerContent = headerContent.replace(RE_BOLD_SINGLE_ASTERISK, "<strong>$1</strong>");
    headerContent = headerContent.replace(RE_BOLD_SINGLE_UNDERSCORE, "<em>$1</em>");
    return `<${tag}>${headerContent}</${tag}>`;
  });

  // Process markdown formatting in order: bold (double first), then single asterisk/underscore
  // Double asterisk bold (higher priority)
  out = out.replace(RE_BOLD_DOUBLE_ASTERISK, "<strong>$1</strong>");
  // Double underscore bold (higher priority)
  out = out.replace(RE_BOLD_DOUBLE_UNDERSCORE, "<strong>$1</strong>");
  // Single asterisk bold (standard markdown uses this for italic, but treating as bold for consistency)
  out = out.replace(RE_BOLD_SINGLE_ASTERISK, "<strong>$1</strong>");
  // Single underscore for emphasis/italic
  out = out.replace(RE_BOLD_SINGLE_UNDERSCORE, "<em>$1</em>");
  // Strikethrough
  out = out.replace(RE_DEL, "<del>$1</del>");

  // Process markdown lists before applying LaTeX wrapping
  // Unordered lists
  out = out.replace(RE_UNORDERED_LIST, (_match, content: string) => {
    return `<li>${content.trim()}</li>`;
  });
  // Ordered lists
  out = out.replace(RE_ORDERED_LIST, (_match, _num: string, content: string) => {
    return `<li>${content.trim()}</li>`;
  });
  // Wrap consecutive <li> tags in proper list containers
  out = out.replace(/(<li>[\s\S]+?<\/li>)(?:\n|$)/g, (match) => {
    // Check if this block of <li>s is already wrapped
    if (!match.includes('<ul>') && !match.includes('<ol>')) {
      // Simple heuristic: if the first item in the source had a number, use <ol>
      return `<ul>${match}</ul>`;
    }
    return match;
  });

  // Conservatively wrap common TeX fragments that appear in plain text
  out = out.replace(RE_BEGIN_END, (m) => wrap(m));
  out = wrapBracedMacros(out, wrap);

  // Wrap backslash macros, but with context awareness
  out = out.replace(RE_BACKSLASH_MACRO, (match, name: string, offset: number) => {
    if (!SYMBOL_MACRO_SET.has(name)) return match;

    // Check if this appears in a programming-like context
    // Look at surrounding text for clues
    const before = out.slice(Math.max(0, offset - 20), offset);
    const after = out.slice(offset + match.length, Math.min(out.length, offset + match.length + 20));

    // Don't wrap if surrounded by parentheses and commas (function call pattern)
    if (/[,(]\s*$/.test(before) && /^\s*[,)]/.test(after)) {
      return match;
    }

    // Don't wrap if followed by opening parenthesis without space (function call)
    if (/^\s*\(/.test(after) && AMBIGUOUS_WORDS.has(name)) {
      return match;
    }

    return wrap(match);
  });

  // Improved subscript matching - check context to avoid variable names
  out = out.replace(RE_SUBSCRIPT, (match, base: string, subscript: string, offset: number) => {
    // Get surrounding context
    const before = out.slice(Math.max(0, offset - 3), offset);
    const after = out.slice(offset + match.length, offset + match.length + 3);

    // Skip if preceded by letter or underscore (part of longer variable name)
    // This prevents matching "y_v" within "my_variable"
    if (/[a-z_]/i.test(before.slice(-1))) return match;

    // Skip if followed by underscore or letter (middle of variable name)
    if (/^[a-z_]/i.test(after)) return match;

    // Skip if subscript is a common programming word (like max, min, etc.)
    if (AMBIGUOUS_WORDS.has(subscript.toLowerCase())) return match;

    // Skip if the base letter is uppercase and subscript is lowercase multi-letter
    // (likely acronym like API_key rather than math like T_max)
    if (base === base.toUpperCase() && subscript.length > 1 && subscript === subscript.toLowerCase()) {
      return match;
    }

    return wrap(`${base}_${subscript}`);
  });

  // Improved superscript matching - avoid ordinals and programming contexts
  out = out.replace(RE_SUPERSCRIPT, (match, base: string, exponent: string, offset: number) => {
    // Get surrounding context
    const before = out.slice(Math.max(0, offset - 2), offset);
    const after = out.slice(offset + match.length, offset + match.length + 3);

    // Skip ordinals: 1st, 2nd, 3rd, 21st, etc.
    if (/\d+$/.test(base) && /^(st|nd|rd|th)/.test(after)) {
      return match;
    }

    // Skip XOR operator in programming (e.g., a^b in some languages)
    // If surrounded by spaces or operators, likely programming
    if (/[\s=+\-*/(]$/.test(before) && /^[\s=+\-*/);\]]/.test(after)) {
      return match;
    }

    return wrap(`${base}^${exponent}`);
  });
  out = out.replace(RE_DOUBLE_BAR, (_m, inner) => wrap(`\\| ${inner.trim()} \\|`));
  out = out.replace(RE_ANGLE, (_m, inner) => wrap(`\\langle ${inner.trim()} \\rangle`));
  out = out.replace(RE_SQRT, (_m, inner) => wrap(`\\sqrt{${inner.trim()}}`));

  // Restore all placeholders in one pass
  for (const [key, value] of replacements) {
    out = out.replace(key, value);
  }
  return out;
}

function fixMacrosInMath(s: string) {
  // Collapse accidental double-backslashes before common macros (not row breaks)
  s = collapseMacroEscapes(s);
  // If a macro name appears without a backslash in math (rare), add one
  s = s.replace(RE_BARE_MACROS, (match, prefix: string, macro: string) =>
    BARE_MACRO_SET.has(macro) ? `${prefix}\\${macro}` : match
  );
  // Normalize one-letter macro arguments like \mathbfv -> \mathbf{v}
  s = s.replace(RE_SINGLE_LETTER_ARG, (match, macro: string, letter: string) =>
    SINGLE_LETTER_MACRO_SET.has(macro) ? `\\${macro}{${letter}}` : match
  );
  return s;
}

type FormattedTextProps = {
  text: string;
  className?: string;
  as?: React.ElementType;
};

function FormattedText({
  text,
  className,
  as = 'span',
}: FormattedTextProps) {
  // Compute the HTML once per `text` value.
  const html = useMemo(() => {
    let src = text ?? "";
    src = normalizeBackslashes(src);
    devLog("html-build", { len: src.length, preview: src.slice(0, 60) });
    src = balanceDelimiters(src);

    // IMPORTANT: Extract tables BEFORE splitting math segments to prevent
    // LaTeX delimiters inside table cells from breaking the table structure
    const tableReplacements = new Map<string, string>();
    const placeholderCounter = { value: 0 }; // Use object for mutable reference

    // Extract markdown tables
    src = src.replace(RE_MARKDOWN_TABLE, (match) => {
      const key = `\u{FFFC}PLACEHOLDER${placeholderCounter.value++}\u{FFFC}`;
      tableReplacements.set(key, parseMarkdownTable(match));
      return key;
    });

    // Extract LaTeX tables
    src = src.replace(RE_LATEX_TABLE, (match, content) => {
      const key = `\u{FFFC}PLACEHOLDER${placeholderCounter.value++}\u{FFFC}`;
      tableReplacements.set(key, parseLatexTable(match, content));
      return key;
    });

    // Now split math segments (tables are protected as placeholders)
    const segs = splitMathSegments(src);
    const out = segs.map(({ math, t, displayMode }) => {
      if (math) {
        // Extract just the math content (remove delimiters)
        let mathContent = t;
        if (t.startsWith('\\(') && t.endsWith('\\)')) {
          mathContent = t.slice(2, -2);
        } else if (t.startsWith('\\[') && t.endsWith('\\]')) {
          mathContent = t.slice(2, -2);
        } else if (t.startsWith('$$') && t.endsWith('$$')) {
          mathContent = t.slice(2, -2);
        } else if (t.startsWith('$') && t.endsWith('$')) {
          mathContent = t.slice(1, -1);
        }

        mathContent = fixMacrosInMath(mathContent);

        try {
          return katex.renderToString(mathContent, {
            displayMode: displayMode ?? false,
            throwOnError: false,
            strict: false
          });
        } catch (e) {
          devWarn("katex-error", e);
          return escapeHtml(t);
        }
      } else {
        return formatNonMath(t, tableReplacements, placeholderCounter);
      }
    }).join("");
    devLog("html-ready", { len: out.length });
    return out;
  }, [text]);

  const Tag: React.ElementType = as;
  return (
    <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export default memo(FormattedText);
