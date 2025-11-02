import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow external avatars (Google OAuth, etc.)
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
    // Modern formats where supported, with automatic fallback to original format
    formats: ["image/avif", "image/webp"],
    // Enable automatic image optimization with fallbacks
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // Compiler options for better browser compatibility
  compiler: {
    // Remove console logs in production for smaller bundle
    removeConsole: process.env.NODE_ENV === "production" ? {
      exclude: ["error", "warn"],
    } : false,
  },

  // Experimental features for better compatibility
  experimental: {
    // Optimize package imports for smaller bundles
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
