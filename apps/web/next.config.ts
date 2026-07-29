import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { buildSecurityHeaders, parseOriginList } from "./lib/security-headers";

const withNextIntl = createNextIntlPlugin();

// next/image only optimizes from allow-listed hosts. Derive the Strapi host
// from STRAPI_URL (local upload provider serves media from the CMS origin
// itself) plus the CDN host once S3/CloudFront is wired (§8.1) — never a
// wildcard, which would let the image optimizer proxy arbitrary hosts.
// An env var set to the empty string counts as absent. Docker turns an unset
// `--build-arg FOO=` into `FOO=""` rather than leaving it undefined, so `??`
// alone would hand `new URL("")` an empty string and crash the build.
const envUrl = (name: string): string | undefined => {
  const raw = process.env[name]?.trim();
  return raw === "" ? undefined : raw;
};

const strapiHost = new URL(envUrl("STRAPI_URL") ?? "http://localhost:1337");
const cdnRaw = envUrl("CDN_URL");
const cdnUrl = cdnRaw ? new URL(cdnRaw) : undefined;

const isProd = process.env.NODE_ENV === "production";

// Security headers + CSP (§9 P7). Static — so ISR-cached HTML carries them too;
// see lib/security-headers.ts for why there is no per-request nonce.
const securityHeaders = buildSecurityHeaders({
  strapiOrigin: strapiHost.origin,
  cdnOrigin: cdnUrl?.origin,
  embedOrigins: parseOriginList(envUrl("EMBED_ALLOWED_ORIGINS")),
  dev: !isProd,
  // HSTS is meaningless (and confusing) over the plain-http local stack.
  hsts: isProd && envUrl("DISABLE_HSTS") !== "true",
  reportOnly: envUrl("CSP_REPORT_ONLY") === "true",
  reportUri: envUrl("CSP_REPORT_URI"),
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework version to scanners.
  poweredByHeader: false,
  // Workspace packages are shipped as TypeScript source and compiled by Next.
  transpilePackages: ["@vng/shared", "@vng/design-system"],
  // No custom `cacheHandler`: the ISR cache is Next's own default (in-memory +
  // filesystem, per instance). That is correct for the single-instance
  // deployment this app targets — `revalidateTag()` runs in the same process
  // that serves pages, so a publish webhook invalidates the only cache there is.
  // Scaling past one instance would reintroduce the problem a shared cache
  // solves (a webhook to instance A leaving B stale); ADR-008 records that
  // trade-off and what to restore.
  images: {
    // Explicit rather than relying on Next's default — §6.4 calls for AVIF/WebP.
    formats: ["image/avif", "image/webp"],
    // The optimizer will not inline SVG: an attacker-supplied SVG is an HTML
    // document with script, and serving it from our own origin would sidestep
    // the CSP entirely. Next's default is already `false`; pinned so a future
    // "just let editors upload SVG logos" change has to be deliberate.
    dangerouslyAllowSVG: false,
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
  async headers() {
    return [
      {
        // Everything, including `_next/static` and the Route Handlers.
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // The revalidate/preview endpoints must never be cached by CloudFront
        // or a corporate proxy — a cached 200 would silently swallow real
        // invalidations (§5.3) and a cached preview redirect would leak draft
        // access to the next visitor.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
          // These endpoints are never cross-origin-readable.
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
