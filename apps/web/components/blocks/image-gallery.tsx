import type { ImageGalleryBlock } from "@vng/shared";
import Image from "next/image";
import { resolveMediaUrl } from "@/lib/media";

export function ImageGallery(block: ImageGalleryBlock) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        {block.title && (
          <h2 className="mb-8 text-display-sm font-bold text-balance">{block.title}</h2>
        )}
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${block.columns}, minmax(0, 1fr))` }}
        >
          {block.images.map((item) => (
            <figure key={item.id} className="m-0">
              <div className="relative aspect-4/3 overflow-hidden rounded-lg bg-muted">
                <Image
                  src={resolveMediaUrl(item.image.url)}
                  alt={item.alt ?? item.caption ?? ""}
                  fill
                  sizes={`(max-width: 768px) 100vw, ${Math.round(100 / block.columns)}vw`}
                  className="object-cover"
                />
              </div>
              {item.caption && (
                <figcaption className="mt-1.5 text-sm text-muted-foreground">
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
