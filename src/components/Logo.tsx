import { clsx } from "@/lib/clsx";

// "LUXE SUPPLY*" — gold asterisk signal.
export function Logo({ tone = "ink", className }: { tone?: "ink" | "light"; className?: string }) {
  return (
    <span
      className={clsx(
        "font-sans text-[15px] font-semibold tracking-[0.08em]",
        tone === "light" ? "text-ground" : "text-ink",
        className,
      )}
    >
      LUXE SUPPLY<span className="text-accent">*</span>
    </span>
  );
}
