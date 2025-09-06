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
          processEscapes: true,
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

  // Compute the HTML once per `text` value. Using `dangerouslySetInnerHTML`
  // lets React "own" the content so it won't randomly clear MathJax's
  // rendered DOM on unrelated re-renders.
  const html = useMemo(() => {
    const raw = text ?? "";

    // Escape any raw HTML coming from the model/user to avoid script injection.
    const escaped = raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Lightweight markdown-ish styling that we explicitly allow.
    return escaped
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Ensure MathJax is loaded, then typeset the element's contents.
    void loadMathJax().then(() => {
      const MathJax = window.MathJax;
      if (!MathJax) return;

      const doTypeset = () => {
        try { MathJax.typesetClear?.([el]); } catch { /* noop */ }
        return MathJax.typesetPromise?.([el]).catch(() => {});
      };

      // If MathJax is still starting up, wait for it before typesetting
      if (MathJax.startup?.promise) {
        MathJax.startup.promise.then(doTypeset).catch(() => {});
      } else {
        doTypeset();
      }
    });
  }, [html]);

  return <span ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
