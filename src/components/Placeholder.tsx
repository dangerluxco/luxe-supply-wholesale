"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "@/lib/clsx";
import { LUXE_SUPPLY_LOGO_SRC } from "@/components/Logo";

// Striped neutral placeholder standing in for real photography,
// or a real product photo when `imageSrc` is provided (ItemIQ sync).
//
// Product photos render through next/image (the /_next/image optimizer):
// resized to the rendered size, converted to WebP/AVIF, and long-cached —
// instead of shipping multi-MB originals from Firebase Storage. While the
// photo streams in, the Luxe logo shows on a soft ground (no black square).
//
// Dead URLs never show the browser's broken-image icon: on error this falls
// forward through `imageSrcs` candidates and finally degrades to the striped
// block — stale uploadHistory URLs surfaced as broken images all over the
// portal (similar-item rails, curation views) before this.
export function Placeholder({
  label,
  className,
  variant = "light",
  labelClassName,
  children,
  imageSrc,
  imageSrcs,
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
  /** Additional candidate URLs tried in order when the primary photo fails to load. */
  imageSrcs?: Array<string | null | undefined>;
  alt?: string;
  /** Hero / LCP image — eager + high fetch priority. */
  priority?: boolean;
  /** Rendered-size hint for the optimizer (e.g. "440px", "(max-width:640px) 50vw, 25vw"). */
  sizes?: string;
}) {
  const candidates = useMemo(() => {
    const all = [imageSrc, ...(imageSrcs || [])];
    return all.filter((u, i): u is string => !!u && all.indexOf(u) === i);
  }, [imageSrc, imageSrcs]);
  const [failed, setFailed] = useState(0);
  const primary = candidates[0] ?? null;
  useEffect(() => {
    setFailed(0);
  }, [primary]);
  const src = candidates[failed] ?? null;

  const stripe =
    variant === "dark" ? "ph-stripe-dark" : variant === "vault" ? "ph-stripe-vault" : "ph-stripe";
  const labelColor = variant === "light" ? "text-muted" : "text-white/45";
  return (
    <div
      className={clsx(
        "relative flex items-center justify-center overflow-hidden font-mono text-[10px]",
        !src && stripe,
        !src && labelColor,
        src && "bg-[#F4F1EA]",
        className,
      )}
    >
      {src ? (
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
            src={src}
            alt={alt || label || ""}
            fill
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            sizes={sizes || "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
            onError={() => setFailed((n) => n + 1)}
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
