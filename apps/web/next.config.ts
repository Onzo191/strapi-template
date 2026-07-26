import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

// next/image only optimizes from allow-listed hosts. Derive the Strapi host
// from STRAPI_URL (local upload provider serves media from the CMS origin
// itself) plus the CDN host once S3/CloudFront is wired (§8.1) — never a
// wildcard, which would let the image optimizer proxy arbitrary hosts.
const strapiHost = new URL(process.env.STRAPI_URL ?? "http://localhost:1337");
const cdnUrl = process.env.CDN_URL ? new URL(process.env.CDN_URL) : undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are shipped as TypeScript source and compiled by Next.
  transpilePackages: ["@vng/shared", "@vng/design-system"],
  images: {
    remotePatterns: [
      {
        protocol: strapiHost.protocol.replace(":", "") as "http" | "https",
        hostname: strapiHost.hostname,
        port: strapiHost.port,
      },
      ...(cdnUrl
        ? [
            {
              protocol: cdnUrl.protocol.replace(":", "") as "http" | "https",
              hostname: cdnUrl.hostname,
            },
          ]
        : []),
    ],
  },
};

export default withNextIntl(nextConfig);
