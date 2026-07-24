import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are shipped as TypeScript source and compiled by Next.
  transpilePackages: ["@vng/shared", "@vng/design-system"],
};

export default nextConfig;
