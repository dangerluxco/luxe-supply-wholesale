import { clsx } from "@/lib/clsx";

// Striped neutral placeholder standing in for real photography,
// or a real product photo when `imageSrc` is provided (ItemIQ sync).
export function Placeholder({
  label,
  className,
  variant = "light",
  labelClassName,
  children,
  imageSrc,
  alt,
  priority = false,
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
        imageSrc && "bg-[#111]",
        className,
      )}
    >
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={alt || label || ""}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding={priority ? "sync" : "async"}
          className="absolute inset-0 h-full w-full object-cover"
        />
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
