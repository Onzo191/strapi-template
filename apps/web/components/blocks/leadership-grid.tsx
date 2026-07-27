import type { LeadershipGridBlock } from "@vng/shared";
import Image from "next/image";
import { resolveMediaUrl } from "@/lib/media";

export function LeadershipGrid(block: LeadershipGridBlock) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        {block.heading && (
          <h2 className="mb-8 text-display-sm font-bold text-balance">{block.heading}</h2>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-8">
          {block.leaders.map((leader) => (
            <div key={leader.id}>
              {leader.photo && (
                <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
                  <Image
                    src={resolveMediaUrl(leader.photo.url)}
                    alt={leader.name}
                    fill
                    sizes="(max-width: 768px) 50vw, 224px"
                    className="object-cover"
                  />
                </div>
              )}
              <h3 className="mt-3 text-lg font-semibold">{leader.name}</h3>
              {leader.role && <p className="text-sm text-muted-foreground">{leader.role}</p>}
              {leader.bio && <p className="mt-1 text-sm text-muted-foreground">{leader.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
