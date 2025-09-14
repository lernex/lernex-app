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
    // Modern formats where supported
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
