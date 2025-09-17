// Shared LaTeX normalization helpers used across server and client.
// Keep macros and heuristics in sync with FormattedText so MathJax receives
// consistently formatted input regardless of origin.

export const LATEX_MACRO_NAMES = [
  // formatting/accents/sets
  "langle","rangle","vec","mathbf","mathbb","mathcal","hat","bar","underline","overline",
  // operators and relations
  "cdot","times","pm","leq","geq","neq","approx","sim","propto","forall","exists",
  // structures
  "frac","sqrt","binom","pmatrix","bmatrix","vmatrix","begin","end",
  // greek letters
  "alpha","beta","gamma","delta","epsilon","varepsilon","zeta","eta","theta","vartheta","iota","kappa","lambda","mu","nu","xi","pi","varpi","rho","varrho","sigma","varsigma","tau","upsilon","phi","varphi","chi","psi","omega",
  "Gamma","Delta","Theta","Lambda","Xi","Pi","Sigma","Upsilon","Phi","Psi","Omega",
  // calculus symbols
  "nabla","partial","sum","prod","int","lim",
  // functions and misc
  "log","sin","cos","tan","to","infty"
] as const;

export const LATEX_MACRO_PATTERN = LATEX_MACRO_NAMES.join("|");
const RE_DOUBLE_BEFORE_MACRO = new RegExp(`(?:\\\\){2,}(?=(?:${LATEX_MACRO_PATTERN})\\b)`, "g");
const RE_DOUBLE_ESCAPED_MACRO = new RegExp(`\\\\(${LATEX_MACRO_PATTERN})\\b`, "g");
const RE_INLINE_DOLLARS = /\$(?!\$)([^$\n]{1,300})\$/g;

export type LatexNormalizeOptions = {
  convertInlineMath?: boolean;
  collapseDelimiters?: boolean;
  collapseMacroEscapes?: boolean;
};

export function normalizeLatexDelimiters(value: string): string {
  return value
    .replace(/\\\\\(/g, "\\(")
    .replace(/\\\\\)/g, "\\)")
    .replace(/\\\\\[/g, "\\[")
    .replace(/\\\\\]/g, "\\]");
}

export function collapseMacroEscapes(value: string): string {
  return value.replace(RE_DOUBLE_BEFORE_MACRO, "\\");
}

export function normalizeLatex(value: string, options: LatexNormalizeOptions = {}): string {
  const { convertInlineMath = true, collapseDelimiters = true, collapseMacroEscapes: collapseMacros = true } = options;
  if (!value) return "";
  let out = value;
  if (convertInlineMath) {
    out = out.replace(RE_INLINE_DOLLARS, (_match, inner: string) => `\\(${inner}\\)`);
  }
  if (collapseDelimiters) {
    out = normalizeLatexDelimiters(out);
  }
  if (collapseMacros) {
    out = collapseMacroEscapes(out);
  }
  return out;
}

export type LatexScanResult = {
  doubleEscapedMacros: string[];
  unmatchedInlinePairs: number;
  unmatchedDisplayPairs: number;
  oddDollarBlocks: boolean;
};

export function scanLatex(value: string): LatexScanResult {
  const src = value || "";
  const doubleEscaped = new Set<string>();
  src.replace(RE_DOUBLE_ESCAPED_MACRO, (_match, macro: string) => {
    doubleEscaped.add(macro);
    return "";
  });
  const inlineOpen = (src.match(/\\\(/g) || []).length;
  const inlineClose = (src.match(/\\\)/g) || []).length;
  const displayOpen = (src.match(/\\\[/g) || []).length;
  const displayClose = (src.match(/\\\]/g) || []).length;
  const oddDollarBlocks = ((src.match(/\$\$/g) || []).length % 2) === 1;
  return {
    doubleEscapedMacros: Array.from(doubleEscaped),
    unmatchedInlinePairs: inlineOpen - inlineClose,
    unmatchedDisplayPairs: displayOpen - displayClose,
    oddDollarBlocks,
  };
}

export function hasLatexIssues(scan: LatexScanResult): boolean {
  return (
    scan.doubleEscapedMacros.length > 0 ||
    scan.unmatchedInlinePairs !== 0 ||
    scan.unmatchedDisplayPairs !== 0 ||
    scan.oddDollarBlocks
  );
}