import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel manages output itself; standalone is only for self-hosting.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  poweredByHeader: false,
  compress: true,
};

export default nextConfig;
