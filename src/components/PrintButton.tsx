"use client";

export function PrintButton({ label = "Download PDF ↓" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="h-10 rounded-chip bg-ink px-5 text-[12px] uppercase tracking-[0.12em] text-ground transition hover:opacity-90 print:hidden"
    >
      {label}
    </button>
  );
}
