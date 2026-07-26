import type { LeadershipGridBlock } from "@vng/shared";
import Image from "next/image";
import { resolveMediaUrl } from "@/lib/media";

export function LeadershipGrid(block: LeadershipGridBlock) {
  return (
    <section className="vng-section">
      <div className="vng-container">
        {block.heading && <h2>{block.heading}</h2>}
        <div
          className="vng-grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))" }}
        >
          {block.leaders.map((leader) => (
            <div key={leader.id}>
              {leader.photo && (
                <Image
                  src={resolveMediaUrl(leader.photo.url)}
                  alt={leader.name}
                  width={leader.photo.width ?? 320}
                  height={leader.photo.height ?? 320}
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "cover",
                    borderRadius: "0.75rem",
                  }}
                />
              )}
              <h3 style={{ margin: "0.75rem 0 0.125rem" }}>{leader.name}</h3>
              {leader.role && <p style={{ opacity: 0.7, margin: 0 }}>{leader.role}</p>}
              {leader.bio && <p style={{ opacity: 0.75, fontSize: "0.9rem" }}>{leader.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
