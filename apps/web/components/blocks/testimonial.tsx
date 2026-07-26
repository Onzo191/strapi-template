import type { TestimonialBlock } from "@vng/shared";
import Image from "next/image";
import { resolveMediaUrl } from "@/lib/media";

export function Testimonial(block: TestimonialBlock) {
  return (
    <section className="vng-section vng-section--muted">
      <div className="vng-container">
        {block.heading && <h2 style={{ textAlign: "center" }}>{block.heading}</h2>}
        <div
          className="vng-grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))" }}
        >
          {block.items.map((item) => (
            <blockquote key={item.id} className="vng-card" style={{ padding: "1.5rem", margin: 0 }}>
              <p style={{ fontStyle: "italic" }}>&ldquo;{item.quote}&rdquo;</p>
              <footer
                style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "1rem" }}
              >
                {item.avatar && (
                  <Image
                    src={resolveMediaUrl(item.avatar.url)}
                    alt={item.authorName}
                    width={40}
                    height={40}
                    style={{ borderRadius: "999px", objectFit: "cover" }}
                  />
                )}
                <div>
                  <p style={{ fontWeight: 600, margin: 0 }}>{item.authorName}</p>
                  {(item.authorRole || item.company) && (
                    <p style={{ opacity: 0.7, margin: 0, fontSize: "0.85rem" }}>
                      {[item.authorRole, item.company].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
