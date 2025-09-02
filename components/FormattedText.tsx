"use client";
import React from "react";

function formatMath(text: string): string {
  let html = text;
  html = html.replace(/\\frac{([^{}]+)}{([^{}]+)}/g, (_, n: string, d: string) =>
    `<span class="inline-block align-middle text-center"><span class="block border-b border-current px-1">${n}</span><span class="block px-1">${d}</span></span>`
  );
  html = html.replace(/([A-Za-z0-9]+)_({?[^\s}]+}?)/g, (m, base: string, sub: string) => `${base}<sub>${sub.replace(/[{}]/g, "")}</sub>`);
  html = html.replace(/([A-Za-z0-9]+)\^({?[^\s}]+}?)/g, (m, base: string, exp: string) => `${base}<sup>${exp.replace(/[{}]/g, "")}</sup>`);
  return html;
}

export default function FormattedText({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: formatMath(text) }} />;
}