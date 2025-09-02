"use client";
import React from "react";

function formatMath(text: string): string {
  let html = text;

  // Handle inline LaTeX delimiters like \( ... \) by recursively formatting the content
  html = html.replace(/\\\((.+?)\\\)/g, (_, expr: string) => formatMath(expr));

  // Basic markdown style formatting
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  const fractionReplacer = (_: string, n: string, d: string) =>
    `<span class="inline-block align-middle text-center"><span class="block border-b border-current px-1">${formatMath(n)}</span><span class="block px-1">${formatMath(d)}</span></span>`;

  // Fractions written as \frac{a}{b}
  html = html.replace(/\\frac{([^{}]+)}{([^{}]+)}/g, fractionReplacer);

  // Fractions wrapped in parentheses like (a)/(b)
  html = html.replace(/\(([^()]+)\)\/\(([^()]+)\)/g, fractionReplacer);

  // Simple numeric fractions like 4/5
  html = html.replace(/\b(-?\d+)\/(-?\d+)\b/g, fractionReplacer);

  // Subscripts and superscripts
  html = html.replace(/([A-Za-z0-9]+)_({?[^\s}]+}?)/g, (m, base: string, sub: string) =>
    `${base}<sub>${sub.replace(/[{}]/g, "")}</sub>`
  );
  html = html.replace(/([A-Za-z0-9]+)\^({?[^\s}]+}?)/g, (m, base: string, exp: string) =>
    `${base}<sup>${exp.replace(/[{}]/g, "")}</sup>`
  );

  // Square roots \sqrt{n} or sqrt(n)
  const sqrtReplacer = (_: string, radicand: string) =>
    `<span class="inline-block align-middle"><span class="text-xl">&radic;</span><span class="border-t border-current inline-block pl-1">${radicand}</span></span>`;
  html = html.replace(/\\sqrt{([^{}]+)}/g, sqrtReplacer);
  html = html.replace(/sqrt\(([^()]+)\)/g, sqrtReplacer);

  return html;
}

export default function FormattedText({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: formatMath(text) }} />;
}