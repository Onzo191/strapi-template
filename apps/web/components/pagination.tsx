import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function Pagination({
  basePath,
  page,
  pageCount,
}: {
  basePath: string;
  page: number;
  pageCount: number;
}) {
  const t = useTranslations("common");
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      style={{ display: "flex", gap: "1.5rem", justifyContent: "center", marginTop: "2.5rem" }}
    >
      {page > 1 && <Link href={`${basePath}?page=${page - 1}`}>{t("previous")}</Link>}
      <span style={{ opacity: 0.6 }}>
        {page} / {pageCount}
      </span>
      {page < pageCount && <Link href={`${basePath}?page=${page + 1}`}>{t("next")}</Link>}
    </nav>
  );
}
