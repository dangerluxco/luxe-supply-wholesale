import { clsx } from "@/lib/clsx";

/** Official wordmark from luxesupply.co — gold mark on transparent. */
export const LUXE_SUPPLY_LOGO_SRC = "/luxe-supply-logo.png";

/** Intrinsic pixel size of `public/luxe-supply-logo.png`. */
export const LUXE_SUPPLY_LOGO_SIZE = { width: 2040, height: 450 } as const;

/**
 * Brand logo image. Gold artwork works on both ink and light surfaces
 * (same asset as luxesupply.co header). `tone` kept for call-site compat.
 */
export function Logo({
  // Gold mark works on ink and light; `tone` kept so existing call sites type-check.
  tone: _tone = "ink",
  className,
  height = 28,
  priority = false,
}: {
  tone?: "ink" | "light";
  className?: string;
  /** CSS height in px — width scales with the asset aspect ratio. */
  height?: number;
  priority?: boolean;
}) {
  const width = Math.round((height * LUXE_SUPPLY_LOGO_SIZE.width) / LUXE_SUPPLY_LOGO_SIZE.height);

  return (
    <img
      src={LUXE_SUPPLY_LOGO_SRC}
      alt="Luxe Supply Company"
      width={width}
      height={height}
      className={clsx("block w-auto", className)}
      style={{ height, width: "auto" }}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
    />
  );
}
