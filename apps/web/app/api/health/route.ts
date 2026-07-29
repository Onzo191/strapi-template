import { NextResponse } from "next/server";

/**
 * Liveness probe for the web tier.
 *
 * `apps/web/Dockerfile`'s `HEALTHCHECK` and the ECS/ALB target group both probe
 * `/api/health`. The route was missing, so the probe 404'd and **every** web task
 * reported unhealthy — locally it shows as `Up (unhealthy)`, and on ECS it means a
 * deployment never stabilises and rolls back. This is the route that makes the existing
 * probe true.
 *
 * ## What it deliberately does NOT check
 *
 * It does not touch Strapi. That is the important design decision, not an omission:
 * if this probe depended on the **CMS**, a Strapi blip would fail the web app's health
 * check and the orchestrator would restart it — turning a recoverable CMS incident into
 * a total site outage. The render path is explicitly built to survive a CMS outage
 * (`lib/prerender.ts` `loadResilient`, plus ISR serving already-cached HTML), so the web
 * app is genuinely healthy while the CMS is down and must keep saying so.
 *
 * A probe should answer "should traffic be routed to this instance?" — and it should,
 * because this instance can still serve pages. Dependency health belongs in monitoring
 * and alerting, where a human decides, not in a check that automatically destroys
 * capacity.
 *
 * The body is deliberately minimal: this endpoint is reachable through the ALB, so it
 * must not become a version/build-info disclosure.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok" },
    {
      status: 200,
      // `next.config.ts` already sets `no-store` for `/api/:path*`; repeated here so
      // the guarantee survives someone narrowing that header rule.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
