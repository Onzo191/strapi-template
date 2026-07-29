#!/usr/bin/env node
/**
 * Load test for the on-demand revalidation path (§5.3, P7 "load-test the
 * revalidate path").
 *
 * ## What this measures, and why it is the right thing to measure
 *
 * The revalidate endpoint itself is trivially fast — verify an HMAC, stamp some
 * Redis keys. Benchmarking *that* would tell us nothing useful. The risk in this
 * architecture is the **second-order effect**: every accepted webhook invalidates
 * a tag cluster-wide, and the next request for each affected page is a cache MISS
 * that regenerates by fetching Strapi. A bulk publish of 200 articles therefore
 * turns into a burst of origin regeneration against RDS, at exactly the moment an
 * editor is watching to see their change go live.
 *
 * So this drives three phases and reports all three:
 *
 *   1. **warm**   — request the target pages until they are cached (HITs).
 *   2. **burst**  — fire N signed revalidations at the configured concurrency,
 *                   measuring the endpoint's own latency and error rate.
 *   3. **recover**— immediately re-request the pages and measure how long the
 *                   first post-invalidation (regenerating) response takes.
 *
 * Phase 3 is the number that matters for the < 2 s freshness claim in P3's DoD,
 * and phase 2's error rate is what tells you whether the rate limiter is sized
 * correctly for a real bulk publish.
 *
 * ## Usage
 *
 *   REVALIDATE_SECRET=... node qa/load/revalidate-load.mjs \
 *     --base http://localhost:3000 \
 *     --requests 200 --concurrency 20
 *
 * Options
 *   --base         web origin (default http://localhost:3000)
 *   --requests     total revalidations to send (default 200)
 *   --concurrency  in-flight revalidations (default 20)
 *   --paths        comma-separated pages to warm/recover
 *                  (default /vi,/vi/tin-tuc,/vi/tin-tuc/vng-ra-mat-nen-tang-ai)
 *   --model        payload model (default article)
 *   --slug         payload slug (default vng-ra-mat-nen-tang-ai)
 *   --locale       payload locale (default vi)
 *
 * Exits non-zero when a threshold is breached, so it can gate a staging deploy:
 *   --max-p95      fail if revalidate p95 exceeds this (ms, default 500)
 *   --max-recover  fail if first-hit-after-invalidation p95 exceeds this
 *                  (ms, default 2000 — the §A4 freshness target)
 *   --max-errors   fail if the non-2xx/429 rate exceeds this fraction (default 0.01)
 *
 * Deliberately dependency-free (node:crypto + global fetch) so it runs from a CI
 * container with nothing installed.
 */
import { createHmac } from "node:crypto";

const SIGNATURE_HEADER = "x-vng-signature";
const TIMESTAMP_HEADER = "x-vng-timestamp";

function parseArgs(argv) {
  const args = {
    base: "http://localhost:3000",
    requests: 200,
    concurrency: 20,
    paths: "/vi,/vi/tin-tuc,/vi/tin-tuc/vng-ra-mat-nen-tang-ai",
    model: "article",
    slug: "vng-ra-mat-nen-tang-ai",
    locale: "vi",
    "max-p95": 500,
    "max-recover": 2000,
    "max-errors": 0.01,
  };
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (key === undefined || value === undefined) continue;
    args[key] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  }
  return args;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function summarise(label, samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    label,
    count: sorted.length,
    min: Math.round(sorted[0] ?? 0),
    mean: Math.round(sum / (sorted.length || 1)),
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    max: Math.round(sorted[sorted.length - 1] ?? 0),
  };
}

function table(rows) {
  const cols = ["label", "count", "min", "mean", "p50", "p95", "p99", "max"];
  const widths = cols.map((col) =>
    Math.max(col.length, ...rows.map((row) => String(row[col]).length)),
  );
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join("  ");
  return [
    line(cols),
    line(widths.map((w) => "-".repeat(w))),
    ...rows.map((r) => line(cols.map((c) => r[c]))),
  ].join("\n");
}

/** One signed revalidation POST. Returns `{ ms, status }`. */
async function revalidateOnce(base, secret, payload) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

  const started = performance.now();
  try {
    const res = await fetch(new URL("/api/revalidate", base), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SIGNATURE_HEADER]: signature,
        [TIMESTAMP_HEADER]: timestamp,
      },
      body,
    });
    // Drain the body — leaving it unread keeps the socket busy and skews timings.
    await res.text();
    return { ms: performance.now() - started, status: res.status };
  } catch (err) {
    return { ms: performance.now() - started, status: 0, error: err.message };
  }
}

/** Fetch a page and report latency plus Next's cache disposition, if exposed. */
async function fetchPage(base, path) {
  const started = performance.now();
  try {
    const res = await fetch(new URL(path, base), { headers: { accept: "text/html" } });
    await res.text();
    return {
      ms: performance.now() - started,
      status: res.status,
      cache: res.headers.get("x-nextjs-cache") ?? "-",
    };
  } catch (err) {
    return { ms: performance.now() - started, status: 0, cache: "-", error: err.message };
  }
}

/** Run `total` tasks with at most `concurrency` in flight. */
async function pool(total, concurrency, task) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (true) {
      const index = next++;
      if (index >= total) return;
      results.push(await task(index));
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    console.error("REVALIDATE_SECRET must be set (it must match the web app's).");
    process.exit(2);
  }

  const paths = String(args.paths)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const payload = { model: args.model, slug: args.slug, locale: args.locale };

  console.log(
    `revalidate load test → ${args.base}\n` +
      `  ${args.requests} requests, concurrency ${args.concurrency}\n` +
      `  payload: ${JSON.stringify(payload)}\n` +
      `  pages:   ${paths.join(", ")}\n`,
  );

  // ── Phase 1: warm ────────────────────────────────────────────────────────
  // Two passes: the first populates, the second should be served from cache.
  for (let pass = 0; pass < 2; pass += 1) {
    await Promise.all(paths.map((path) => fetchPage(args.base, path)));
  }
  const warm = await Promise.all(paths.map((path) => fetchPage(args.base, path)));
  console.log("phase 1 — warm");
  for (const [i, result] of warm.entries()) {
    console.log(
      `  ${paths[i]} → ${result.status} in ${Math.round(result.ms)}ms (cache: ${result.cache})`,
    );
  }
  console.log();

  // ── Phase 2: burst ───────────────────────────────────────────────────────
  const burstStarted = performance.now();
  const burst = await pool(Number(args.requests), Number(args.concurrency), () =>
    revalidateOnce(args.base, secret, payload),
  );
  const burstSeconds = (performance.now() - burstStarted) / 1000;

  const accepted = burst.filter((r) => r.status >= 200 && r.status < 300);
  const throttled = burst.filter((r) => r.status === 429);
  const failed = burst.filter((r) => r.status !== 429 && (r.status < 200 || r.status >= 300));

  console.log("phase 2 — revalidate burst");
  console.log(
    `  ${burst.length} sent in ${burstSeconds.toFixed(2)}s ` +
      `(${Math.round(burst.length / burstSeconds)} req/s)\n` +
      `  accepted ${accepted.length}  throttled(429) ${throttled.length}  failed ${failed.length}`,
  );
  if (failed.length > 0) {
    const byStatus = new Map();
    for (const r of failed) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    console.log(`  failure breakdown: ${[...byStatus].map(([s, n]) => `${s}×${n}`).join(", ")}`);
    const firstError = failed.find((r) => r.error);
    if (firstError) console.log(`  first transport error: ${firstError.error}`);
  }
  console.log();

  // ── Phase 3: recover ─────────────────────────────────────────────────────
  // The tag was just invalidated, so each of these is a regenerating MISS. This
  // is the freshness number that P3's DoD ("< 2s without rebuild") claims.
  const recover = [];
  for (const path of paths) {
    recover.push({ path, ...(await fetchPage(args.base, path)) });
  }
  console.log("phase 3 — first request after invalidation (regenerating)");
  for (const result of recover) {
    console.log(
      `  ${result.path} → ${result.status} in ${Math.round(result.ms)}ms (cache: ${result.cache})`,
    );
  }
  console.log();

  // ── Report + thresholds ──────────────────────────────────────────────────
  const revalidateStats = summarise(
    "revalidate",
    accepted.map((r) => r.ms),
  );
  const recoverStats = summarise(
    "recover",
    recover.map((r) => r.ms),
  );
  console.log(table([revalidateStats, recoverStats]));
  console.log();

  const errorRate = failed.length / (burst.length || 1);
  const failures = [];
  if (revalidateStats.p95 > Number(args["max-p95"])) {
    failures.push(`revalidate p95 ${revalidateStats.p95}ms > ${args["max-p95"]}ms`);
  }
  if (recoverStats.p95 > Number(args["max-recover"])) {
    failures.push(
      `post-invalidation p95 ${recoverStats.p95}ms > ${args["max-recover"]}ms ` +
        "(the §A4 < 2s freshness target)",
    );
  }
  if (errorRate > Number(args["max-errors"])) {
    failures.push(
      `error rate ${(errorRate * 100).toFixed(2)}% > ${(Number(args["max-errors"]) * 100).toFixed(2)}%`,
    );
  }
  // 429s are not counted as errors — they mean the rate limiter is working. But
  // a burst that is *mostly* throttled means the limit is mis-sized for a real
  // bulk publish, which is worth surfacing.
  if (throttled.length > burst.length / 2) {
    failures.push(
      `${throttled.length}/${burst.length} requests were rate-limited — raise ` +
        "REVALIDATE_RATE_LIMIT or lower the burst size",
    );
  }

  if (failures.length > 0) {
    console.error(`FAIL\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log("PASS — all thresholds met");
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
