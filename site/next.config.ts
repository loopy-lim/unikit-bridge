import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // @unikit-bridge/ui ships TypeScript source — Next compiles it.
  transpilePackages: ["@unikit-bridge/ui"],
};

export default nextConfig;
