import type { TimelineBlock } from "@vng/shared";
import Image from "next/image";
import { resolveMediaUrl } from "@/lib/media";

export function Timeline(block: TimelineBlock) {
  return (
    <section className="vng-section">
      <div className="vng-container" style={{ maxWidth: "48rem" }}>
        {block.heading && <h2>{block.heading}</h2>}
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {block.events.map((event) => (
            <li
              key={event.id}
              style={{
                borderLeft: "2px solid var(--vng-border)",
                paddingLeft: "1.25rem",
                paddingBottom: "2rem",
              }}
            >
              <p className="vng-eyebrow">{event.date}</p>
              <h3 style={{ margin: "0.25rem 0" }}>{event.title}</h3>
              {event.description && <p style={{ opacity: 0.75 }}>{event.description}</p>}
              {event.media && (
                <Image
                  src={resolveMediaUrl(event.media.url)}
                  alt={event.title}
                  width={event.media.width ?? 640}
                  height={event.media.height ?? 360}
                  style={{
                    width: "100%",
                    maxWidth: "24rem",
                    height: "auto",
                    borderRadius: "0.5rem",
                  }}
                />
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
