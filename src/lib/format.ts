// Formatting helpers — money is whole USD, data is rendered in mono elsewhere.

export function money(n: number): string {
  const amount = Math.round(Number(n) || 0);
  // Fixed en-US formatting — avoid runtime locale drift between server and browser.
  return (
    "$" +
    amount.toLocaleString("en-US", {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    })
  );
}

export function moneyRange(low: number, high: number): string {
  return `$${low.toLocaleString("en-US")}–${high.toLocaleString("en-US")}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function shortDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${MONTHS[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}`;
}

export function fullDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// e.g. "held for 47h 12m" countdown label relative to now
export function countdownLabel(target: Date | string | null | undefined): string {
  if (!target) return "—";
  const t = typeof target === "string" ? new Date(target) : target;
  const ms = t.getTime() - Date.now();
  if (ms <= 0) return "expired";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

// e.g. "held until Thu 16, 14:00"
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function heldUntil(target: Date | string | null | undefined): string {
  if (!target) return "";
  const t = typeof target === "string" ? new Date(target) : target;
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return `${DOW[t.getDay()]} ${t.getDate()}, ${hh}:${mm}`;
}

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
