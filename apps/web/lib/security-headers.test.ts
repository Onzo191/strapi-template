/**
 * Unit tests for the security header / CSP builder (§9 P7).
 *
 * `qa/e2e/security-headers.spec.ts` asserts the headers are on the wire, which is
 * the delivery guarantee. These cover the *construction* rules that an e2e run
 * cannot reach — the dev-vs-production branch, the empty-allow-list-means-`'none'`
 * behaviour, and the exact origin allow-listing — because getting any of those wrong
 * is a silent weakening rather than a visible failure.
 *
 * Runs with `node --test` (type-stripped), no test framework.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCsp, buildSecurityHeaders, parseOriginList } from "./security-headers.ts";

/**
 * Parse a CSP string into a lookup of directive → sources. Returns an accessor
 * rather than a record so a missing directive reads as `[]`, which keeps the
 * assertions readable under `noUncheckedIndexedAccess`.
 */
function directives(csp: string): (name: string) => string[] {
  const out = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out.set(name, values);
  }
  return (name) => out.get(name) ?? [];
}

describe("buildCsp", () => {
  it("locks down the sinks that contain an injection", () => {
    const d = directives(buildCsp());
    assert.deepEqual(d("object-src"), ["'none'"]);
    assert.deepEqual(d("base-uri"), ["'self'"]);
    assert.deepEqual(d("frame-ancestors"), ["'none'"]);
    assert.deepEqual(d("form-action"), ["'self'"]);
    assert.deepEqual(d("default-src"), ["'self'"]);
  });

  it("allows inline script but never eval in production", () => {
    // `'unsafe-inline'` is forced by App Router's inline flight data on
    // statically-generated pages — see ADR-007. `'unsafe-eval'` is React Refresh
    // only and must never ship.
    const prod = directives(buildCsp({ dev: false }));
    assert.ok(prod("script-src").includes("'unsafe-inline'"));
    assert.ok(!prod("script-src").includes("'unsafe-eval'"));

    const dev = directives(buildCsp({ dev: true }));
    assert.ok(dev("script-src").includes("'unsafe-eval'"));
  });

  it("only opens connect-src to websockets and Strapi in dev", () => {
    const prod = directives(buildCsp({ dev: false, strapiOrigin: "http://localhost:1337" }));
    // In production RSC fetches Strapi server-side, so the browser never needs it.
    // Keeping this closed is what stops an injected script exfiltrating, and what
    // confines the contact-form block's editor-set endpoint to our own origin.
    assert.deepEqual(prod("connect-src"), ["'self'"]);
    assert.ok(!prod("connect-src").includes("ws:"));

    const dev = directives(buildCsp({ dev: true, strapiOrigin: "http://localhost:1337" }));
    assert.ok(dev("connect-src").includes("ws:"));
    assert.ok(dev("connect-src").includes("http://localhost:1337"));
  });

  it("treats an empty embed allow-list as frame-src 'none'", () => {
    // The important default: an editor must not be able to embed an arbitrary
    // third-party document until an origin is explicitly configured.
    assert.deepEqual(directives(buildCsp({}))("frame-src"), ["'none'"]);
    assert.deepEqual(directives(buildCsp({ embedOrigins: [] }))("frame-src"), ["'none'"]);
  });

  it("allow-lists embed origins by origin only, dropping paths", () => {
    const d = directives(
      buildCsp({ embedOrigins: ["https://ir.vng.com.vn/reports", "https://careers.vng.com.vn"] }),
    );
    assert.deepEqual(d("frame-src"), ["https://ir.vng.com.vn", "https://careers.vng.com.vn"]);
  });

  it("ignores an unparseable configured origin instead of emitting it", () => {
    // A typo'd env var must not produce a malformed directive, which browsers
    // handle by ignoring the whole policy.
    const d = directives(buildCsp({ embedOrigins: ["not a url"], cdnOrigin: "also-not-a-url" }));
    assert.deepEqual(d("frame-src"), ["'none'"]);
    assert.deepEqual(d("img-src"), ["'self'", "data:", "blob:"]);
  });

  it("allow-lists the media origins images actually come from", () => {
    const d = directives(
      buildCsp({ strapiOrigin: "http://localhost:1337", cdnOrigin: "https://cdn.vng.com.vn" }),
    );
    assert.deepEqual(d("img-src"), [
      "'self'",
      "data:",
      "blob:",
      "http://localhost:1337",
      "https://cdn.vng.com.vn",
    ]);
  });

  it("upgrades insecure requests only outside dev", () => {
    assert.ok(buildCsp({ dev: false }).includes("upgrade-insecure-requests"));
    assert.ok(!buildCsp({ dev: true }).includes("upgrade-insecure-requests"));
  });

  it("appends a report-uri when configured", () => {
    assert.ok(buildCsp({ reportUri: "/csp-report" }).includes("report-uri /csp-report"));
    assert.ok(!buildCsp().includes("report-uri"));
  });
});

describe("buildSecurityHeaders", () => {
  const byKey = (opts?: Parameters<typeof buildSecurityHeaders>[0]) =>
    Object.fromEntries(buildSecurityHeaders(opts).map((h) => [h.key, h.value]));

  /** Read a header that must be present; fails the test with its name if absent. */
  const required = (headers: Record<string, string | undefined>, key: string): string => {
    const value = headers[key];
    assert.ok(value !== undefined, `missing header ${key}`);
    return value;
  };

  it("emits the full non-CSP header set", () => {
    const h = byKey();
    assert.equal(required(h, "X-Content-Type-Options"), "nosniff");
    assert.equal(required(h, "Referrer-Policy"), "strict-origin-when-cross-origin");
    assert.equal(required(h, "X-Frame-Options"), "DENY");
    assert.equal(required(h, "Cross-Origin-Opener-Policy"), "same-origin");
    assert.equal(required(h, "X-Permitted-Cross-Domain-Policies"), "none");
    assert.equal(required(h, "X-DNS-Prefetch-Control"), "off");
    assert.match(required(h, "Permissions-Policy"), /camera=\(\)/);
    assert.match(required(h, "Permissions-Policy"), /geolocation=\(\)/);
  });

  it("emits HSTS only when asked, and never with preload", () => {
    assert.equal(byKey({ hsts: false })["Strict-Transport-Security"], undefined);
    const value = required(byKey({ hsts: true }), "Strict-Transport-Security");
    assert.match(value, /^max-age=63072000; includeSubDomains$/);
    // `preload` is effectively irreversible and covers every subdomain — an
    // operations decision, not a code one.
    assert.ok(!value.includes("preload"));
  });

  it("switches to report-only on request", () => {
    assert.ok("Content-Security-Policy" in byKey());
    assert.ok(!("Content-Security-Policy" in byKey({ reportOnly: true })));
    assert.ok("Content-Security-Policy-Report-Only" in byKey({ reportOnly: true }));
  });
});

describe("parseOriginList", () => {
  it("splits, trims and drops empties", () => {
    assert.deepEqual(parseOriginList(" https://a.example , https://b.example ,, "), [
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("treats unset and empty as no origins", () => {
    assert.deepEqual(parseOriginList(undefined), []);
    assert.deepEqual(parseOriginList(""), []);
  });
});
