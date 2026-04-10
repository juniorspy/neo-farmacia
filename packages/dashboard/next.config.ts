import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    dangerouslyAllowSVG: true,
    remotePatterns: [],
    // Allow data: URLs for uploaded logos stored as base64
    unoptimized: true,
  },
};

export default nextConfig;
