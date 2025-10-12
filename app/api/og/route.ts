import React from "react";
import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/seo";

export const runtime = "edge";

const size = { width: 1200, height: 630 };

export async function GET() {
  const hostname = new URL(siteConfig.url).hostname;

  const element = React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "linear-gradient(135deg, #0f172a 0%, #312e81 55%, #1d4ed8 100%)",
        color: "#f8fafc",
        fontFamily: "sans-serif",
      },
    },
    [
      React.createElement(
        "div",
        {
          key: "header",
          style: { display: "flex", alignItems: "center", gap: "16px" },
        },
        [
          React.createElement(
            "div",
            {
              key: "mark",
              style: {
                width: 72,
                height: 72,
                borderRadius: "20px",
                background: "rgba(15, 118, 110, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 44,
                fontWeight: 700,
                letterSpacing: "-0.04em",
              },
            },
            "Lx"
          ),
          React.createElement(
            "div",
            {
              key: "meta",
              style: { display: "flex", flexDirection: "column" },
            },
            [
              React.createElement(
                "span",
                {
                  key: "label",
                  style: { fontSize: 24, opacity: 0.8 },
                },
                "AI Learning Coach"
              ),
              React.createElement(
                "span",
                {
                  key: "name",
                  style: { fontSize: 36, fontWeight: 700 },
                },
                siteConfig.name
              ),
            ]
          ),
        ]
      ),
      React.createElement(
        "div",
        {
          key: "headline",
          style: { maxWidth: 760, fontSize: 48, lineHeight: 1.1, fontWeight: 700 },
        },
        "Learn faster with adaptive micro-lessons, instant quizzes, and spaced repetition."
      ),
      React.createElement(
        "div",
        {
          key: "footer",
          style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
        },
        [
          React.createElement(
            "div",
            {
              key: "tagline",
              style: { fontSize: 24, opacity: 0.85 },
            },
            siteConfig.tagline
          ),
          React.createElement(
            "div",
            {
              key: "hostname",
              style: { fontSize: 24, fontWeight: 600 },
            },
            hostname
          ),
        ]
      ),
    ]
  );

  return new ImageResponse(element, {
    ...size,
  });
}
