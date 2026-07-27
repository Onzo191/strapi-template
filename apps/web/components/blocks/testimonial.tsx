import { Card, CardContent } from "@vng/design-system";
import type { TestimonialBlock } from "@vng/shared";
import Image from "next/image";
import { resolveMediaUrl } from "@/lib/media";

export function Testimonial(block: TestimonialBlock) {
  return (
    <section className="bg-muted py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        {block.heading && (
          <h2 className="text-center text-display-sm font-bold text-balance">{block.heading}</h2>
        )}
        <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-6">
          {block.items.map((item) => (
            <Card key={item.id} asChild>
              <blockquote>
                <CardContent className="flex flex-col gap-4 pt-6">
                  <p className="italic">&ldquo;{item.quote}&rdquo;</p>
                  <footer className="flex items-center gap-3">
                    {item.avatar && (
                      <Image
                        src={resolveMediaUrl(item.avatar.url)}
                        alt={item.authorName}
                        width={40}
                        height={40}
                        className="size-10 rounded-full object-cover"
                      />
                    )}
                    <div>
                      <p className="font-semibold not-italic">{item.authorName}</p>
                      {(item.authorRole || item.company) && (
                        <p className="text-sm text-muted-foreground not-italic">
                          {[item.authorRole, item.company].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </footer>
                </CardContent>
              </blockquote>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
