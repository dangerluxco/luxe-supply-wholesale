"use client";

/** Plain window.print trigger — hidden on the printed page itself. */
export function PrintButton({ label = "Print", className }: { label?: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      🖨 {label}
    </button>
  );
}
