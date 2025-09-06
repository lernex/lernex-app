"use client";
import React, { useEffect, useRef } from "react";

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: unknown[]) => Promise<void>;
    };
  }
}

// Render text that may contain LaTeX using MathJax for full compatibility.
export default function FormattedText({ text }: { text: string }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
      const load = () => {
      window.MathJax?.typesetPromise?.([el]).catch(() => {});
    };
    if (window.MathJax) {
      load();
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
    script.async = true;
    script.onload = () => load();
    document.head.appendChild(script);
  }, [text]);
  const cleaned = text
    .replace(/<\/?div[^>]*>/gi, "")
    .replace(/&lt;\/?div[^&]*&gt;/gi, "");

    const formatted = cleaned
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

  return <span ref={spanRef} dangerouslySetInnerHTML={{ __html: formatted }} />;
}