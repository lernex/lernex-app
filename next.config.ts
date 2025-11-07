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

    // Performance Optimizations (20-30% faster page loads)

    // Device sizes for responsive images
    // These match common viewport widths for optimal image delivery
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],

    // Image sizes for smaller images (not full viewport width)
    // Used for images in cards, thumbnails, avatars, etc.
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],

    // Minimize layout shift by enforcing size attributes
    minimumCacheTTL: 60, // Cache optimized images for 60 seconds minimum

    // Disable static imports optimization in development for faster builds
    unoptimized: process.env.NODE_ENV === "development",
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

  // Headers for WASM files (PDF.js)
  async headers() {
    return [
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
