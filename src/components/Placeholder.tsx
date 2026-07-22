import Image from "next/image";
import { clsx } from "@/lib/clsx";
import { LUXE_SUPPLY_LOGO_SRC } from "@/components/Logo";

// Striped neutral placeholder standing in for real photography,
// or a real product photo when `imageSrc` is provided (ItemIQ sync).
//
// Product photos render through next/image (the /_next/image optimizer):
// resized to the rendered size, converted to WebP/AVIF, and long-cached —
// instead of shipping multi-MB originals from Firebase Storage. While the
// photo streams in, the Luxe logo shows on a soft ground (no black square).
export function Placeholder({
  label,
  className,
  variant = "light",
  labelClassName,
  children,
  imageSrc,
  alt,
  priority = false,
  sizes,
}: {
  label?: string;
  className?: string;
  variant?: "light" | "dark" | "vault";
  labelClassName?: string;
  children?: React.ReactNode;
  imageSrc?: string | null;
  alt?: string;
  /** Hero / LCP image — eager + high fetch priority. */
  priority?: boolean;
  /** Rendered-size hint for the optimizer (e.g. "440px", "(max-width:640px) 50vw, 25vw"). */
  sizes?: string;
}) {
  const stripe =
    variant === "dark" ? "ph-stripe-dark" : variant === "vault" ? "ph-stripe-vault" : "ph-stripe";
  const labelColor = variant === "light" ? "text-muted" : "text-white/45";
  return (
    <div
      className={clsx(
        "relative flex items-center justify-center overflow-hidden font-mono text-[10px]",
        !imageSrc && stripe,
        !imageSrc && labelColor,
        imageSrc && "bg-[#F4F1EA]",
        className,
      )}
    >
      {imageSrc ? (
        <>
          {/* Loading watermark — the opaque photo covers it once painted. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LUXE_SUPPLY_LOGO_SRC}
            alt=""
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 w-[45%] max-w-[160px] -translate-x-1/2 -translate-y-1/2 opacity-30"
          />
          <Image
            src={imageSrc}
            alt={alt || label || ""}
            fill
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            sizes={sizes || "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
            className="object-cover"
          />
        </>
      ) : label ? (
        <span className={clsx("px-2 text-center", labelClassName)}>{label}</span>
      ) : null}
      {children}
    </div>
  );
}

// The black "1/1" badge that sits on every product image.
export function OneOfOneBadge({ className = "left-2.5" }: { className?: string }) {
  return (
    <span
      className={clsx(
        "micro-badge absolute top-2.5 rounded-[5px] bg-ink px-2 py-1 text-ground",
        className,
      )}
    >
      1/1
    </span>
  );
}
