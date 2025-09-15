"use client";
import React, { useEffect, useMemo, useRef, memo } from "react";

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
const RE_BOLD_A = /\*\*([^*]+)\*\*/g;
const RE_BOLD_B = /__([^_]+)__/g;
const RE_DEL = /~~([^~]+)~~/g;
const RE_CODE = /`([^`]+)`/g;
const RE_BEGIN_END = /\\begin\{([^}]+)\}[\s\S]*?\\end\{\1\}/g;
const RE_TEX_COMMON = /\\(?:frac|sqrt|vec|mathbf|mathbb|mathcal|hat|bar|underline|overline|binom|pmatrix|bmatrix|vmatrix)\b(?:\{[^{}]*\}){1,2}/g;
const RE_TEX_GREEK = /\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|infty|neq|approx|sim|propto|forall|exists|nabla|partial|cdot|times|pm|leq|geq)\b/g;
const RE_SUBSCRIPT = /([A-Za-z]+)_(\{[^}]+\}|\d+|[A-Za-z])/g;
const RE_DOUBLE_BAR = /\|\|([^|]{1,80})\|\|/g;
// Note: preserve these misencoded patterns to avoid unrelated changes
const RE_ANGLE = /âŸ¨([^âŸ©]{1,80})âŸ©/g;
const RE_SQRT = /âˆš\s*\(?([0-9A-Za-z+\-*/^\s,.]+?)\)?(?=(\s|[.,;:)\]]|$))/g;

const MACROS = [
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
  // functions
  "log","sin","cos","tan","to","infty"
].join("|");
// Match two or more backslashes before a macro (e.g., \\frac, \\\\alpha)
// and collapse them down to a single backslash.
const RE_DOUBLE_BEFORE_MACRO = new RegExp('(?:\\\\){2,}(?=(' + MACROS + ')\\b)', 'g');
const RE_BARE_COMMON_MACROS = /(^|[^\\])(langle|rangle|mathbf|sqrt|frac|vec|binom)\b/g;
const RE_ONE_LETTER_ARG = {
  mathbf: /\\mathbf([A-Za-z])(?![A-Za-z])/g,
  vec: /\\vec([A-Za-z])(?![A-Za-z])/g,
  hat: /\\hat([A-Za-z])(?![A-Za-z])/g,
  bar: /\\bar([A-Za-z])(?![A-Za-z])/g,
} as const;

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
  return src
    .split("\\\\(").join("\\(")
    .split("\\\\)").join("\\)")
    .split("\\\\[").join("\\[")
    .split("\\\\]").join("\\]");
}

function balanceDelimiters(src: string) {
  const stack: ("\\(" | "\\[")[] = [];
  let displayOpen = false;
  const tokenRe = /\\\(|\\\[|\\\)|\\\]|\$\$/g;
  let m: RegExpExecArray | null;
  const origLen = src.length;
  while ((m = tokenRe.exec(src))) {
    const t = m[0];
    if (t === "\\(" || t === "\\[") stack.push(t);
    else if (t === "\\)") { if (stack[stack.length - 1] === "\\(") stack.pop(); }
    else if (t === "\\]") { if (stack[stack.length - 1] === "\\[") stack.pop(); }
    else if (t === "$$") displayOpen = !displayOpen;
  }
  let appended = 0;
  while (stack.length) { src += stack.pop() === "\\(" ? "\\)" : "\\]"; appended++; }
  if (displayOpen) { src += "$$"; appended++; }
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
      if (src.startsWith("\\(", i) || src.startsWith("\\[", i) || src.startsWith("$$", i)) {
        commit(i);
        opener = src.startsWith("\\(", i) ? "\\(" : src.startsWith("\\[", i) ? "\\[" : "$$";
        inMath = true; i += opener.length;
      } else if (src[i] === '$') {
        // Single-dollar inline math heuristic:
        // - must have a matching '$' ahead within 240 chars
        // - not a '$$' opener
        // - not escaped (prev char is not '\\')
        // - next char is NOT a digit to avoid currency like $100
        const nextIdx = src.indexOf('$', i + 1);
        const prevChar = i > 0 ? src[i - 1] : '';
        const nextChar = src[i + 1] ?? '';
        const escaped = prevChar === '\\';
        const startsWithDollarDollar = nextChar === '$';
        const nextIsDigit = nextChar >= '0' && nextChar <= '9';
        if (nextIdx !== -1 && (nextIdx - i) <= 240 && !startsWithDollarDollar && !escaped && !nextIsDigit) {
          commit(i);
          opener = '$';
          inMath = true; i += 1;
        } else {
          i++;
        }
      } else i++;
    } else {
      const close = opener === "\\(" ? "\\)" : opener === "\\[" ? "\\]" : opener === "$$" ? "$$" : "$";
      if (src.startsWith(close, i)) { i += close.length; commit(i); inMath = false; opener = null; }
      else i++;
    }
  }
  commit(src.length);
  return segs;
}

function formatNonMath(s: string) {
  const wrap = (tex: string) => `\\(${tex}\\)`;
  let out = escapeHtml(s)
    .replace(RE_BOLD_A, "<strong>$1</strong>")
    .replace(RE_BOLD_B, "<strong>$1</strong>")
    .replace(RE_DEL, "<del>$1</del>")
    .replace(RE_CODE, "<code>$1</code>");
  // Conservatively wrap common TeX fragments that appear in plain text
  out = out.replace(RE_BEGIN_END, (m) => wrap(m));
  out = out.replace(RE_TEX_COMMON, (m) => wrap(m));
  out = out.replace(RE_TEX_GREEK, (m) => wrap(m));
  out = out.replace(RE_SUBSCRIPT, (_m, a, b) => wrap(`${a}_${b}`));
  out = out.replace(RE_DOUBLE_BAR, (_m, inner) => wrap(`\\| ${inner.trim()} \\|`));
  out = out.replace(RE_ANGLE, (_m, inner) => wrap(`\\langle ${inner.trim()} \\rangle`));
  out = out.replace(RE_SQRT, (_m, inner) => wrap(`\\sqrt{${inner.trim()}}`));
  return out;
}

function fixMacrosInMath(s: string) {
  // Collapse accidental double-backslashes before common macros (not row breaks)
  s = s.replace(RE_DOUBLE_BEFORE_MACRO, '\\');
  // If a macro name appears without a backslash in math (rare), add one
  s = s.replace(RE_BARE_COMMON_MACROS, '$1\\$2');
  // Normalize one-letter macro arguments like \mathbfv -> \mathbf{v}
  s = s.replace(RE_ONE_LETTER_ARG['mathbf'], '\\mathbf{$1}');
  s = s.replace(RE_ONE_LETTER_ARG['vec'], '\\vec{$1}');
  s = s.replace(RE_ONE_LETTER_ARG['hat'], '\\hat{$1}');
  s = s.replace(RE_ONE_LETTER_ARG['bar'], '\\bar{$1}');
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
        const tryLocal = () => MathJax.typesetPromise?.([el]).catch(() => {});
        const tryParent = () => parent ? MathJax.typesetPromise?.([parent]).catch(() => {}) : Promise.resolve();
        const tryGlobal = () => MathJax.typesetPromise?.().catch(() => {});
        const run = () => (tryLocal() as Promise<void> | undefined)
          ?.then(() => { if (!el.querySelector("mjx-container")) return tryParent(); })
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
    const segs = splitMathSegments(src);
    const out = segs.map(({ math, t }) => (math ? escapeHtml(fixMacrosInMath(t)) : formatNonMath(t))).join("");
    devLog("html-ready", { len: out.length });
    return out;
  }, [text]);

  // Incremental mode: append only the delta to avoid wiping previous MathJax output
  const lastHtmlRef = useRef<string>("");
  const lastTypesetLenRef = useRef<number>(0);
  const pendingRef = useRef<string>("");
  const inlineDepthRef = useRef<number>(0); // depth for \( \) and \[ \]
  const inDisplayRef = useRef<boolean>(false); // toggled by $$
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
        // Track math open/close state in the newly received delta
        const tokenRe = /\\\(|\\\[|\\\)|\\\]|\$\$|\$/g; // order matters: $$ before $
        let m: RegExpExecArray | null;
        let closedToOutside = false;
        while ((m = tokenRe.exec(delta))) {
          const t = m[0];
          if (t === "\\(" || t === "\\[") {
            inlineDepthRef.current += 1;
          } else if (t === "\\)" || t === "\\]") {
            const before = inlineDepthRef.current;
            inlineDepthRef.current = Math.max(0, inlineDepthRef.current - 1);
            if (before > 0 && inlineDepthRef.current === 0 && !inDisplayRef.current && !inSingleRef.current) {
              closedToOutside = true;
            }
          } else if (t === "$$") {
            const was = inDisplayRef.current;
            inDisplayRef.current = !inDisplayRef.current;
            if (was && !inDisplayRef.current && inlineDepthRef.current === 0 && !inSingleRef.current) {
              closedToOutside = true;
            }
          } else if (t === "$") {
            // Heuristic similar to splitMathSegments: avoid currency
            const pos = (m.index ?? 0);
            const prevChar = pos > 0 ? delta[pos - 1] : (last + pendingRef.current).slice(-1);
            const nextChar = delta[pos + 1] ?? "";
            const escaped = prevChar === "\\";
            const likelyCurrency = !inSingleRef.current && (nextChar >= '0' && nextChar <= '9');
            if (!escaped && !likelyCurrency) {
              const was = inSingleRef.current;
              inSingleRef.current = !inSingleRef.current;
              if (was && !inSingleRef.current && inlineDepthRef.current === 0 && !inDisplayRef.current) {
                closedToOutside = true;
              }
            }
          }
        }

        // Buffer until we hit a safe boundary: a closing delimiter that leaves
        // us outside math, or a sentence boundary while outside math.
        pendingRef.current += delta;

        const outsideMath = inlineDepthRef.current === 0 && !inDisplayRef.current && !inSingleRef.current;
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
          const immediate = firstTypesetRef.current && typesetOnMount;
          cancelTypesetRef.current = scheduleTypeset(el, { delayMs: immediate ? 0 : typesetDelayMs, rafs: typesetRAFCount, srcOverride: mathJaxSrc });
          firstTypesetRef.current = false;
          lastTypesetLenRef.current = next.length;
        }
      }
    } else {
      // Content changed in a non-append way; replace fully
      el.innerHTML = next;
      // Reset incremental state to avoid carrying over from previous stream
      inlineDepthRef.current = 0;
      inDisplayRef.current = false;
      inSingleRef.current = false;
      pendingRef.current = "";
      lastTypesetLenRef.current = 0;
      if (cancelTypesetRef.current) cancelTypesetRef.current();
      const immediate = firstTypesetRef.current && typesetOnMount;
      cancelTypesetRef.current = scheduleTypeset(el, { delayMs: immediate ? 0 : typesetDelayMs, rafs: typesetRAFCount, srcOverride: mathJaxSrc });
      firstTypesetRef.current = false;
      lastTypesetLenRef.current = next.length;
    }
    lastHtmlRef.current = next;
    return () => {
      if (cancelTypesetRef.current) cancelTypesetRef.current();
    };
  }, [html, incremental, finalize, typesetDelayMs, typesetOnMount, typesetRAFCount, mathJaxSrc, incrementalFlushChars]);

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
      const immediate = firstTypesetRef.current && typesetOnMount;
      cancelTypesetRef.current = scheduleTypeset(el, { delayMs: immediate ? 0 : typesetDelayMs, rafs: typesetRAFCount, srcOverride: mathJaxSrc });
      firstTypesetRef.current = false;
      lastTypesetLenRef.current = lastHtmlRef.current.length;
    }
    // Reset open-delimiter state after finalize to avoid leaks into next stream
    inlineDepthRef.current = 0;
    inDisplayRef.current = false;
    inSingleRef.current = false;
  }, [finalize, incremental, typesetDelayMs, typesetOnMount, typesetRAFCount, mathJaxSrc]);

  // Normal mode: rely on React to set innerHTML, then typeset after paint
  useEffect(() => {
    if (incremental) return; // handled above
    const el = ref.current as HTMLElement | null;
    if (!el) return;

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
  }, [html, incremental, typesetDelayMs, typesetOnMount, typesetRAFCount, mathJaxSrc, observer]);

  const Tag: React.ElementType = as;
  return incremental ? (
    <Tag ref={ref as React.Ref<HTMLElement>} className={className} />
  ) : (
    <Tag ref={ref as React.Ref<HTMLElement>} className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export default memo(FormattedText);
