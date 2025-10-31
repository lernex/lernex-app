"use client";
import React, { useEffect, useMemo, useRef, memo } from "react";
import {
  collapseMacroEscapes,
  normalizeLatexDelimiters,
  LATEX_TEXT_BRACED_MACROS,
  LATEX_TEXT_SYMBOL_MACROS,
  LATEX_TEXT_BARE_MACROS,
  LATEX_TEXT_SINGLE_LETTER_MACROS,
  MATH_TRIGGER_RE,
} from "@/lib/latex";

interface MathJaxWithConfig {
  typesetPromise?: (elements?: unknown[]) => Promise<void>;
  typesetClear?: (elements?: unknown[]) => void;
  startup?: { promise?: Promise<void> };
  tex?: {
    inlineMath?: [string, string][];
    displayMath?: [string, string][];
    processEscapes?: boolean;
  };
  options?: {
    skipHtmlTags?: string[];
    renderActions?: Record<string, unknown>;
  };
}

declare global {
  interface Window {
    MathJax?: MathJaxWithConfig;
  }
}

// Render text that may contain LaTeX using MathJax for full compatibility.
// We load MathJax only once and ensure configuration is in place before the
// script executes. Subsequent calls simply wait for the original promise.
let mathJaxPromise: Promise<void> | null = null;

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
const RE_SUBSCRIPT = /([A-Za-z]+)_(\{[^}]+\}|\d+|[A-Za-z])/g;
const RE_DOUBLE_BAR = /\|\|([^|]{1,80})\|\|/g;
// Angle brackets ⟨...⟩ and square root √(...) using literal UTF-8 characters
const RE_ANGLE = /⟨([^⟩]{1,80})⟩/g;
const RE_SQRT = /√\s*\(?([0-9A-Za-z+\-*/^\s,.]+?)\)?(?=(\s|[.,;:)\]]|$))/g;
// Superscript patterns - match ^{...} or ^single_char but not in TeX blocks
const RE_SUPERSCRIPT = /([A-Za-z0-9]+)\^(\{[^}]+\}|[A-Za-z0-9])/g;
// Markdown list patterns
const RE_UNORDERED_LIST = /^[ \t]*[-*+]\s+(.+)$/gm;
const RE_ORDERED_LIST = /^[ \t]*(\d+)\.\s+(.+)$/gm;
// LaTeX table pattern - matches tabular environment
const RE_LATEX_TABLE = /\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g;
// Markdown table pattern - matches pipe-delimited tables with header separator
const RE_MARKDOWN_TABLE = /^\|.+\|[ \t]*\n\|[-:\s|]+\|[ \t]*\n(?:\|.+\|[ \t]*\n?)+/gm;

const SINGLE_DOLLAR_MAX_DISTANCE = 240;
const SYMBOL_MACRO_SET = new Set<string>(Array.from(LATEX_TEXT_SYMBOL_MACROS));
const BARE_MACRO_SET = new Set<string>(Array.from(LATEX_TEXT_BARE_MACROS));
const SINGLE_LETTER_MACRO_SET = new Set<string>(Array.from(LATEX_TEXT_SINGLE_LETTER_MACROS));
const RE_BACKSLASH_MACRO = /\\([A-Za-z]+)/g;
const RE_BARE_MACROS = /(^|[^\\])([A-Za-z]+)\b/g;
const RE_SINGLE_LETTER_ARG = /\\([A-Za-z]+)([A-Za-z])(?![A-Za-z])/g;

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

type MathBoundaryState = {
  inlineDepth: number;
  displayDepth: number;
  singleOpen: boolean;
};

function scanMathState(text: string, startIndex: number, state: MathBoundaryState, markOutsideClose: () => void) {
  for (let i = startIndex; i < text.length;) {
    if (text.startsWith("\\(", i) && !isEscaped(text, i)) {
      state.inlineDepth += 1;
      i += 2;
      continue;
    }
    if (text.startsWith("\\[", i) && !isEscaped(text, i)) {
      state.displayDepth += 1;  // Fixed: was incorrectly incrementing inlineDepth
      i += 2;
      continue;
    }
    if (text.startsWith("\\)", i) && !isEscaped(text, i)) {
      if (state.inlineDepth > 0) {
        state.inlineDepth -= 1;
        if (state.inlineDepth === 0 && state.displayDepth === 0 && !state.singleOpen) markOutsideClose();
      }
      i += 2;
      continue;
    }
    if (text.startsWith("\\]", i) && !isEscaped(text, i)) {
      if (state.displayDepth > 0) {  // Fixed: check displayDepth, not inlineDepth
        state.displayDepth -= 1;  // Fixed: decrement displayDepth, not inlineDepth
        if (state.inlineDepth === 0 && state.displayDepth === 0 && !state.singleOpen) markOutsideClose();
      }
      i += 2;
      continue;
    }
    if (text.startsWith("$$", i) && !isEscaped(text, i)) {
      if (state.displayDepth > 0) {
        if (isLikelyDisplayDelimiter(text, i)) {
          state.displayDepth = Math.max(0, state.displayDepth - 1);
          if (state.inlineDepth === 0 && state.displayDepth === 0 && !state.singleOpen) markOutsideClose();
        }
      } else if (isLikelyDisplayDelimiter(text, i)) {
        state.displayDepth += 1;
      }
      i += 2;
      continue;
    }
    if (text[i] === '$' && !isEscaped(text, i) && text[i + 1] !== '$') {
      if (state.singleOpen) {
        state.singleOpen = false;
        if (state.inlineDepth === 0 && state.displayDepth === 0) markOutsideClose();
        i += 1;
        continue;
      }
      if (!isLikelyCurrency(text, i)) {
        const closing = findClosingSingleDollar(text, i + 1);
        if (closing !== -1 && closing > i) {
          state.singleOpen = true;
          i += 1;
          continue;
        }
      }
    }
    i += 1;
  }
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

type Seg = { math: boolean; t: string };
function splitMathSegments(src: string): Seg[] {
  const segs: Seg[] = [];
  let i = 0;
  let start = 0;
  let inMath = false;
  let opener: "\\(" | "\\[" | "$$" | "$" | null = null;
  const commit = (end: number) => { if (end > start) segs.push({ math: inMath, t: src.slice(start, end) }); start = end; };
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
    // Check if already wrapped in math delimiters
    const hasDelimiters =
      (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) ||
      (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) ||
      (trimmed.startsWith('$$') && trimmed.endsWith('$$')) ||
      (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 2);

    if (hasDelimiters) {
      // Already has math delimiters, just escape HTML entities but preserve the math
      return escapeHtml(trimmed);
    }

    // If cell contains LaTeX commands or symbols, wrap for MathJax
    if (trimmed.includes('\\') || /[\^_{}]/.test(trimmed)) {
      return `\\(${escapeHtml(trimmed)}\\)`;
    }
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

function parseMarkdownTable(match: string): string {
  const lines = match.trim().split('\n').map(l => l.trim());
  if (lines.length < 3) return match; // Need at least header, separator, and one data row

  // Parse header row
  const headerCells = lines[0]!.split('|').map(c => c.trim()).filter(c => c);

  // Parse alignment from separator row
  const separatorCells = lines[1]!.split('|').map(c => c.trim()).filter(c => c);
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
    // Check if already wrapped in math delimiters
    const hasDelimiters =
      (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) ||
      (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) ||
      (trimmed.startsWith('$$') && trimmed.endsWith('$$')) ||
      (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 2);

    if (hasDelimiters) {
      // Already has math delimiters, just escape HTML entities but preserve the math
      return escapeHtml(trimmed);
    }

    // If cell contains LaTeX commands or symbols, wrap for MathJax
    if (trimmed.includes('\\') || /[\^_{}]/.test(trimmed)) {
      return `\\(${escapeHtml(trimmed)}\\)`;
    }
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
  for (let i = 2; i < lines.length; i++) {
    const row = lines[i]!;
    if (!row) continue;
    const cells = row.split('|').map(c => c.trim()).filter(c => c);
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

function formatNonMath(s: string, existingReplacements?: Map<string, string>, placeholderCounter?: { value: number }) {
  const wrap = (tex: string) => `\\(${tex}\\)`;
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
  out = out.replace(RE_BACKSLASH_MACRO, (match, name: string) =>
    SYMBOL_MACRO_SET.has(name) ? wrap(match) : match
  );
  out = out.replace(RE_SUBSCRIPT, (_m, a, b) => wrap(`${a}_${b}`));
  out = out.replace(RE_SUPERSCRIPT, (_m, a, b) => wrap(`${a}^${b}`));
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

// Typeset helper reused by both effects. Returns a cancel function.
function scheduleTypeset(el: HTMLElement, opts?: { delayMs?: number; rafs?: 0 | 1 | 2; srcOverride?: string }) {
  devLog("typeset-schedule");
  let cancelled = false;
  const handles: { raf?: number; raf2?: number; timeout?: number } = {};
  const delayMs = Math.max(0, opts?.delayMs ?? 24);
  const rafs: 0 | 1 | 2 = opts?.rafs ?? 1;

  const runTypeset = () => {
    if (cancelled) return;
    if (!el || !el.isConnected) return;
    devLog("typeset-run");
    void loadMathJax(opts?.srcOverride)
      .then(() => {
        const MathJax = window.MathJax; if (!MathJax) { devLog("no-mathjax"); return; }
        const parent = el.parentElement ?? undefined;
        const invokeTypeset = (targets?: HTMLElement[]) => {
          const fn = MathJax.typesetPromise;
          if (typeof fn !== "function") return Promise.resolve();
          let result: unknown;
          try {
            result = fn.call(MathJax, targets);
          } catch (error) {
            devLog("typeset-invoke-error", error);
            return Promise.resolve();
          }
          if (result && typeof (result as Promise<void>).then === "function") {
            return (result as Promise<void>).catch((err) => {
              devLog("typeset-promise-error", err);
            });
          }
          return Promise.resolve();
        };
        const tryLocal = () => invokeTypeset([el]);
        const tryParent = () => (parent ? invokeTypeset([parent]) : Promise.resolve());
        const tryGlobal = () => invokeTypeset();
        const run = () => tryLocal()
          .then(() => { if (!el.querySelector("mjx-container")) return tryParent(); })
          .then(() => { if (!el.querySelector("mjx-container")) return tryGlobal(); })
          .then(() => devLog(el.querySelector("mjx-container") ? "typeset-done" : "typeset-fallback-global-done"))
          .catch((e) => devLog("typeset-error", e));
        if (MathJax.startup?.promise) MathJax.startup.promise.then(run).catch((e)=>devLog("startup-promise-error", e));
        else run();
      })
      .catch((e) => devLog("mathjax-load-error", e));
  };

  const scheduleRafChain = () => {
    if (rafs === 2) {
      handles.raf = requestAnimationFrame(() => {
        if (cancelled) return;
        handles.raf2 = requestAnimationFrame(() => runTypeset());
      });
    } else if (rafs === 1) {
      handles.raf = requestAnimationFrame(() => runTypeset());
    } else {
      // rafs === 0: run immediately, no rAF hops
      runTypeset();
    }
  };

  if (delayMs > 0) {
    handles.timeout = window.setTimeout(() => {
      if (cancelled) return;
      scheduleRafChain();
    }, delayMs);
  } else {
    scheduleRafChain();
  }

  const cancel = () => {
    cancelled = true;
    if (handles.timeout !== undefined) window.clearTimeout(handles.timeout);
    if (handles.raf !== undefined) cancelAnimationFrame(handles.raf);
    if (handles.raf2 !== undefined) cancelAnimationFrame(handles.raf2);
  };
  return cancel;
}

function loadMathJax(srcOverride?: string) {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.MathJax) {
    return Promise.resolve();
  }

  if (!mathJaxPromise) {
    mathJaxPromise = new Promise((resolve, reject) => {
      // Provide a basic configuration so that inline math using \( .. \) works
      // reliably across pages.
      window.MathJax = {
        tex: {
          inlineMath: [
            ["\\(", "\\)"],
            ["$", "$"]
          ],
          displayMath: [
            ["\\[", "\\]"],
            ["$$", "$$"]
          ],
          // If true, \\$ or \\(...\\) are treated as literal text, which
          // conflicts with many LLMs that emit double-backslashed delimiters.
          // Keep it false so \\(...\\) can be normalized and parsed as math.
          processEscapes: false,
        },
        options: {
          skipHtmlTags: [
            "script",
            "noscript",
            "style",
            "textarea",
            "pre",
            "code",
          ],
          // Disable the MathJax right-click context menu
          renderActions: { addMenu: [] },
        },
      } satisfies MathJaxWithConfig;

      const envSrc = (typeof process !== 'undefined' ? (process.env?.NEXT_PUBLIC_MATHJAX_SRC as string | undefined) : undefined);
      const src = srcOverride || envSrc || "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
      const maxRetries = 2;
      const attempt = (n: number) => {
        const script = document.createElement("script");
        script.src = src + (n ? `?retry=${n}` : "");
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
          devLog("mathjax-script-error", { attempt: n });
          try { script.remove(); } catch {}
          if (n < maxRetries) {
            const backoff = 200 * Math.pow(2, n);
            window.setTimeout(() => attempt(n + 1), backoff);
          } else {
            // Reset so future calls can retry after a hard failure
            mathJaxPromise = null;
            reject(new Error("Failed to load MathJax"));
          }
        };
        document.head.appendChild(script);
      };
      attempt(0);
    });
  }

  return mathJaxPromise;
}

type ObserverMode = 'shared' | 'local';

type FormattedTextProps = {
  text: string;
  incremental?: boolean;
  finalize?: boolean;
  typesetDelayMs?: number; // delay before typeset; 24ms default
  typesetRAFCount?: 0 | 1 | 2; // hops of requestAnimationFrame (default 1). 0 = immediate.
  typesetOnMount?: boolean; // bypass delay on the first typeset
  mathJaxSrc?: string; // override MathJax script src (CSP/offline)
  className?: string; // optional class
  as?: React.ElementType; // element type, default 'span'
  observer?: ObserverMode; // share IntersectionObserver by default
  incrementalFlushChars?: number; // flush threshold in incremental mode (default 160)
};

// Shared IntersectionObserver to reduce per-instance overhead
let sharedObserver: IntersectionObserver | null = null;
const sharedCallbacks = new Map<Element, () => void>();

function ensureSharedObserver() {
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        const cb = sharedCallbacks.get(e.target);
        if (cb) cb();
      }
    }
  }, { root: null, threshold: 0.01 });
  return sharedObserver;
}

function observeShared(el: Element, cb: () => void) {
  const obs = ensureSharedObserver();
  sharedCallbacks.set(el, cb);
  obs.observe(el);
  return () => {
    try { obs.unobserve(el); } catch {}
    sharedCallbacks.delete(el);
  };
}

function FormattedText({
  text,
  incremental = false,
  finalize = false,
  typesetDelayMs = 24,
  typesetRAFCount = 1,
  typesetOnMount = false,
  mathJaxSrc,
  className,
  as = 'span',
  observer = 'shared',
  incrementalFlushChars = 160,
}: FormattedTextProps) {
  const ref = useRef<HTMLElement | null>(null);
  const firstTypesetRef = useRef<boolean>(true);

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
    const out = segs.map(({ math, t }) =>
      math ? escapeHtml(fixMacrosInMath(t)) : formatNonMath(t, tableReplacements, placeholderCounter)
    ).join("");
    devLog("html-ready", { len: out.length });
    return out;
  }, [text]);
  const containsMath = useMemo(() => MATH_TRIGGER_RE.test(html), [html]);

  // Incremental mode: append only the delta to avoid wiping previous MathJax output
  const lastHtmlRef = useRef<string>("");
  const lastTypesetLenRef = useRef<number>(0);
  const pendingRef = useRef<string>("");
  const inlineDepthRef = useRef<number>(0); // depth for \( \) and \[ \]
  const displayDepthRef = useRef<number>(0); // count of open $$ blocks
  const inSingleRef = useRef<boolean>(false); // inside $ ... $
  const cancelTypesetRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!incremental) return; // handled by the normal effect below
    const el = ref.current as HTMLElement | null;
    if (!el) return;

    const last = lastHtmlRef.current;
    const next = html;
    if (next.startsWith(last)) {
      const delta = next.slice(last.length);
      if (delta) {
        const prefix = last + pendingRef.current;
        const combined = prefix + delta;
        let closedToOutside = false;
        const state: MathBoundaryState = {
          inlineDepth: inlineDepthRef.current,
          displayDepth: displayDepthRef.current,
          singleOpen: inSingleRef.current,
        };
        scanMathState(combined, prefix.length, state, () => { closedToOutside = true; });
        inlineDepthRef.current = state.inlineDepth;
        displayDepthRef.current = state.displayDepth;
        inSingleRef.current = state.singleOpen;

        // Buffer until we hit a safe boundary: a closing delimiter that leaves
        // us outside math, or a sentence boundary while outside math.
        pendingRef.current += delta;

        const outsideMath = inlineDepthRef.current === 0 && displayDepthRef.current === 0 && !inSingleRef.current;
        const hasCloser = closedToOutside && outsideMath;

        let hasSentence = false;
        if (outsideMath) {
          // Sentence boundary: last '.', '!' or '?' followed by space/newline
          const s = pendingRef.current;
          for (let i = s.length - 2; i >= Math.max(0, s.length - 240); i--) {
            const ch = s[i];
            if ((ch === "." || ch === "!" || ch === "?") && (s[i + 1] === " " || s[i + 1] === "\n")) {
              hasSentence = true;
              break;
            }
          }
          if (!hasSentence && s.includes("\n\n")) hasSentence = true;
        }

        const shouldFlush = hasCloser || hasSentence || finalize || (next.length - lastTypesetLenRef.current > incrementalFlushChars);
        if (shouldFlush && pendingRef.current) {
          el.insertAdjacentHTML("beforeend", pendingRef.current);
          lastHtmlRef.current = last + pendingRef.current;
          pendingRef.current = "";

          if (cancelTypesetRef.current) cancelTypesetRef.current();
          if (containsMath) {
            const immediate = firstTypesetRef.current && typesetOnMount;
            cancelTypesetRef.current = scheduleTypeset(el, { delayMs: immediate ? 0 : typesetDelayMs, rafs: typesetRAFCount, srcOverride: mathJaxSrc });
          } else {
            cancelTypesetRef.current = null;
          }
          firstTypesetRef.current = false;
          lastTypesetLenRef.current = next.length;
        }
      }
    } else {
      // Content changed in a non-append way; replace fully
      el.innerHTML = next;
      // Reset incremental state to avoid carrying over from previous stream
      inlineDepthRef.current = 0;
      displayDepthRef.current = 0;
      inSingleRef.current = false;
      pendingRef.current = "";
      lastTypesetLenRef.current = 0;
      if (cancelTypesetRef.current) cancelTypesetRef.current();
      if (containsMath) {
        const immediate = firstTypesetRef.current && typesetOnMount;
        cancelTypesetRef.current = scheduleTypeset(el, { delayMs: immediate ? 0 : typesetDelayMs, rafs: typesetRAFCount, srcOverride: mathJaxSrc });
      } else {
        cancelTypesetRef.current = null;
      }
      firstTypesetRef.current = false;
      lastTypesetLenRef.current = next.length;
    }
    lastHtmlRef.current = next;
    return () => {
      if (cancelTypesetRef.current) cancelTypesetRef.current();
    };
  }, [html, incremental, finalize, typesetDelayMs, typesetOnMount, typesetRAFCount, mathJaxSrc, incrementalFlushChars, containsMath]);

  // If parent signals completion, flush any remaining pending text
  useEffect(() => {
    if (!incremental) return;
    if (!finalize) return;
    const el = ref.current as HTMLElement | null;
    if (!el) return;
    if (pendingRef.current) {
      el.insertAdjacentHTML("beforeend", pendingRef.current);
      lastHtmlRef.current += pendingRef.current;
      pendingRef.current = "";
      if (cancelTypesetRef.current) cancelTypesetRef.current();
      if (containsMath) {
        const immediate = firstTypesetRef.current && typesetOnMount;
        cancelTypesetRef.current = scheduleTypeset(el, { delayMs: immediate ? 0 : typesetDelayMs, rafs: typesetRAFCount, srcOverride: mathJaxSrc });
      } else {
        cancelTypesetRef.current = null;
      }
      firstTypesetRef.current = false;
      lastTypesetLenRef.current = lastHtmlRef.current.length;
    }
    // Reset open-delimiter state after finalize to avoid leaks into next stream
    inlineDepthRef.current = 0;
    displayDepthRef.current = 0;
    inSingleRef.current = false;
  }, [finalize, incremental, typesetDelayMs, typesetOnMount, typesetRAFCount, mathJaxSrc, containsMath]);

  // Normal mode: rely on React to set innerHTML, then typeset after paint
  useEffect(() => {
    if (incremental) return; // handled above
    const el = ref.current as HTMLElement | null;
    if (!el) return;
    if (!containsMath) {
      firstTypesetRef.current = false;
      return;
    }

    let cancelTypeset = scheduleTypeset(el, { delayMs: (firstTypesetRef.current && typesetOnMount) ? 0 : typesetDelayMs, rafs: typesetRAFCount, srcOverride: mathJaxSrc });
    firstTypesetRef.current = false;

    // Retypeset when the element becomes visible (covers card swaps)
    const restart = () => {
      cancelTypeset();
      cancelTypeset = scheduleTypeset(el, { delayMs: typesetDelayMs, rafs: typesetRAFCount, srcOverride: mathJaxSrc });
    };

    const cleanup = observer === 'shared'
      ? observeShared(el, restart)
      : (() => {
          const obs = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) restart();
          }, { root: null, threshold: 0.01 });
          obs.observe(el);
          return () => { try { obs.disconnect(); } catch {} };
        })();

    return () => { try { cleanup(); } catch {} try { cancelTypeset(); } catch {} };
  }, [html, incremental, typesetDelayMs, typesetOnMount, typesetRAFCount, mathJaxSrc, observer, containsMath]);

  const Tag: React.ElementType = as;
  return incremental ? (
    <Tag ref={ref as React.Ref<HTMLElement>} className={className} />
  ) : (
    <Tag ref={ref as React.Ref<HTMLElement>} className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export default memo(FormattedText);
