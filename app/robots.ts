import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/fyp",
          "/auth",
          "/post-auth",
          "/settings",
          "/profile",
          "/friends",
          "/notifications",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
