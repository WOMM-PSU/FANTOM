import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@fantom/shared", "@fantom/aiming"],
  reactStrictMode: true,
};

export default nextConfig;
