import { cn } from "@vng/design-system";
import { type EmbedBlock, safeFrameSrc } from "@vng/shared";

const ASPECT_CLASS: Record<EmbedBlock["aspectRatio"], string> = {
  "16:9": "aspect-video",
  "4:3": "aspect-4/3",
  "1:1": "aspect-square",
};

/**
 * External iframe embed (IR / BU / DMF, §0 A7 — those sites stay embedded/linked,
 * not re-platformed). Only `url` renders: `embedCode` is unsanitized editor-supplied
 * HTML and is intentionally never injected via `dangerouslySetInnerHTML`.
 *
 * Three layers guard the `src`, because it is editor-controlled:
 *  1. `safeFrameSrc` requires an absolute `https:` URL — no `javascript:` (which
 *     legacy engines still execute in a frame) and no `data:text/html`.
 *  2. CSP `frame-src` (see `lib/security-headers.ts`) is an explicit
 *     `EMBED_ALLOWED_ORIGINS` allow-list, so even a valid https URL to an
 *     unapproved host is blocked by the browser.
 *  3. `sandbox` keeps the framed document from reaching back into this page:
 *     `allow-same-origin` is deliberately absent, so it runs in an opaque origin
 *     and cannot touch our cookies, storage or DOM, and `allow-top-navigation`
 *     is absent so it cannot navigate the parent away.
 */
export function Embed(block: EmbedBlock) {
  const src = safeFrameSrc(block.url, {
    // Local dev serves the CMS and any stub embed over plain http.
    allowInsecure: process.env.NODE_ENV !== "production",
  });

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        {block.title && <h2 className="mb-4 text-2xl font-semibold">{block.title}</h2>}
        <div
          className={cn(
            "w-full overflow-hidden rounded-xl bg-muted",
            !block.height && ASPECT_CLASS[block.aspectRatio],
          )}
          style={block.height ? { height: block.height } : undefined}
        >
          {src && (
            <iframe
              src={src}
              title={block.title ?? "Embedded content"}
              loading="lazy"
              className="size-full border-0"
              allowFullScreen
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
        </div>
      </div>
    </section>
  );
}
