import { clsx } from "@/lib/clsx";

// Designed empty state for lists / queues.
export function EmptyState({
  title,
  hint,
  dark = false,
  className,
}: {
  title: string;
  hint?: string;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-3 rounded-card border border-dashed px-5 py-5 text-[12px]",
        dark ? "border-white/25 text-white/50" : "border-border text-muted",
        className,
      )}
    >
      <span
        className={clsx(
          "flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[11px]",
          dark ? "border-white/25" : "border-border",
        )}
      >
        ✓
      </span>
      <div>
        <div className={clsx(dark ? "text-white/70" : "text-secondary")}>{title}</div>
        {hint ? <div className="mt-0.5">{hint}</div> : null}
      </div>
    </div>
  );
}
