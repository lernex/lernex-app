"use client";
import React from "react";

function formatMath(text: string): string {
  let html = text;

  // Handle inline LaTeX delimiters like \( ... \) by recursively formatting the content
  html = html.replace(/\\\((.+?)\\\)/g, (_, expr: string) => formatMath(expr));

  // Remove common LaTeX helpers
  html = html.replace(/\text{([^}]+)}/g, "$1");
  html = html.replace(/\left|\right/g, "");

  // Common LaTeX style commands
  html = html.replace(/\mathbf{([^}]+)}/g, "<strong>$1</strong>");
  html = html.replace(/\textbf{([^}]+)}/g, "<strong>$1</strong>");
  html = html.replace(/\textit{([^}]+)}/g, "<em>$1</em>");
  html = html.replace(/\emph{([^}]+)}/g, "<em>$1</em>");

  // Unescape common delimiters
  html = html.replace(/\\([|()_*~\x60])/g, "$1");

  // Basic markdown style formatting
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  const fractionReplacer = (_: string, n: string, d: string) =>
    `<span class="inline-block align-middle text-center"><span class="block border-b border-current px-1">${formatMath(n)}</span><span class="block px-1">${formatMath(d)}</span></span>`;

  // Fractions written as \frac{a}{b}
  html = html.replace(/\frac{([^{}]+)}{([^{}]+)}/g, fractionReplacer);

  // Fractions wrapped in parentheses like (a)/(b)
  html = html.replace(/\(([^()]+)\)\/\(([^()]+)\)/g, fractionReplacer);

  // Simple numeric or single-letter fractions like 4/5 or x/y
  html = html.replace(/\b(-?\d+)\/(-?\d+)\b/g, fractionReplacer);
  html = html.replace(/\b([A-Za-z])\/([A-Za-z])\b/g, fractionReplacer);

  // Subscripts and superscripts
  html = html.replace(/([A-Za-z0-9]+)_({?[^\s}]+}?)/g, (m, base: string, sub: string) =>
    `${base}<sub>${sub.replace(/[{}]/g, "")}</sub>`
  );
  html = html.replace(/([A-Za-z0-9]+)\^({?[^\s}]+}?)/g, (m, base: string, exp: string) =>
    `${base}<sup>${exp.replace(/[{}]/g, "")}</sup>`
  );

  // Square roots \sqrt{n} or sqrt(n)
  const sqrtReplacer = (_: string, radicand: string) =>
    `<span class="inline-block align-middle"><span class="text-xl">&radic;</span><span class="border-t border-current inline-block pl-1">${formatMath(radicand)}</span></span>`;
  html = html.replace(/\sqrt{([^{}]+)}/g, sqrtReplacer);
  html = html.replace(/sqrt\(([^()]+)\)/g, sqrtReplacer);

  // Basic LaTeX symbol replacements
  const symbols: Record<string, string> = {
    "\\alpha": "&alpha;",
    "\\beta": "&beta;",
    "\\gamma": "&gamma;",
    "\\delta": "&delta;",
    "\\epsilon": "&epsilon;",
    "\\theta": "&theta;",
    "\\lambda": "&lambda;",
    "\\mu": "&mu;",
    "\\pi": "&pi;",
    "\\sigma": "&sigma;",
    "\\phi": "&phi;",
    "\\omega": "&omega;",
    "\\infty": "&infin;",
    "\\cdot": "&middot;",
    "\\times": "&times;",
    "\\pm": "&plusmn;",
    "\\mp": "∓",
    "\\leq": "&le;",
    "\\le": "&le;",
    "\\geq": "&ge;",
    "\\ge": "&ge;",
    "\\neq": "&ne;",
    "\\approx": "&approx;",
    "\\partial": "&part;",
    "\\nabla": "&nabla;",
    "\\sum": "&sum;",
    "\\prod": "&prod;",
    "\\int": "&int;",
    "\\rightarrow": "&rarr;",
    "\\leftarrow": "&larr;",
    "\\Rightarrow": "&rArr;",
    "\\Leftarrow": "&lArr;",
    "\\langle": "&lang;",
    "\\rangle": "&rang;",
  };

  for (const [key, value] of Object.entries(symbols)) {
    html = html.replaceAll(key, value);
  }

  // Overline and underline helpers
  html = html.replace(/\overline{([^{}]+)}/g, '<span style="text-decoration: overline;">$1</span>');
  html = html.replace(/\\underline{([^{}]+)}/g, '<span style="text-decoration: underline;">$1</span>');

  return html;
}

export default function FormattedText({ text }: { text: string }) {
  const segments = text
    .split(/<\/?div[^>]*>/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <>
      {segments.map((seg, i) => (
        <span
          key={i}
          className={segments.length > 1 ? "block" : undefined}
          dangerouslySetInnerHTML={{ __html: formatMath(seg) }}
        />
      ))}
    </>
  );
}
   