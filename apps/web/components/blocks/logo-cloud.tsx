import type { LogoCloudBlock } from "@vng/shared";
import Image from "next/image";
import { SmartLink } from "@/components/ui/smart-link";
import { resolveMediaUrl } from "@/lib/media";

export function LogoCloud(block: LogoCloudBlock) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        {block.heading && (
          <h2 className="text-center text-display-sm font-bold text-balance">{block.heading}</h2>
        )}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-10">
          {block.logos.map((logo) => {
            // Falls back to the logo's name as visible text when no image is set —
            // an image-less entry must still give its link/content a discernible name.
            const content = logo.logo ? (
              <Image
                src={resolveMediaUrl(logo.logo.url)}
                alt={logo.name}
                width={logo.logo.width ?? 160}
                height={logo.logo.height ?? 60}
                className="h-10 w-auto object-contain grayscale transition-all hover:grayscale-0"
              />
            ) : (
              <span className="text-lg font-semibold text-muted-foreground">{logo.name}</span>
            );
            return (
              <div key={logo.id}>
                {logo.url ? <SmartLink href={logo.url}>{content}</SmartLink> : content}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
