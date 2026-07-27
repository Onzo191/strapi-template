import type { TimelineBlock } from "@vng/shared";
import Image from "next/image";
import { resolveMediaUrl } from "@/lib/media";

export function Timeline(block: TimelineBlock) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        {block.heading && (
          <h2 className="mb-8 text-display-sm font-bold text-balance">{block.heading}</h2>
        )}
        <ol className="m-0 list-none p-0">
          {block.events.map((event) => (
            <li key={event.id} className="border-l-2 border-border py-2 pb-8 pl-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {event.date}
              </p>
              <h3 className="mt-1 text-lg font-semibold">{event.title}</h3>
              {event.description && (
                <p className="mt-1 text-muted-foreground">{event.description}</p>
              )}
              {event.media && (
                <Image
                  src={resolveMediaUrl(event.media.url)}
                  alt={event.title}
                  width={event.media.width ?? 640}
                  height={event.media.height ?? 360}
                  sizes="(max-width: 768px) 100vw, 384px"
                  className="mt-3 w-full max-w-sm rounded-lg"
                />
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
