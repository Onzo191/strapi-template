import { Button } from "@vng/design-system";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-4">
      {page > 1 ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={`${basePath}?page=${page - 1}`}>
            <ChevronLeft />
            {t("previous")}
          </Link>
        </Button>
      ) : (
        <span aria-hidden="true" />
      )}
      <span className="text-sm text-muted-foreground">
        {page} / {pageCount}
      </span>
      {page < pageCount ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={`${basePath}?page=${page + 1}`}>
            {t("next")}
            <ChevronRight />
          </Link>
        </Button>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
