import { Placeholder } from "@/components/Placeholder";
import { clsx } from "@/lib/clsx";

export function portalDisplayTitle(title?: string | null, sku?: string | null): string {
  const t = String(title || "").trim();
  if (t) return t;
  return String(sku || "").trim() || "—";
}

/** Show SKU as secondary line only when it adds info beyond the title. */
export function portalShowSkuLine(title?: string | null, sku?: string | null): boolean {
  const t = String(title || "").trim();
  const s = String(sku || "").trim();
  if (!s) return false;
  if (!t) return false;
  return t.toLowerCase() !== s.toLowerCase();
}

const thumbSizes = {
  sm: "h-16 w-16",
  md: "h-24 w-24",
  lg: "h-28 w-28",
} as const;

/** Staff portal list row: larger thumb, listing title as name, SKU once underneath. */
export function PortalItemLine({
  imageUrl,
  title,
  sku,
  subtitle,
  size = "md",
  className,
}: {
  imageUrl?: string | null;
  title?: string | null;
  sku?: string | null;
  subtitle?: string | null;
  size?: keyof typeof thumbSizes;
  className?: string;
}) {
  const displayTitle = portalDisplayTitle(title, sku);
  return (
    <div className={clsx("flex min-w-0 items-center gap-3", className)}>
      <Placeholder
        imageSrc={imageUrl}
        alt={displayTitle}
        className={clsx(thumbSizes[size], "shrink-0 rounded-chip")}
      />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-ink">{displayTitle}</div>
        {portalShowSkuLine(title, sku) ? (
          <div className="truncate font-mono text-[11px] text-muted">{sku}</div>
        ) : null}
        {subtitle ? (
          <div className="truncate text-[11px] text-muted">{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Compact thumb + title for lot grids and summaries. */
export function PortalThumbnailTile({
  imageUrl,
  title,
  sku,
  overlay,
  className,
}: {
  imageUrl?: string | null;
  title?: string | null;
  sku?: string | null;
  overlay?: string;
  className?: string;
}) {
  const displayTitle = portalDisplayTitle(title, sku);
  return (
    <div className={clsx("flex w-[7.5rem] flex-col gap-1.5", className)}>
      <div className="relative">
        <Placeholder
          imageSrc={imageUrl}
          alt={displayTitle}
          className="h-[7.5rem] w-[7.5rem] rounded border border-border"
        />
        {overlay ? (
          <span className="absolute inset-0 flex items-center justify-center rounded bg-ink/55 font-mono text-[12px] font-semibold text-ground">
            {overlay}
          </span>
        ) : null}
      </div>
      <span className="line-clamp-2 text-[11px] leading-snug text-ink">{displayTitle}</span>
    </div>
  );
}
