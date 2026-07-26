import type { LogoCloudBlock } from "@vng/shared";
import Image from "next/image";
import { SmartLink } from "@/components/ui/smart-link";
import { resolveMediaUrl } from "@/lib/media";

export function LogoCloud(block: LogoCloudBlock) {
  return (
    <section className="vng-section">
      <div className="vng-container">
        {block.heading && <h2 style={{ textAlign: "center" }}>{block.heading}</h2>}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: "2.5rem",
            marginTop: "1.5rem",
          }}
        >
          {block.logos.map((logo) => {
            const image = logo.logo && (
              <Image
                src={resolveMediaUrl(logo.logo.url)}
                alt={logo.name}
                width={logo.logo.width ?? 160}
                height={logo.logo.height ?? 60}
                style={{ height: "2.5rem", width: "auto", objectFit: "contain" }}
              />
            );
            return (
              <div key={logo.id}>
                {logo.url ? <SmartLink href={logo.url}>{image}</SmartLink> : image}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
