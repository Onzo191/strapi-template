import type { ImageGalleryBlock } from "@vng/shared";
import Image from "next/image";
import { resolveMediaUrl } from "@/lib/media";

export function ImageGallery(block: ImageGalleryBlock) {
  return (
    <section className="vng-section">
      <div className="vng-container">
        {block.title && <h2>{block.title}</h2>}
        <div
          className="vng-grid"
          style={{ gridTemplateColumns: `repeat(${block.columns}, minmax(0, 1fr))` }}
        >
          {block.images.map((item) => (
            <figure key={item.id} style={{ margin: 0 }}>
              <Image
                src={resolveMediaUrl(item.image.url)}
                alt={item.alt ?? item.caption ?? ""}
                width={item.image.width ?? 640}
                height={item.image.height ?? 480}
                style={{ width: "100%", height: "auto", borderRadius: "0.5rem" }}
              />
              {item.caption && (
                <figcaption style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: "0.375rem" }}>
                  {item.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
