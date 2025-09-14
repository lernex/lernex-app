"use client";
import React, { useEffect, useMemo, useRef } from "react";

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

// Lightweight debug helper (no hooks). Avoids re-creating functions and keeps
// effects' dependency lists small.
function devLog(...args: unknown[]) {
  try {
    // Only log in dev to keep console clean in production
    
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      
      console.debug("[FormattedText]", ...args);
    }
  } catch {}
}

// Utilities kept outside React so they aren't re-created every render
function escapeHtml(s: string) {
  // Broaden escaping to reduce risk when injecting fragments
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

function normalizeBackslashes(src: string) {
  // Many LLM outputs double-backslashed delimiters/macros; normalize
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
  while ((m = tokenRe.exec(src))) {
    const t = m[0];
    if (t === "\\(" || t === "\\[") stack.push(t);
    else if (t === "\\)") { if (stack[stack.length - 1] === "\\(") stack.pop(); }
    else if (t === "\\]") { if (stack[stack.length - 1] === "\\[") stack.pop(); }
    else if (t === "$$") displayOpen = !displayOpen;
  }
  while (stack.length) src += stack.pop() === "\\(" ? "\\)" : "\\]";
  if (displayOpen) src += "$$";
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
        // Support single-dollar inline math only when a matching '$' exists ahead
        // within a reasonable window to avoid capturing currency like $100.
        const next = src.indexOf('$', i + 1);
        if (next !== -1 && next - i <= 240 && src[i + 1] !== '$') {
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
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  // Conservatively wrap common TeX fragments that appear in plain text
  out = out.replace(/\\begin\{([^}]+)\}[\s\S]*?\\end\{\1\}/g, (m) => wrap(m));
  out = out.replace(
    /\\(?:frac|sqrt|vec|mathbf|mathbb|mathcal|hat|bar|underline|overline|binom|pmatrix|bmatrix|vmatrix)\b(?:\{[^{}]*\}){1,2}/g,
    (m) => wrap(m)
  );
  out = out.replace(
    /\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|infty|neq|approx|sim|propto|forall|exists|nabla|partial|cdot|times|pm|leq|geq)\b/g,
    (m) => wrap(m)
  );
  out = out.replace(/([A-Za-z]+)_(\{[^}]+\}|\d+|[A-Za-z])/g, (_m, a, b) => wrap(`${a}_${b}`));
  out = out.replace(/\|\|([^|]{1,80})\|\|/g, (_m, inner) => wrap(`\\| ${inner.trim()} \\|`));
  out = out.replace(/⟨([^⟩]{1,80})⟩/g, (_m, inner) => wrap(`\\langle ${inner.trim()} \\rangle`));
  out = out.replace(/√\s*\(?([0-9A-Za-z+\-*/^\s,.]+?)\)?(?=(\s|[.,;:)\]]|$))/g, (_m, inner) => wrap(`\\sqrt{${inner.trim()}}`));
  return out;
}

function fixMacrosInMath(s: string) {
  // Collapse accidental double-backslashes before common macros (not row breaks)
  const macros = [
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
  // Match two backslashes before the macro and collapse to one (e.g., \\alpha -> \alpha)
  const reDouble = new RegExp('\\\\(?=(' + macros + ')\\b)', 'g');
  s = s.replace(reDouble, '\\');
  // If a macro name appears without a backslash in math (rare), add one
  s = s.replace(/(^|[^\\])(langle|rangle|mathbf|sqrt|frac|vec|binom)\b/g, '$1\\$2');
  // Normalize one-letter macro arguments like \mathbfv -> \mathbf{v}
  s = s.replace(/\\mathbf([A-Za-z])(?![A-Za-z])/g, '\\mathbf{$1}');
  s = s.replace(/\\vec([A-Za-z])(?![A-Za-z])/g, '\\vec{$1}');
  s = s.replace(/\\hat([A-Za-z])(?![A-Za-z])/g, '\\hat{$1}');
  s = s.replace(/\\bar([A-Za-z])(?![A-Za-z])/g, '\\bar{$1}');
  return s;
}

// Typeset helper reused by both effects. Returns a cancel function.
function scheduleTypeset(el: HTMLElement, delayMs = 80) {
  devLog("typeset-schedule");
  let cancelled = false;
  let timeoutId: number | undefined;
  let raf1: number | undefined;
  let raf2: number | undefined;
  const cancel = () => {
    cancelled = true;
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    if (raf1 !== undefined) cancelAnimationFrame(raf1);
    if (raf2 !== undefined) cancelAnimationFrame(raf2);
  };
  timeoutId = window.setTimeout(() => {
    if (cancelled) return;
    raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        devLog("typeset-run");
        void loadMathJax()
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
      });
    });
  }, delayMs);
  return cancel;
}

function loadMathJax() {
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

      const src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
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

export default function FormattedText({ text, incremental = false, finalize = false, typesetDelayMs = 80 }: { text: string; incremental?: boolean; finalize?: boolean; typesetDelayMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  // Compute the HTML once per `text` value. Using `dangerouslySetInnerHTML`
  // lets React "own" the content so it won't randomly clear MathJax's
  // rendered DOM on unrelated re-renders.
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

  // Incremental mode: append only the delta to avoid wiping previous MathJax
  // output during streaming. This eliminates the formatted ↔ unformatted flash.
  const lastHtmlRef = useRef<string>("");
  const lastTypesetLenRef = useRef<number>(0);
  const pendingRef = useRef<string>("");
  const inlineDepthRef = useRef<number>(0); // depth for \( \) and \[ \]
  const inDisplayRef = useRef<boolean>(false); // toggled by $$
  useEffect(() => {
    if (!incremental) return; // handled by the normal effect below
    const el = ref.current;
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
            // Heuristic: treat as inline math delimiter if not escaped and likely not currency
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

        const shouldFlush = hasCloser || hasSentence || finalize || (next.length - lastTypesetLenRef.current > 280);
        if (shouldFlush && pendingRef.current) {
          el.insertAdjacentHTML("beforeend", pendingRef.current);
          lastHtmlRef.current = last + pendingRef.current;
          pendingRef.current = "";

          if (cancelTypesetRef.current) cancelTypesetRef.current();
          cancelTypesetRef.current = scheduleTypeset(el, typesetDelayMs);
          lastTypesetLenRef.current = next.length;
        }
      }
    } else {
      // Content changed in a non-append way; replace fully
      el.innerHTML = next;
      if (cancelTypesetRef.current) cancelTypesetRef.current();
      cancelTypesetRef.current = scheduleTypeset(el, typesetDelayMs);
      lastTypesetLenRef.current = next.length;
    }
    lastHtmlRef.current = next;
    return () => {
      if (cancelTypesetRef.current) cancelTypesetRef.current();
    };
  }, [html, incremental, finalize, typesetDelayMs]);

  // If parent signals completion, flush any remaining pending text
  useEffect(() => {
    if (!incremental) return;
    if (!finalize) return;
    const el = ref.current;
    if (!el) return;
    if (pendingRef.current) {
      el.insertAdjacentHTML("beforeend", pendingRef.current);
      lastHtmlRef.current += pendingRef.current;
      pendingRef.current = "";
      if (cancelTypesetRef.current) cancelTypesetRef.current();
      cancelTypesetRef.current = scheduleTypeset(el, typesetDelayMs);
      lastTypesetLenRef.current = lastHtmlRef.current.length;
    }
  }, [finalize, incremental, typesetDelayMs]);

  // Normal mode: rely on React to set innerHTML, then typeset after paint
  useEffect(() => {
    if (incremental) return; // handled above
    const el = ref.current;
    if (!el) return;

    let cancelTypeset = scheduleTypeset(el, typesetDelayMs);

    // Retypeset when the element becomes visible (covers card swaps)
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        cancelTypeset();
        cancelTypeset = scheduleTypeset(el, typesetDelayMs);
      }
    }, { root: null, threshold: 0.01 });
    obs.observe(el);

    return () => { try { obs.disconnect(); } catch {} try { cancelTypeset(); } catch {} };
  }, [html, incremental, typesetDelayMs]);

  return incremental ? (
    <span ref={ref} />
  ) : (
    <span ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
