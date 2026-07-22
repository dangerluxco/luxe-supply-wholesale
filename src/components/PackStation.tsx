"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { clsx } from "@/lib/clsx";
import type { FulfillmentRecord } from "@/lib/firestore/fulfillment";

const CARRIERS = ["UPS", "FedEx", "USPS", "DHL", "Other"];

type Readiness = { ready: boolean; reason: string | null };

/**
 * Scan-driven pack station. Warehouse flow (barcode scanner types + Enter):
 *   1. scan a box barcode  -> creates/selects that box
 *   2. scan item SKUs      -> assigned to the current box (timestamped)
 *   3. enter tracking per box, then Mark shipped
 * Items scanned with no box selected are logged as errors (ops requirement).
 */
export function PackStation({
  invoiceId,
  initialRecord,
  itemMeta,
  shipEngineEnabled = false,
}: {
  invoiceId: string;
  initialRecord: FulfillmentRecord;
  itemMeta: Record<string, { title: string; imageUrl: string | null }>;
  /** When the ShipEngine key is configured: rate-shop + buy labels in-app. */
  shipEngineEnabled?: boolean;
}) {
  const router = useRouter();
  const [record, setRecord] = useState(initialRecord);
  const [readiness, setReadiness] = useState<Readiness>({ ready: false, reason: null });
  const [currentBoxId, setCurrentBoxId] = useState<string | null>(null);
  const [scanValue, setScanValue] = useState("");
  const [feed, setFeed] = useState<Array<{ ok: boolean; text: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement | null>(null);

  // Keep the scanner input focused — barcode guns type into whatever has focus.
  useEffect(() => {
    const t = setInterval(() => {
      const active = document.activeElement;
      const isTyping = active instanceof HTMLInputElement && active !== scanRef.current;
      if (!isTyping && record.status !== "shipped") scanRef.current?.focus();
    }, 1500);
    return () => clearInterval(t);
  }, [record.status]);

  async function api(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/fulfillment/${invoiceId}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        record?: FulfillmentRecord;
        readiness?: Readiness;
        outcome?: string;
        message?: string;
        currentBoxId?: string | null;
        needsAddress?: boolean;
      };
      if (!res.ok || data.error) {
        // Missing buyer address isn't a dead end — open the add-address modal.
        if (data.needsAddress) {
          setAddressModalOpen(true);
          setError(null);
        } else {
          setError(data.error || "Something went wrong.");
        }
        return null;
      }
      if (data.record) setRecord(data.record);
      if (data.readiness) setReadiness(data.readiness);
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function submitScan() {
    const code = scanValue.trim();
    setScanValue("");
    if (!code) return;
    const data = await api({ action: "scan", code, currentBoxId });
    if (!data) return;
    if (data.currentBoxId !== undefined) setCurrentBoxId(data.currentBoxId);
    setFeed((f) => [{ ok: data.outcome !== "error", text: data.message || code }, ...f].slice(0, 12));
  }

  const unpacked = record.expectedSkus.filter((s) => !record.assignments[s]);
  const currentBox = record.boxes.find((b) => b.id === currentBoxId) || null;
  const shipped = record.status === "shipped";
  const errorScans = record.scans.filter((s) => s.kind === "error");

  function boxItems(boxId: string): string[] {
    return Object.entries(record.assignments)
      .filter(([, b]) => b === boxId)
      .map(([sku]) => sku);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
      {addressModalOpen ? (
        <ShipAddressModal
          onClose={() => setAddressModalOpen(false)}
          onSave={async (address) => {
            const data = await api({ action: "ship-address", address });
            if (data) {
              setAddressModalOpen(false);
              setFeed((f) =>
                [{ ok: true, text: "Shipping address saved — get rates again." }, ...f].slice(0, 12),
              );
              router.refresh();
            }
            return data != null;
          }}
        />
      ) : null}
      <div className="space-y-5">
        {/* Scan input */}
        <div
          className={clsx(
            "rounded-card border p-5",
            shipped ? "border-[#4E9A6A]/50 bg-[#4E9A6A]/10" : "border-accent/50 bg-white/5",
          )}
        >
          {shipped ? (
            <div className="text-[15px] font-semibold text-[#4E9A6A]">
              Shipped — all boxes have tracking. Buyer notified.
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-baseline justify-between">
                <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">SCAN</div>
                <div className="font-mono text-[11px] text-white/60">
                  {currentBox ? (
                    <>
                      current box: <span className="text-accent">Box {currentBox.label}</span>
                    </>
                  ) : (
                    "scan a box barcode to start"
                  )}
                </div>
              </div>
              <input
                ref={scanRef}
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitScan();
                  }
                }}
                autoFocus
                disabled={busy}
                placeholder="Scan box barcode or item SKU…"
                className="h-12 w-full rounded-chip border border-white/20 bg-[#1c1c20] px-4 font-mono text-[15px] text-white outline-none focus:border-accent"
              />
              <div className="mt-3 space-y-1">
                {feed.map((f, i) => (
                  <div
                    key={i}
                    className={clsx("font-mono text-[11.5px]", f.ok ? "text-white/70" : "text-[#E5484D]")}
                  >
                    {f.ok ? "✓" : "✕"} {f.text}
                  </div>
                ))}
              </div>
            </>
          )}
          {error ? <div className="mt-2 text-[12px] text-[#E5484D]">{error}</div> : null}
        </div>

        {/* Remaining checklist */}
        <div className="rounded-card border border-white/15 p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
              TO PACK ({unpacked.length}/{record.expectedSkus.length})
            </div>
          </div>
          {unpacked.length === 0 ? (
            <p className="text-[12.5px] text-[#4E9A6A]">Every piece is boxed.</p>
          ) : (
            <div className="space-y-2">
              {unpacked.map((sku) => (
                <div key={sku} className="flex items-center gap-2.5">
                  {itemMeta[sku]?.imageUrl ? (
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-white/15">
                      <Image src={itemMeta[sku]!.imageUrl!} alt="" fill sizes="36px" className="object-cover" />
                    </span>
                  ) : (
                    <span className="h-9 w-9 shrink-0 rounded border border-white/10 bg-white/5" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] text-white/85">
                      {itemMeta[sku]?.title || sku}
                    </div>
                    <div className="font-mono text-[10.5px] text-white/40">{sku}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error log */}
        {errorScans.length > 0 ? (
          <div className="rounded-card border border-[#E5484D]/40 bg-[#E5484D]/5 p-5">
            <div className="micro-badge mb-2 text-[10px] tracking-[0.14em] text-[#E5484D]">
              SCAN ERRORS ({errorScans.length})
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {[...errorScans].reverse().map((s, i) => (
                <div key={i} className="font-mono text-[11px] text-white/60">
                  {s.at ? new Date(s.at).toLocaleTimeString() : ""} · {s.error}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Boxes + ship */}
      <div className="space-y-5">
        {record.boxes.length === 0 ? (
          <div className="rounded-card border border-dashed border-white/20 px-5 py-10 text-center text-[12.5px] text-white/50">
            No boxes yet — scan any box barcode to open Box -1.
          </div>
        ) : (
          record.boxes.map((box) => {
            const items = boxItems(box.id);
            return (
              <div
                key={box.id}
                className={clsx(
                  "rounded-card border p-5",
                  box.id === currentBoxId && !shipped ? "border-accent" : "border-white/15",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={shipped}
                    onClick={() => setCurrentBoxId(box.id)}
                    className="text-[14px] font-semibold text-white hover:text-accent"
                  >
                    Box {box.label}
                    <span className="ml-2 font-mono text-[10.5px] text-white/40">{box.barcode}</span>
                  </button>
                  <span className="font-mono text-[11px] text-white/50">
                    {items.length} piece{items.length === 1 ? "" : "s"}
                  </span>
                </div>
                {items.length ? (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {items.map((sku) => (
                      <span
                        key={sku}
                        className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10.5px] text-white/70"
                      >
                        {sku}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11.5px] text-white/40">Empty box.</span>
                    {!shipped ? (
                      <button
                        type="button"
                        onClick={() => void api({ action: "remove-box", boxId: box.id })}
                        className="text-[10.5px] uppercase tracking-[0.08em] text-white/40 hover:text-[#E5484D]"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                )}
                <BoxShipping
                  box={box}
                  disabled={shipped}
                  shipEngineEnabled={shipEngineEnabled}
                  api={api}
                />
              </div>
            );
          })
        )}

        {!shipped ? (
          <div className="rounded-card border border-white/15 p-5">
            <button
              type="button"
              disabled={busy || !readiness.ready}
              onClick={async () => {
                if (!window.confirm("Mark this shipment as shipped and email the buyer tracking?")) return;
                const data = await api({ action: "complete" });
                if (data) router.refresh();
              }}
              className="h-11 w-full rounded-chip bg-accent text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:opacity-90 disabled:opacity-40"
            >
              Mark shipped + email buyer
            </button>
            <p className="mt-2 text-center text-[11px] text-white/50">
              {readiness.ready
                ? "All pieces boxed and every box has tracking."
                : readiness.reason || "Scan every piece into a box, then add tracking numbers."}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type Rate = {
  rateId: string;
  carrier: string;
  service: string;
  amount: number;
  deliveryDays: number | null;
};

type BoxShape = {
  id: string;
  carrier: string;
  trackingNumber: string;
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  labelPdfUrl: string | null;
  labelZplUrl: string | null;
  labelCost: number | null;
  labelService: string | null;
};

/** Shippers use a standard box + typical weight — remember the last values
 *  entered at this station (localStorage) and prefill every new box with them,
 *  across invoices. Changing them updates the remembered defaults. */
const PARCEL_DEFAULTS_KEY = "luxe-packstation-parcel-defaults";

function saveParcelDefaults(weight: string, dims: { l: string; w: string; h: string }) {
  try {
    localStorage.setItem(PARCEL_DEFAULTS_KEY, JSON.stringify({ weight, ...dims }));
  } catch {
    /* private mode etc. — defaults just won't stick */
  }
}

function BoxShipping({
  box,
  disabled,
  shipEngineEnabled,
  api,
}: {
  box: BoxShape;
  disabled: boolean;
  shipEngineEnabled: boolean;
  api: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [carrier, setCarrier] = useState(box.carrier || "UPS");
  const [tracking, setTracking] = useState(box.trackingNumber);
  const [weight, setWeight] = useState(box.weightOz ? String(box.weightOz) : "");
  const [dims, setDims] = useState({
    l: box.lengthIn ? String(box.lengthIn) : "",
    w: box.widthIn ? String(box.widthIn) : "",
    h: box.heightIn ? String(box.heightIn) : "",
  });
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [buyingRateId, setBuyingRateId] = useState<string | null>(null);
  const [manual, setManual] = useState(!shipEngineEnabled);
  const dirty = carrier !== (box.carrier || "UPS") || tracking !== box.trackingNumber;

  // Prefill an untouched box from the station's remembered parcel defaults
  // (after mount — localStorage isn't available during server render).
  useEffect(() => {
    if (box.weightOz || box.lengthIn || box.widthIn || box.heightIn) return;
    try {
      const raw = localStorage.getItem(PARCEL_DEFAULTS_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { weight?: string; l?: string; w?: string; h?: string };
      setWeight((cur) => cur || d.weight || "");
      setDims((cur) => ({
        l: cur.l || d.l || "",
        w: cur.w || d.w || "",
        h: cur.h || d.h || "",
      }));
    } catch {
      /* corrupted defaults — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Label already purchased: show it — carrier/tracking are locked in.
  if (box.labelPdfUrl) {
    return (
      <div className="rounded-chip border border-[#4E9A6A]/40 bg-[#4E9A6A]/10 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <span className="text-white/85">
            {box.carrier.toUpperCase()} {box.labelService || ""} · {" "}
            <span className="font-mono">{box.trackingNumber}</span>
          </span>
          {box.labelCost != null ? (
            <span className="font-mono text-[11px] text-white/50">${box.labelCost.toFixed(2)}</span>
          ) : null}
        </div>
        <div className="mt-2 flex gap-2">
          <a
            href={box.labelPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 rounded-chip bg-accent px-3 text-[10.5px] font-semibold uppercase leading-8 tracking-[0.1em] text-ink hover:opacity-90"
          >
            🖨 Print label
          </a>
          {box.labelZplUrl ? (
            <a
              href={box.labelZplUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 rounded-chip border border-white/20 px-3 text-[10.5px] font-semibold uppercase leading-8 tracking-[0.1em] text-white/70 hover:border-accent hover:text-white"
            >
              ZPL
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {shipEngineEnabled && !manual && !disabled ? (
        <>
          {/* Parcel details -> rates -> buy */}
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              inputMode="numeric"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Weight oz"
              className="h-9 w-[86px] rounded-chip border border-white/20 bg-[#1c1c20] px-2.5 font-mono text-[12px] text-white outline-none focus:border-accent"
            />
            {(["l", "w", "h"] as const).map((k) => (
              <input
                key={k}
                inputMode="numeric"
                value={dims[k]}
                onChange={(e) => setDims((d) => ({ ...d, [k]: e.target.value }))}
                placeholder={`${k.toUpperCase()}"`}
                className="h-9 w-[52px] rounded-chip border border-white/20 bg-[#1c1c20] px-2 font-mono text-[12px] text-white outline-none focus:border-accent"
              />
            ))}
            <button
              type="button"
              disabled={!weight.trim() || loadingRates}
              onClick={async () => {
                setLoadingRates(true);
                setRates(null);
                saveParcelDefaults(weight, dims);
                try {
                  await api({
                    action: "parcel",
                    boxId: box.id,
                    weightOz: Number(weight),
                    lengthIn: dims.l ? Number(dims.l) : null,
                    widthIn: dims.w ? Number(dims.w) : null,
                    heightIn: dims.h ? Number(dims.h) : null,
                  });
                  const data = (await api({ action: "rates", boxId: box.id })) as {
                    rates?: Rate[];
                  } | null;
                  if (data?.rates) setRates(data.rates);
                } finally {
                  setLoadingRates(false);
                }
              }}
              className="h-9 rounded-chip bg-accent px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink hover:opacity-90 disabled:opacity-40"
            >
              {loadingRates ? "Quoting…" : "Get rates"}
            </button>
          </div>

          {rates ? (
            rates.length === 0 ? (
              <p className="text-[11.5px] text-white/50">No rates returned — check the address/weight.</p>
            ) : (
              <div className="space-y-1">
                {rates.map((r) => (
                  <button
                    key={r.rateId}
                    type="button"
                    disabled={buyingRateId !== null}
                    onClick={async () => {
                      setBuyingRateId(r.rateId);
                      try {
                        await api({ action: "buy-label", boxId: box.id, rateId: r.rateId });
                      } finally {
                        setBuyingRateId(null);
                      }
                    }}
                    className="flex w-full items-center justify-between rounded-chip border border-white/15 px-3 py-2 text-left text-[12px] text-white/80 transition hover:border-accent hover:bg-white/5 disabled:opacity-50"
                  >
                    <span>
                      {r.carrier} {r.service}
                      {r.deliveryDays ? (
                        <span className="ml-1.5 text-[10.5px] text-white/40">
                          ~{r.deliveryDays}d
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono font-semibold text-accent">
                      {buyingRateId === r.rateId ? "Buying…" : `$${r.amount.toFixed(2)}`}
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : null}

          <button
            type="button"
            onClick={() => setManual(true)}
            className="text-[10px] uppercase tracking-[0.08em] text-white/40 hover:text-white/70"
          >
            enter tracking manually instead
          </button>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <select
              value={carrier}
              disabled={disabled}
              onChange={(e) => setCarrier(e.target.value)}
              className="h-9 rounded-chip border border-white/20 bg-[#1c1c20] px-2 text-[12px] text-white outline-none focus:border-accent disabled:opacity-50"
            >
              {CARRIERS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={tracking}
              disabled={disabled}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Tracking number"
              className="h-9 flex-1 rounded-chip border border-white/20 bg-[#1c1c20] px-3 font-mono text-[12px] text-white outline-none focus:border-accent disabled:opacity-50"
            />
            {!disabled ? (
              <button
                type="button"
                disabled={!dirty || !tracking.trim()}
                onClick={() => void api({ action: "tracking", boxId: box.id, carrier, trackingNumber: tracking })}
                className="h-9 rounded-chip border border-white/20 px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/70 hover:border-accent hover:text-white disabled:opacity-40"
              >
                Save
              </button>
            ) : null}
          </div>
          {shipEngineEnabled && !disabled ? (
            <button
              type="button"
              onClick={() => setManual(false)}
              className="text-[10px] uppercase tracking-[0.08em] text-white/40 hover:text-white/70"
            >
              ← buy a label instead
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Dark-console modal to capture the buyer's shipping address when the account
 *  has none on file — saves against the client account, then rates can re-quote. */
function ShipAddressModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (address: Record<string, string>) => Promise<boolean>;
}) {
  const [form, setForm] = useState({
    attn: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
  });
  const [saving, setSaving] = useState(false);
  const canSave =
    form.line1.trim() && form.city.trim() && form.state.trim() && form.postalCode.trim();

  const field = (key: keyof typeof form, placeholder: string, extra = "") => (
    <input
      value={form[key]}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      placeholder={placeholder}
      className={clsx(
        "h-10 rounded-chip border border-white/20 bg-[#1c1c20] px-3 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-accent",
        extra,
      )}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-md rounded-card border border-white/15 bg-[#232327] p-6 shadow-2xl">
        <div className="micro-badge mb-1 text-[10px] tracking-[0.14em] text-accent">
          NO SHIPPING ADDRESS ON FILE
        </div>
        <p className="mb-4 text-[12.5px] text-white/60">
          Enter the buyer&apos;s ship-to address — it saves to their client account and is used for
          rate quotes and labels going forward.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {field("attn", "Attn / recipient (optional)")}
          {field("line1", "Street address")}
          {field("line2", "Apt / suite (optional)")}
          <div className="grid grid-cols-[1fr_72px_96px] gap-2">
            {field("city", "City")}
            {field("state", "ST")}
            {field("postalCode", "ZIP")}
          </div>
          {field("country", "Country", "w-24")}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-chip border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70 hover:border-white/40 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(form);
              } finally {
                setSaving(false);
              }
            }}
            className="h-10 rounded-chip bg-accent px-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save address"}
          </button>
        </div>
      </div>
    </div>
  );
}
