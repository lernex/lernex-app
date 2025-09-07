"use client";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

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

function loadMathJax() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.MathJax) {
    return Promise.resolve();
  }

  if (!mathJaxPromise) {
    mathJaxPromise = new Promise((resolve) => {
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

      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }

  return mathJaxPromise;
}

export default function FormattedText({ text, incremental = false }: { text: string; incremental?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const dbg = useCallback((...args: unknown[]) => {
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      console.debug("[FormattedText]", ...args);
    }
  }, []);

  // Compute the HTML once per `text` value. Using `dangerouslySetInnerHTML`
  // lets React "own" the content so it won't randomly clear MathJax's
  // rendered DOM on unrelated re-renders.
  const html = useMemo(() => {
    let src = text ?? "";
    // Many LLM outputs double-backslashed math delimiters/macros.
    // Normalize those to single-backslash so MathJax recognizes them.
    // Use split/join to avoid regex-escape confusion across build targets
    src = src
      .split("\\\\(").join("\\(")
      .split("\\\\)").join("\\)")
      .split("\\\\[").join("\\[")
      .split("\\\\]").join("\\]");
    dbg("html-build", { len: src.length, preview: src.slice(0, 60) });

    // Balance unmatched math delimiters at the end of the text so truncated
    // generations still render (e.g., an opening "\\(" with no closing).
    {
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
      while (stack.length) {
        const open = stack.pop();
        src += open === "\\(" ? "\\)" : "\\]";
      }
      if (displayOpen) src += "$$";
    }

    // 1) Escape HTML first
    const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 2) Split into math vs. non-math segments so formatting never touches LaTeX
    type Seg = { math: boolean; t: string };
    const segs: Seg[] = [];
    let i = 0;
    let start = 0;
    let inMath = false;
    let opener: "\\(" | "\\[" | "$$" | null = null;

    const commit = (end: number) => {
      if (end > start) segs.push({ math: inMath, t: src.slice(start, end) });
      start = end;
    };

    while (i < src.length) {
      if (!inMath) {
        if (src.startsWith("\\(", i) || src.startsWith("\\[", i) || src.startsWith("$$", i)) {
          commit(i);
          opener = src.startsWith("\\(", i) ? "\\(" : src.startsWith("\\[", i) ? "\\[" : "$$";
          inMath = true;
          i += opener.length; // include opener later when we close
        } else {
          i++;
        }
      } else {
        const close = opener === "\\(" ? "\\)" : opener === "\\[" ? "\\]" : "$$";
        if (src.startsWith(close, i)) {
          i += close.length; // move past the closer
          commit(i); // push math segment (includes opener..closer)
          inMath = false;
          opener = null;
        } else {
          i++;
        }
      }
    }
    commit(src.length);

    // 3) Render: escape HTML in both; apply minimal markdown only to text segments.
    const formatText = (s: string) => {
      let out = escapeHtml(s);
      // Minimal markdown formatting
      out = out
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_]+)__/g, "<strong>$1</strong>")
        .replace(/~~([^~]+)~~/g, "<del>$1</del>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");

      // Heuristic: auto-wrap obvious TeX runs that lack delimiters so MathJax
      // can parse them. We only do this inside non-math segments.
      const wrap = (tex: string) => `\\(${tex}\\)`; // inline math delimiters

      // 1) Environments like \begin{pmatrix} ... \end{pmatrix}
      out = out.replace(/\\begin\{([^}]+)\}[\s\S]*?\\end\{\1\}/g, (m) => wrap(m));

      // 2) Common macros with braces (one or two args)
      out = out.replace(
        /\\(?:frac|sqrt|vec|mathbf|mathbb|mathcal|hat|bar|underline|overline|binom|pmatrix|bmatrix|vmatrix)\b(?:\{[^{}]*\}){1,2}/g,
        (m) => wrap(m)
      );

      // 3) Greek and simple math operators (no braces)
      out = out.replace(
        /\\(?:alpha|beta|gamma|delta|theta|phi|pi|mu|sigma|omega|cdot|times|pm|leq|geq)\b/g,
        (m) => wrap(m)
      );

      // 4) Subscripts like v_1 or x_{ij}
      out = out.replace(/([A-Za-z]+)_(\{[^}]+\}|\d+|[A-Za-z])/g, (_m, a, b) => wrap(`${a}_${b}`));

      // 5) Norms: || ... ||
      out = out.replace(/\|\|([^|]{1,80})\|\|/g, (_m, inner) => wrap(`\\| ${inner.trim()} \\|`));

      // 6) Angle brackets: ⟨ a, b ⟩ → \langle a, b \rangle
      out = out.replace(/⟨([^⟩]{1,80})⟩/g, (_m, inner) => wrap(`\\langle ${inner.trim()} \\rangle`));

      // 7) Unicode square root: √(expr) or √n → \sqrt{...}
      out = out.replace(/√\s*\(?([0-9A-Za-z+\-*/^\s,.]+?)\)?(?=(\s|[.,;:)\]]|$))/g, (_m, inner) => wrap(`\\sqrt{${inner.trim()}}`));

      return out;
    };

    const fixMacros = (s: string) => {
      // Collapse accidental double-backslashes before common macros, but keep
      // true linebreaks (\\) intact.
      const macros = [
        "langle","rangle","vec","mathbf","mathbb","mathcal","hat","bar","underline","overline",
        "cdot","times","pm","leq","geq","frac","sqrt","binom","pmatrix","bmatrix","vmatrix","begin","end"
      ].join("|");
      const reDouble = new RegExp('\\\\\\\\(?=(' + macros + ')\\b)', 'g');
      s = s.replace(reDouble, '\\');
      // If a macro name appears without a backslash in math (rare), add one
      s = s.replace(/(^|[^\\])(langle|rangle|mathbf|sqrt|frac|vec|binom)\b/g, '$1\\$2');
      // Normalize one-letter macro arguments like \mathbfv -> \mathbf{v}
      s = s.replace(/\\mathbf([A-Za-z])(?![A-Za-z])/g, '\\mathbf{$1}');
      s = s.replace(/\\vec([A-Za-z])(?![A-Za-z])/g, '\\vec{$1}');
      s = s.replace(/\\hat([A-Za-z])(?![A-Za-z])/g, '\\hat{$1}');
      s = s.replace(/\\bar([A-Za-z])(?![A-Za-z])/g, '\\bar{$1}');
      return s;
    };

    const out = segs
      .map(({ math, t }) => (math ? escapeHtml(fixMacros(t)) : formatText(t)))
      .join("");
    dbg("html-ready", { len: out.length });
    return out;
  }, [text, dbg]);

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
        const tokenRe = /\\\(|\\\[|\\\)|\\\]|\$\$/g;
        let m: RegExpExecArray | null;
        while ((m = tokenRe.exec(delta))) {
          const t = m[0];
          if (t === "\\(" || t === "\\[") inlineDepthRef.current += 1;
          else if (t === "\\)" || t === "\\]") inlineDepthRef.current = Math.max(0, inlineDepthRef.current - 1);
          else if (t === "$$") inDisplayRef.current = !inDisplayRef.current;
        }

        // Buffer until we hit a safe boundary: a closing delimiter that leaves
        // us outside math, or a sentence boundary while outside math.
        pendingRef.current += delta;

        const outsideMath = inlineDepthRef.current === 0 && !inDisplayRef.current;
        const hasCloser = /\\\)|\\\]|\$\$/.test(delta) && outsideMath;

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

        const shouldFlush = hasCloser || hasSentence || (next.length - lastTypesetLenRef.current > 280);
        if (shouldFlush && pendingRef.current) {
          el.insertAdjacentHTML("beforeend", pendingRef.current);
          lastHtmlRef.current = last + pendingRef.current;
          pendingRef.current = "";

          const schedule = () => {
            dbg("typeset-schedule");
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                dbg("typeset-run");
                void loadMathJax().then(() => {
                  const MathJax = window.MathJax;
                  if (!MathJax) { dbg("no-mathjax"); return; }
                  const doTypeset = () => MathJax.typesetPromise?.([el])
                    ?.then(() => dbg("typeset-done"))
                    .catch((e) => dbg("typeset-error", e));
                  if (MathJax.startup?.promise) {
                    MathJax.startup.promise.then(doTypeset).catch((e) => dbg("startup-promise-error", e));
                  } else {
                    doTypeset();
                  }
                });
              });
            });
          };
          schedule();
          lastTypesetLenRef.current = next.length;
        }
      }
    } else {
      // Content changed in a non-append way; replace fully
      el.innerHTML = next;
      // Full replace → run a local typeset once
      const schedule = () => {
        dbg("typeset-schedule");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            dbg("typeset-run");
            void loadMathJax().then(() => {
              const MathJax = window.MathJax;
              if (!MathJax) { dbg("no-mathjax"); return; }
              const doTypeset = () => MathJax.typesetPromise?.([el])
                ?.then(() => dbg("typeset-done"))
                .catch((e) => dbg("typeset-error", e));
              if (MathJax.startup?.promise) {
                MathJax.startup.promise.then(doTypeset).catch((e) => dbg("startup-promise-error", e));
              } else {
                doTypeset();
              }
            });
          });
        });
      };
      schedule();
      lastTypesetLenRef.current = next.length;
    }
    lastHtmlRef.current = next;
    // No cleanup necessary; we never schedule long timers in incremental path
  }, [html, incremental, dbg]);

  // Normal mode: rely on React to set innerHTML, then typeset after paint
  useEffect(() => {
    if (incremental) return; // handled above
    const el = ref.current;
    if (!el) return;

    const schedule = () => {
      dbg("typeset-schedule");
      // Delay slightly, then double-rAF to ensure the DOM is painted
      window.setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            dbg("typeset-run");
            void loadMathJax().then(() => {
              const MathJax = window.MathJax;
              if (!MathJax) { dbg("no-mathjax"); return; }
              const doTypeset = () => {
                // Try scoping by element, then parent, then whole doc as a last resort
                const parent = el.parentElement ?? undefined;
                const tryLocal = () => MathJax.typesetPromise?.([el]).catch(() => {});
                const tryParent = () => parent ? MathJax.typesetPromise?.([parent]).catch(() => {}) : Promise.resolve();
                const tryGlobal = () => MathJax.typesetPromise?.().catch(() => {});

                return (tryLocal() as Promise<void> | undefined)
                  ?.then(() => {
                    if (!el.querySelector("mjx-container")) return tryParent();
                  })
                  .then(() => {
                    if (!el.querySelector("mjx-container")) return tryGlobal();
                  })
                  .then(() => {
                    dbg(el.querySelector("mjx-container") ? "typeset-done" : "typeset-fallback-global-done");
                  })
                  .catch((e) => dbg("typeset-error", e));
              };
              if (MathJax.startup?.promise) {
                MathJax.startup.promise
                  .then(doTypeset)
                  .catch((e) => dbg("startup-promise-error", e));
              } else {
                doTypeset();
              }
            });
          });
        });
      }, 120);
    };

    schedule();

    // Retypeset when the element becomes visible (covers card swaps)
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) schedule();
    }, { root: null, threshold: 0.01 });
    obs.observe(el);

    return () => { try { obs.disconnect(); } catch {} };
  }, [html, incremental, dbg]);

  return incremental ? (
    <span ref={ref} />
  ) : (
    <span ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
