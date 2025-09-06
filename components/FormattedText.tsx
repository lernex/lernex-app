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
let mathJaxPromise: Promise<void> | null = null;

function loadMathJax() {
  if (typeof window === "undefined" || window.MathJax) {
    return Promise.resolve();
  }
  if (!mathJaxPromise) {
    mathJaxPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
      script.async = true;
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }
  return mathJaxPromise;
}

export default function FormattedText({ text }: { text: string }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
      loadMathJax().then(() => {
      window.MathJax?.typesetPromise?.([el]).catch(() => {});
    });
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