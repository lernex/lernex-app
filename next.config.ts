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

  // Webpack config for better code splitting
  webpack: (config, { isServer }) => {
    // Don't bundle heavy libraries on the server
    if (!isServer) {
      // Mark heavy libraries for code splitting (they're now dynamically imported)
      config.optimization = config.optimization || {};
      config.optimization.splitChunks = config.optimization.splitChunks || {};

      // Create separate chunks for heavy processing libraries
      // This ensures they're loaded on-demand, not in the main bundle
      const splitChunks = config.optimization.splitChunks;
      if (typeof splitChunks === 'object' && splitChunks.cacheGroups) {
        splitChunks.cacheGroups.ffmpeg = {
          test: /[\\/]node_modules[\\/]@ffmpeg[\\/]/,
          name: 'ffmpeg',
          chunks: 'async',
          priority: 20,
        };
        splitChunks.cacheGroups.pdfjs = {
          test: /[\\/]node_modules[\\/]pdfjs-dist[\\/]/,
          name: 'pdfjs',
          chunks: 'async',
          priority: 20,
        };
      }
    }

    return config;
  },

  // Headers for WASM files (FFmpeg, etc.)
  async headers() {
    return [
      {
        source: '/ffmpeg-core.wasm',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/wasm',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/ffmpeg-core.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'text/javascript',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/pdf.worker.min.mjs',
        headers: [
          {
            key: 'Content-Type',
            value: 'text/javascript',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
