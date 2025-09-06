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

export default function FormattedText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isDev = typeof process !== "undefined" && process.env.NODE_ENV !== "production";
  const dbg = (...args: unknown[]) => { if (isDev) console.debug("[FormattedText]", ...args); };

  // Compute the HTML once per `text` value. Using `dangerouslySetInnerHTML`
  // lets React "own" the content so it won't randomly clear MathJax's
  // rendered DOM on unrelated re-renders.
  const html = useMemo(() => {
    let src = text ?? "";
    // Many LLM outputs double-backslashed math delimiters (\\( ... \\)).
    // Normalize those to single-backslash so MathJax recognizes them.
    // Use split/join to avoid regex-escape confusion across build targets
    src = src
      .split("\\\\(").join("\\(")
      .split("\\\\)").join("\\)")
      .split("\\\\[").join("\\[")
      .split("\\\\]").join("\\]");
    dbg("html-build", { len: src.length, preview: src.slice(0, 60) });

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
    const formatText = (s: string) =>
      escapeHtml(s)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_]+)__/g, "<strong>$1</strong>")
        // Avoid single-asterisk/underscore italics to not collide with LaTeX like v_1 or a*b
        .replace(/~~([^~]+)~~/g, "<del>$1</del>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");

    const out = segs.map(({ math, t }) => (math ? escapeHtml(t) : formatText(t))).join("");
    dbg("html-ready", { len: out.length });
    return out;
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Debounce rapid updates during streaming to reduce flicker
    dbg("typeset-schedule");
    const id = window.setTimeout(() => {
      dbg("typeset-run");
      void loadMathJax().then(() => {
        const MathJax = window.MathJax;
        if (!MathJax) { dbg("no-mathjax"); return; }
        const doTypeset = () => {
          try { MathJax.typesetClear?.([el]); } catch (e) { dbg("typesetClear-error", e); }
          return MathJax.typesetPromise?.([el]).then(() => dbg("typeset-done")).catch((e) => dbg("typeset-error", e));
        };
        if (MathJax.startup?.promise) {
          MathJax.startup.promise.then(doTypeset).catch((e) => dbg("startup-promise-error", e));
        } else {
          doTypeset();
        }
      });
    }, 150);

    return () => window.clearTimeout(id);
  }, [html]);

  return <span ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
