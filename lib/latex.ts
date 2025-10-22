// Shared LaTeX normalization helpers used across server and client.
// Keep macros and heuristics in sync with FormattedText so MathJax receives
// consistently formatted input regardless of origin.

const LATEX_ACCENT_MACROS = [
  "vec",
  "mathbf",
  "mathbb",
  "mathcal",
  "hat",
  "bar",
  "underline",
  "overline",
] as const;

const LATEX_STRUCTURE_MACROS = [
  "frac",
  "sqrt",
  "binom",
  "pmatrix",
  "bmatrix",
  "vmatrix",
] as const;

const LATEX_SET_MACROS = [
  "langle",
  "rangle",
] as const;

const LATEX_SYMBOL_MACROS = [
  "cdot",
  "times",
  "div",
  "pm",
  "mp",
  "leq",
  "geq",
  "neq",
  "approx",
  "sim",
  "cong",
  "equiv",
  "propto",
  "forall",
  "exists",
  "in",
  "notin",
  "subset",
  "supset",
  "subseteq",
  "supseteq",
  "cap",
  "cup",
  "emptyset",
  "rightarrow",
  "leftarrow",
  "leftrightarrow",
  "Rightarrow",
  "Leftarrow",
  "Leftrightarrow",
  "mapsto",
  "implies",
  "iff",
  "neg",
  "wedge",
  "vee",
  "perp",
  "parallel",
  "angle",
  "triangle",
  "square",
  "circ",
  "bullet",
  "star",
  "ast",
  "oplus",
  "otimes",
  "odot",
] as const;

const LATEX_GREEK_LOWER = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "varepsilon",
  "zeta",
  "eta",
  "theta",
  "vartheta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "pi",
  "varpi",
  "rho",
  "varrho",
  "sigma",
  "varsigma",
  "tau",
  "upsilon",
  "phi",
  "varphi",
  "chi",
  "psi",
  "omega",
] as const;

const LATEX_GREEK_UPPER = [
  "Gamma",
  "Delta",
  "Theta",
  "Lambda",
  "Xi",
  "Pi",
  "Sigma",
  "Upsilon",
  "Phi",
  "Psi",
  "Omega",
] as const;

const LATEX_CALCULUS_MACROS = [
  "nabla",
  "partial",
  "sum",
  "prod",
  "int",
  "lim",
] as const;

const LATEX_FUNCTION_MACROS = [
  "log",
  "ln",
  "sin",
  "cos",
  "tan",
  "sec",
  "csc",
  "cot",
  "arcsin",
  "arccos",
  "arctan",
  "sinh",
  "cosh",
  "tanh",
  "exp",
  "min",
  "max",
  "det",
  "dim",
  "ker",
  "deg",
  "arg",
  "gcd",
  "lcm",
  "to",
] as const;

const LATEX_ENVIRONMENT_MACROS = [
  "begin",
  "end",
] as const;

const LATEX_TEXT_MACROS = [
  "text",
  "textrm",
  "textit",
  "textbf",
  "textsf",
  "texttt",
] as const;

export const LATEX_TEXT_BRACED_MACROS = [
  ...LATEX_STRUCTURE_MACROS,
  ...LATEX_ACCENT_MACROS,
  ...LATEX_TEXT_MACROS,
] as const;

export const LATEX_TEXT_SYMBOL_MACROS = [
  ...LATEX_GREEK_LOWER,
  ...LATEX_GREEK_UPPER,
  ...LATEX_SYMBOL_MACROS,
  "infty",
] as const;

export const LATEX_TEXT_BARE_MACROS = [
  ...LATEX_SET_MACROS,
  "mathbf",
  "sqrt",
  "frac",
  "vec",
  "binom",
] as const;

export const LATEX_TEXT_SINGLE_LETTER_MACROS = [
  "mathbf",
  "vec",
  "hat",
  "bar",
] as const;

export const LATEX_MACRO_NAMES = [
  ...LATEX_SET_MACROS,
  ...LATEX_ACCENT_MACROS,
  ...LATEX_SYMBOL_MACROS,
  ...LATEX_STRUCTURE_MACROS,
  ...LATEX_GREEK_LOWER,
  ...LATEX_GREEK_UPPER,
  ...LATEX_CALCULUS_MACROS,
  ...LATEX_FUNCTION_MACROS,
  ...LATEX_ENVIRONMENT_MACROS,
  ...LATEX_TEXT_MACROS,
  "infty",
] as const;

export const LATEX_MACRO_PATTERN = LATEX_MACRO_NAMES.join("|");
const RE_DOUBLE_BEFORE_MACRO = new RegExp(`(?:\\\\){2,}(?=(?:${LATEX_MACRO_PATTERN})\\b)`, "g");
// Fixed: Match \\macro (double backslash) not \macro (single backslash)
const RE_DOUBLE_ESCAPED_MACRO = new RegExp(`\\\\\\\\(${LATEX_MACRO_PATTERN})\\b`, "g");
const RE_INLINE_DOLLARS = /(?<!\\)\$(?!\$)([^$\n]{1,300}?)(?<!\\)\$/g;

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

// Export MATH_TRIGGER_RE for use in components
export const MATH_TRIGGER_RE = /(\$|\\\(|\\\[|\\begin|√|⟨|_\{|\\\^)/;
