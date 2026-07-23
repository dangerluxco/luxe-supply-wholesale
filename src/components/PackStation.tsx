"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { clsx } from "@/lib/clsx";
import type { FulfillmentRecord } from "@/lib/firestore/fulfillment";

const CARRIERS = ["UPS", "FedEx", "USPS", "DHL", "Other"];

type Readiness = { ready: boolean; reason: string | null };

/** Scan feedback tones — packers work by ear, not by watching the feed.
 *  Short high chirp = good scan; double low buzz = bad scan. */
function scanBeep(ok: boolean) {
  try {
    type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext; __luxeAudio?: AudioContext };
    const w = window as AudioWindow;
    const AC = window.AudioContext || w.webkitAudioContext;
    if (!AC) return;
    const ctx = (w.__luxeAudio ||= new AC());
    void ctx.resume?.();
    const tone = (freq: number, at: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.value = 0.06;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + dur);
    };
    if (ok) tone(1175, 0, 0.09);
    else {
      tone(240, 0, 0.16);
      tone(240, 0.22, 0.16);
    }
  } catch {
    /* audio unavailable — the visual flash still fires */
  }
}

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
  signatureDefault = false,
  isAdmin = false,
}: {
  invoiceId: string;
  initialRecord: FulfillmentRecord;
  itemMeta: Record<string, { title: string; imageUrl: string | null; images?: string[] }>;
  /** When the ShipEngine key is configured: rate-shop + buy labels in-app. */
  shipEngineEnabled?: boolean;
  /** Buyer's account-level "signature required" flag — seeds the label toggle. */
  signatureDefault?: boolean;
  /** Admins (managers) get the unship escape hatch. */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [record, setRecord] = useState(initialRecord);
  const [readiness, setReadiness] = useState<Readiness>({ ready: false, reason: null });
  const [currentBoxId, setCurrentBoxId] = useState<string | null>(null);
  const [scanValue, setScanValue] = useState("");
  const [feed, setFeed] = useState<Array<{ ok: boolean; text: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopAlert, setStopAlert] = useState<string | null>(null);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [gallerySku, setGallerySku] = useState<string | null>(null);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const scanRef = useRef<HTMLInputElement | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashScan(ok: boolean) {
    scanBeep(ok);
    setFlash(ok ? "ok" : "bad");
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), ok ? 350 : 900);
  }

  // Keep the scanner input focused — barcode guns type into whatever has focus.
  // Only while there's still something to scan: once every piece is boxed the
  // packer is picking shipping methods, and stealing focus breaks the dropdowns.
  const stillPacking = record.expectedSkus.some((s) => !record.assignments[s]);
  useEffect(() => {
    if (!stillPacking || record.status === "shipped") return;
    const t = setInterval(() => {
      const active = document.activeElement;
      const interacting =
        (active instanceof HTMLInputElement ||
          active instanceof HTMLSelectElement ||
          active instanceof HTMLTextAreaElement ||
          active instanceof HTMLButtonElement) &&
        active !== scanRef.current;
      if (!interacting) scanRef.current?.focus();
    }, 1500);
    return () => clearInterval(t);
  }, [record.status, stillPacking]);

  // All station calls run one at a time — several boxes auto-saving at once
  // must not interleave, or a stale record snapshot can land last and hide
  // another box's just-saved weight.
  const apiChain = useRef<Promise<unknown>>(Promise.resolve());

  function api(body: Record<string, unknown>) {
    const run = () => apiOnce(body);
    const p = apiChain.current.then(run, run);
    apiChain.current = p.catch(() => null);
    return p;
  }

  async function apiOnce(body: Record<string, unknown>) {
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
        stop?: boolean;
        warning?: string;
        options?: RateAllOption[];
        boxCount?: number;
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
    // A stop alert must be acknowledged before any further scan is processed —
    // the first Enter/scan only clears the alert, nothing gets packed by it.
    if (stopAlert) {
      setStopAlert(null);
      return;
    }
    if (!code) return;
    const data = await api({ action: "scan", code, currentBoxId });
    if (!data) {
      flashScan(false);
      return;
    }
    if (data.currentBoxId !== undefined) setCurrentBoxId(data.currentBoxId);
    const ok = data.outcome !== "error";
    flashScan(ok);
    if (data.stop) setStopAlert(data.message || `${code} is not on this order.`);
    setFeed((f) => [{ ok, text: data.message || code }, ...f].slice(0, 12));
  }

  async function addBox() {
    const data = await api({ action: "add-box" });
    if (!data) return;
    if (data.currentBoxId !== undefined) setCurrentBoxId(data.currentBoxId);
    flashScan(true);
    setFeed((f) =>
      [{ ok: true, text: "New box opened — scan items into it." }, ...f].slice(0, 12),
    );
  }

  const unpacked = record.expectedSkus.filter((s) => !record.assignments[s]);
  const currentBox = record.boxes.find((b) => b.id === currentBoxId) || null;
  const shipped = record.status === "shipped";
  const errorScans = record.scans.filter((s) => s.kind === "error");
  // Whole-order rating: with 2+ packed label-less boxes, the per-box rate flow
  // collapses to weight/dims entry and rating happens once in the combined card —
  // unless the packer opts into per-box rating (mixed speeds, e.g. the expensive
  // piece overnight and the rest ground).
  const packedBoxIds = new Set(Object.values(record.assignments));
  const rateAllBoxes = record.boxes.filter((b) => packedBoxIds.has(b.id) && !b.labelId);
  const multiBoxEligible = shipEngineEnabled && !shipped && rateAllBoxes.length >= 2;
  const [perBoxRating, setPerBoxRating] = useState(false);
  const multiBoxActive = multiBoxEligible && !perBoxRating;

  function boxItems(boxId: string): string[] {
    return Object.entries(record.assignments)
      .filter(([, b]) => b === boxId)
      .map(([sku]) => sku);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
      {stopAlert ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-[#E5484D]/95 p-8 text-center"
          role="alertdialog"
          aria-label="Wrong piece scanned"
          onClick={() => setStopAlert(null)}
        >
          {/* Stop sign — unmissable from across the bench. */}
          <div className="flex h-44 w-44 items-center justify-center [clip-path:polygon(30%_0,70%_0,100%_30%,100%_70%,70%_100%,30%_100%,0_70%,0_30%)] bg-white">
            <span className="text-[44px] font-black tracking-[0.06em] text-[#E5484D]">STOP</span>
          </div>
          <div className="max-w-xl text-[26px] font-bold leading-snug text-white">{stopAlert}</div>
          <div className="text-[14px] text-white/85">
            Set the piece aside — it does not belong in this order.
          </div>
          <button
            type="button"
            autoFocus
            onClick={() => setStopAlert(null)}
            className="h-12 rounded-chip bg-white px-8 text-[13px] font-bold uppercase tracking-[0.14em] text-[#E5484D] hover:opacity-90"
          >
            OK — piece set aside
          </button>
        </div>
      ) : null}
      {gallerySku ? (
        <ItemGalleryModal
          sku={gallerySku}
          title={itemMeta[gallerySku]?.title || gallerySku}
          images={
            itemMeta[gallerySku]?.images?.length
              ? itemMeta[gallerySku]!.images!
              : itemMeta[gallerySku]?.imageUrl
                ? [itemMeta[gallerySku]!.imageUrl!]
                : []
          }
          onClose={() => setGallerySku(null)}
        />
      ) : null}
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
            "rounded-card border p-5 transition-colors duration-150",
            shipped
              ? "border-[#4E9A6A]/50 bg-[#4E9A6A]/10"
              : flash === "bad"
                ? "border-[#E5484D] bg-[#E5484D]/20"
                : flash === "ok"
                  ? "border-[#4E9A6A] bg-[#4E9A6A]/10"
                  : "border-accent/50 bg-white/5",
          )}
        >
          {shipped ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[15px] font-semibold text-[#4E9A6A]">
                Shipped — all boxes have tracking. Buyer notified.
              </div>
              {isAdmin ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Unship this invoice? It reopens the pack station and clears tracking from the invoice — the buyer is NOT emailed about the undo.",
                      )
                    )
                      return;
                    const data = await api({ action: "unship" });
                    if (data) router.refresh();
                  }}
                  className="rounded-chip border border-[#E5484D]/50 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#E5484D] hover:bg-[#E5484D]/10 disabled:opacity-40"
                >
                  Unship (admin)
                </button>
              ) : null}
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
                    "open a box first — then scan items into it"
                  )}
                </div>
              </div>
              <div className="flex gap-2">
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
                  placeholder={
                    currentBox ? "Scan or type item SKU…" : "Scan a BOX- barcode, or use + New box"
                  }
                  className="h-12 w-full rounded-chip border border-white/20 bg-[#1c1c20] px-4 font-mono text-[15px] text-white outline-none focus:border-accent"
                />
                {/* Scan guns send Enter on their own — this button is for hand-typed codes. */}
                <button
                  type="button"
                  disabled={busy || !scanValue.trim()}
                  onClick={() => void submitScan()}
                  title="Submit the typed code — same as pressing Enter"
                  className="h-12 shrink-0 rounded-chip bg-accent px-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink hover:opacity-90 disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addBox()}
                  title="Open a new box — its BOX- barcode goes on the printed box label"
                  className="h-12 shrink-0 rounded-chip border border-accent/60 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent hover:bg-accent/10 disabled:opacity-40"
                >
                  ＋ New box
                </button>
              </div>
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
                    <button
                      type="button"
                      onClick={() => setGallerySku(sku)}
                      title="View all photos"
                      className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-white/15 transition hover:border-accent"
                    >
                      <Image src={itemMeta[sku]!.imageUrl!} alt="" fill sizes="36px" className="object-cover" />
                    </button>
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
            No boxes yet — click ＋ New box (or scan a BOX- barcode) to open Box -1.
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
                  <span className="flex items-center gap-2 font-mono text-[11px] text-white/50">
                    {items.length} piece{items.length === 1 ? "" : "s"}
                    <a
                      href={`/fulfillment/${invoiceId}/box-labels?box=${encodeURIComponent(box.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Print this box's ID label"
                      className="rounded-chip border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-white/60 transition hover:border-accent hover:text-white"
                    >
                      🏷 label
                    </a>
                  </span>
                </div>
                {items.length ? (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {items.map((sku) => (
                      <button
                        key={sku}
                        type="button"
                        onClick={() => setGallerySku(sku)}
                        title={itemMeta[sku]?.title || "View photos"}
                        className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10.5px] text-white/70 transition hover:border-accent hover:text-white"
                      >
                        {sku}
                      </button>
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
                  signatureDefault={signatureDefault}
                  multiBoxActive={multiBoxActive}
                  api={api}
                />
              </div>
            );
          })
        )}

        {multiBoxActive ? (
          <MultiBoxShipping
            boxes={rateAllBoxes}
            signatureDefault={signatureDefault}
            api={api}
            onSwitchToPerBox={() => setPerBoxRating(true)}
          />
        ) : multiBoxEligible && perBoxRating ? (
          <div className="rounded-card border border-white/15 px-5 py-3 text-center">
            <span className="text-[11.5px] text-white/60">
              Rating each box on its own — mix speeds as needed.
            </span>{" "}
            <button
              type="button"
              onClick={() => setPerBoxRating(false)}
              className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent hover:opacity-80"
            >
              ← Ship all boxes together instead
            </button>
          </div>
        ) : null}

        {record.boxes.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <a
              href={`/fulfillment/${invoiceId}/box-labels`}
              target="_blank"
              rel="noopener noreferrer"
              title="Internal box ID labels — invoice number + client name + scannable box barcode"
              className="block rounded-card border border-white/15 px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70 transition hover:border-accent hover:text-white"
            >
              🏷 Print box labels
            </a>
            <a
              href={`/fulfillment/${invoiceId}/slips`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-card border border-white/15 px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70 transition hover:border-accent hover:text-white"
            >
              🖨 Print packing slips
            </a>
          </div>
        ) : null}

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

/** One shipping method priced across every packed box (rates-all). */
type RateAllOption = {
  carrier: string;
  service: string;
  serviceCode: string;
  deliveryDays: number | null;
  total: number;
  avgPerBox: number;
  boxes: Array<{ boxId: string; boxLabel: string; rateId: string; amount: number }>;
};

type BoxShape = {
  id: string;
  carrier: string;
  trackingNumber: string;
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  labelId: string | null;
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

/** Named box presets ("Handbag 12×10×6") saved at this station — one tap fills
 *  dims + typical weight instead of re-keying the same numbers all day. */
const BOX_PRESETS_KEY = "luxe-packstation-box-presets";

type BoxPreset = { name: string; weight: string; l: string; w: string; h: string };

function loadBoxPresets(): BoxPreset[] {
  try {
    const raw = localStorage.getItem(BOX_PRESETS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr)
      ? arr
          .filter((p): p is BoxPreset => !!p && typeof (p as BoxPreset).name === "string")
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function saveBoxPresets(presets: BoxPreset[]) {
  try {
    localStorage.setItem(BOX_PRESETS_KEY, JSON.stringify(presets.slice(0, 20)));
  } catch {
    /* private mode etc. */
  }
}

/** Split a total-oz value into whole lb + remaining oz for display. */
function splitOz(totalOz: number): { lb: string; oz: string } {
  if (!Number.isFinite(totalOz) || totalOz <= 0) return { lb: "", oz: "" };
  const lb = Math.floor(totalOz / 16);
  const oz = Math.round(totalOz - lb * 16);
  return { lb: lb ? String(lb) : "", oz: oz ? String(oz) : lb ? "0" : "" };
}

function BoxShipping({
  box,
  disabled,
  shipEngineEnabled,
  signatureDefault,
  multiBoxActive = false,
  api,
}: {
  box: BoxShape;
  disabled: boolean;
  shipEngineEnabled: boolean;
  signatureDefault: boolean;
  /** Whole-order rating card is showing — this box only collects weight/dims here. */
  multiBoxActive?: boolean;
  api: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [carrier, setCarrier] = useState(box.carrier || "UPS");
  const [tracking, setTracking] = useState(box.trackingNumber);
  const initialWeight = splitOz(box.weightOz || 0);
  const [wLb, setWLb] = useState(initialWeight.lb);
  const [wOz, setWOz] = useState(initialWeight.oz);
  const [dims, setDims] = useState({
    l: box.lengthIn ? String(box.lengthIn) : "",
    w: box.widthIn ? String(box.widthIn) : "",
    h: box.heightIn ? String(box.heightIn) : "",
  });
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [applied, setApplied] = useState<{ signature: boolean; insuredValue: number | null } | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [buyingRateId, setBuyingRateId] = useState<string | null>(null);
  const [manual, setManual] = useState(!shipEngineEnabled);
  const [signature, setSignature] = useState(signatureDefault);
  const [insure, setInsure] = useState(true);
  const [insureAmt, setInsureAmt] = useState("");
  const [presets, setPresets] = useState<BoxPreset[]>([]);
  const [voiding, setVoiding] = useState(false);
  const dirty = carrier !== (box.carrier || "UPS") || tracking !== box.trackingNumber;
  const totalOz = (Number(wLb) || 0) * 16 + (Number(wOz) || 0);
  const [autoSave, setAutoSave] = useState<"idle" | "saving" | "saved">(
    box.weightOz ? "saved" : "idle",
  );
  const savedSnapRef = useRef(
    JSON.stringify({
      w: box.weightOz || 0,
      l: box.lengthIn ? String(box.lengthIn) : "",
      wd: box.widthIn ? String(box.widthIn) : "",
      h: box.heightIn ? String(box.heightIn) : "",
    }),
  );
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save weight/dims whenever they hold a value the server doesn't —
  // typed, preset, or station-default prefill. Packers never click Save: by
  // the time the last piece is boxed every box is persisted and whole-order
  // rating works immediately. (The values are visible in the fields and the
  // status chip flips to "Saved ✓", so nothing is silently invented.)
  useEffect(() => {
    if (disabled || box.labelPdfUrl || totalOz <= 0) return;
    const snap = JSON.stringify({ w: totalOz, l: dims.l, wd: dims.w, h: dims.h });
    if (snap === savedSnapRef.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSave("saving");
      saveParcelDefaults(String(totalOz), dims);
      const ok = await api({
        action: "parcel",
        boxId: box.id,
        weightOz: totalOz,
        lengthIn: dims.l ? Number(dims.l) : null,
        widthIn: dims.w ? Number(dims.w) : null,
        heightIn: dims.h ? Number(dims.h) : null,
      });
      if (ok) {
        savedSnapRef.current = snap;
        setAutoSave("saved");
      } else {
        setAutoSave("idle");
      }
    }, 900);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalOz, dims.l, dims.w, dims.h, disabled, box.labelPdfUrl]);

  // Prefill an untouched box from the station's remembered parcel defaults
  // (after mount — localStorage isn't available during server render).
  useEffect(() => {
    setPresets(loadBoxPresets());
    if (box.weightOz || box.lengthIn || box.widthIn || box.heightIn) return;
    try {
      const raw = localStorage.getItem(PARCEL_DEFAULTS_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { weight?: string; l?: string; w?: string; h?: string };
      const w = splitOz(Number(d.weight) || 0);
      setWLb((cur) => cur || w.lb);
      setWOz((cur) => cur || w.oz);
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

  function applyPreset(name: string) {
    const p = presets.find((x) => x.name === name);
    if (!p) return;
    const w = splitOz(Number(p.weight) || 0);
    setWLb(w.lb);
    setWOz(w.oz);
    setDims({ l: p.l, w: p.w, h: p.h });
  }

  function savePreset() {
    const name = window.prompt('Preset name (e.g. "Handbag 12×10×6"):', "");
    if (!name?.trim()) return;
    const next = [
      { name: name.trim().slice(0, 40), weight: String(totalOz || ""), ...dims },
      ...presets.filter((p) => p.name !== name.trim()),
    ];
    setPresets(next);
    saveBoxPresets(next);
  }

  // Label already purchased: show it — carrier/tracking are locked in unless voided.
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
          {!disabled && box.labelId ? (
            <button
              type="button"
              disabled={voiding}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Void this label for a refund? The tracking number dies and the box will need a new label.",
                  )
                )
                  return;
                setVoiding(true);
                try {
                  await api({ action: "void-label", boxId: box.id });
                } finally {
                  setVoiding(false);
                }
              }}
              className="ml-auto h-8 rounded-chip border border-[#E5484D]/40 px-3 text-[10.5px] font-semibold uppercase leading-8 tracking-[0.1em] text-[#E5484D]/80 hover:bg-[#E5484D]/10 hover:text-[#E5484D] disabled:opacity-40"
            >
              {voiding ? "Voiding…" : "Void label"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {shipEngineEnabled && !manual && !disabled ? (
        <>
          {/* Box preset -> parcel details -> rates -> buy */}
          <div className="flex flex-wrap items-center gap-1.5">
            {presets.length ? (
              <select
                value=""
                onChange={(e) => applyPreset(e.target.value)}
                className="h-9 max-w-[150px] rounded-chip border border-white/20 bg-[#1c1c20] px-2 text-[11.5px] text-white/80 outline-none focus:border-accent"
              >
                <option value="">Box preset…</option>
                {presets.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={savePreset}
              disabled={!totalOz && !dims.l}
              title="Save these dims + weight as a named preset"
              className="h-9 rounded-chip border border-white/20 px-2.5 text-[10px] uppercase tracking-[0.08em] text-white/50 hover:border-accent hover:text-white disabled:opacity-40"
            >
              ＋ preset
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              inputMode="numeric"
              value={wLb}
              onChange={(e) => setWLb(e.target.value)}
              placeholder="lb"
              className="h-9 w-[54px] rounded-chip border border-white/20 bg-[#1c1c20] px-2 font-mono text-[12px] text-white outline-none focus:border-accent"
            />
            <input
              inputMode="numeric"
              value={wOz}
              onChange={(e) => setWOz(e.target.value)}
              placeholder="oz"
              className="h-9 w-[54px] rounded-chip border border-white/20 bg-[#1c1c20] px-2 font-mono text-[12px] text-white outline-none focus:border-accent"
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
            {multiBoxActive ? (
              // Weights auto-save — this is just the status, nothing to click.
              <span
                className={clsx(
                  "flex h-9 items-center rounded-chip border px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em]",
                  autoSave === "saving"
                    ? "border-accent/50 text-accent"
                    : autoSave === "saved" || box.weightOz
                      ? "border-[#4E9A6A]/50 text-[#4E9A6A]"
                      : "border-white/20 text-white/40",
                )}
              >
                {autoSave === "saving"
                  ? "Saving…"
                  : autoSave === "saved" || box.weightOz
                    ? "Saved ✓"
                    : "Enter weight"}
              </span>
            ) : (
              <button
                type="button"
                disabled={totalOz <= 0 || loadingRates}
                onClick={async () => {
                  setLoadingRates(true);
                  setRates(null);
                  setApplied(null);
                  saveParcelDefaults(String(totalOz), dims);
                  try {
                    const saved = await api({
                      action: "parcel",
                      boxId: box.id,
                      weightOz: totalOz,
                      lengthIn: dims.l ? Number(dims.l) : null,
                      widthIn: dims.w ? Number(dims.w) : null,
                      heightIn: dims.h ? Number(dims.h) : null,
                    });
                    if (!saved) return;
                    savedSnapRef.current = JSON.stringify({
                      w: totalOz,
                      l: dims.l,
                      wd: dims.w,
                      h: dims.h,
                    });
                    setAutoSave("saved");
                    const data = (await api({
                      action: "rates",
                      boxId: box.id,
                      signature,
                      insure,
                      insuredValue: insure && insureAmt.trim() ? Number(insureAmt) : null,
                    })) as { rates?: Rate[]; applied?: { signature: boolean; insuredValue: number | null } } | null;
                    if (data?.rates) setRates(data.rates);
                    if (data?.applied) setApplied(data.applied);
                  } finally {
                    setLoadingRates(false);
                  }
                }}
                className="h-9 rounded-chip bg-accent px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink hover:opacity-90 disabled:opacity-40"
              >
                {loadingRates ? "Quoting…" : "Get rates"}
              </button>
            )}
          </div>

          {multiBoxActive ? (
            <p className="text-[10.5px] text-white/45">
              Rates for the whole order are in the “Ship all boxes together” card below.
            </p>
          ) : null}

          {/* Signature + insurance carried into whichever rate gets bought */}
          <div
            className={clsx(
              "flex flex-wrap items-center gap-3 text-[11.5px] text-white/70",
              multiBoxActive && "hidden",
            )}
          >
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={signature}
                onChange={(e) => setSignature(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#B08D3E]"
              />
              Signature
              {signatureDefault ? <span className="text-[10px] text-accent">(client default)</span> : null}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={insure}
                onChange={(e) => setInsure(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#B08D3E]"
              />
              Insure
            </label>
            {insure ? (
              <input
                inputMode="numeric"
                value={insureAmt}
                onChange={(e) => setInsureAmt(e.target.value)}
                placeholder="$ auto"
                title="Declared value — blank insures for the box contents' invoice value"
                className="h-8 w-[76px] rounded-chip border border-white/20 bg-[#1c1c20] px-2 font-mono text-[11.5px] text-white outline-none focus:border-accent"
              />
            ) : null}
          </div>

          {rates && !multiBoxActive ? (
            rates.length === 0 ? (
              <p className="text-[11.5px] text-white/50">No rates returned — check the address/weight.</p>
            ) : (
              <div className="space-y-1">
                {applied ? (
                  <p className="text-[10.5px] text-white/45">
                    Quotes include{applied.signature ? " signature confirmation" : ""}
                    {applied.signature && applied.insuredValue ? " ·" : ""}
                    {applied.insuredValue ? ` $${applied.insuredValue.toLocaleString()} insurance` : ""}
                    {!applied.signature && !applied.insuredValue ? " no signature or insurance" : ""}
                    .
                  </p>
                ) : null}
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

/**
 * Multi-box orders: one shipping method for every box. Quotes each packed box,
 * offers only the services every box can use, priced as total + average per
 * box, and buys all the labels in one click.
 */
function MultiBoxShipping({
  boxes,
  signatureDefault,
  api,
  onSwitchToPerBox,
}: {
  boxes: Array<BoxShape & { label: string }>;
  signatureDefault: boolean;
  api: (body: Record<string, unknown>) => Promise<{
    options?: RateAllOption[];
    warning?: string;
    boxCount?: number;
  } | null>;
  /** Opt out into per-box rating (mixed speeds across boxes). */
  onSwitchToPerBox: () => void;
}) {
  const [options, setOptions] = useState<RateAllOption[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [signature, setSignature] = useState(signatureDefault);
  const [insure, setInsure] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const missingWeight = boxes.filter((b) => !b.weightOz);

  const optionKey = (o: RateAllOption) => `${o.carrier}::${o.serviceCode}`;
  const selected = options?.find((o) => optionKey(o) === selectedKey) || null;

  return (
    <div className="rounded-card border border-accent/40 p-5">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
          SHIP ALL {boxes.length} BOXES TOGETHER
        </div>
        <span className="font-mono text-[10.5px] text-white/40">one method, every box</span>
      </div>
      {missingWeight.length ? (
        <p className="text-[11.5px] text-white/50">
          Save weight/dims on box{missingWeight.length === 1 ? "" : "es"}{" "}
          {missingWeight.map((b) => b.label).join(", ")} above first, then rate the whole order
          here.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-white/70">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={signature}
                onChange={(e) => setSignature(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#B08D3E]"
              />
              Signature
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={insure}
                onChange={(e) => setInsure(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#B08D3E]"
              />
              Insure (contents value)
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                setOptions(null);
                setSelectedKey("");
                setNotice(null);
                try {
                  const data = await api({ action: "rates-all", signature, insure });
                  if (data?.options) {
                    setOptions(data.options);
                    // Preselect the cheapest (options arrive sorted by total).
                    if (data.options[0]) {
                      setSelectedKey(`${data.options[0].carrier}::${data.options[0].serviceCode}`);
                    }
                  }
                } finally {
                  setLoading(false);
                }
              }}
              className="ml-auto h-9 rounded-chip bg-accent px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink hover:opacity-90 disabled:opacity-40"
            >
              {loading ? "Quoting…" : `Get rates for all ${boxes.length} boxes`}
            </button>
          </div>

          {options ? (
            options.length === 0 ? (
              <p className="mt-2 text-[11.5px] text-white/50">
                No service is available for every box — rate the boxes individually above.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {/* PirateShip-style: pick the service for the whole order, then one pay click. */}
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  disabled={buying}
                  className="h-10 w-full rounded-chip border border-white/20 bg-[#1c1c20] px-3 text-[12.5px] text-white outline-none focus:border-accent disabled:opacity-50"
                >
                  {options.map((o) => (
                    <option key={optionKey(o)} value={optionKey(o)}>
                      {o.carrier} {o.service}
                      {o.deliveryDays ? ` (~${o.deliveryDays}d)` : ""} — ${o.total.toFixed(2)} total
                      · ${o.avgPerBox.toFixed(2)}/box
                    </option>
                  ))}
                </select>
                {selected ? (
                  <>
                    <div className="flex items-baseline justify-between rounded-chip border border-white/10 bg-white/5 px-3 py-2">
                      <span className="text-[11.5px] text-white/60">
                        {boxes.length} boxes · avg ${selected.avgPerBox.toFixed(2)}/box
                        {selected.deliveryDays ? ` · ~${selected.deliveryDays}d` : ""}
                      </span>
                      <span className="font-mono text-[15px] font-semibold text-accent">
                        ${selected.total.toFixed(2)}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={buying}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Buy ${boxes.length} ${selected.carrier} ${selected.service} labels for $${selected.total.toFixed(2)} total?`,
                          )
                        )
                          return;
                        setBuying(true);
                        try {
                          const data = await api({
                            action: "buy-labels-all",
                            purchases: selected.boxes.map((b) => ({
                              boxId: b.boxId,
                              rateId: b.rateId,
                            })),
                          });
                          if (data?.warning) setNotice(data.warning);
                          else if (data) setOptions(null);
                        } finally {
                          setBuying(false);
                        }
                      }}
                      className="h-11 w-full rounded-chip bg-accent text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition hover:opacity-90 disabled:opacity-40"
                    >
                      {buying
                        ? "Buying labels…"
                        : `Buy ${boxes.length} labels — $${selected.total.toFixed(2)}`}
                    </button>
                  </>
                ) : null}
              </div>
            )
          ) : null}
          {notice ? <p className="mt-2 text-[11.5px] text-[#E5484D]">{notice}</p> : null}
        </>
      )}
      <button
        type="button"
        onClick={onSwitchToPerBox}
        className="mt-2 text-[10px] uppercase tracking-[0.08em] text-white/40 hover:text-white/70"
      >
        different speeds per box? rate boxes individually instead
      </button>
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

/** Full-screen photo viewer so the packer can identify a piece — hero image
 *  plus a carousel of every photo, like the storefront PDP. Arrows, thumbnail
 *  strip, click-outside or ✕ to close. */
function ItemGalleryModal({
  sku,
  title,
  images,
  onClose,
}: {
  sku: string;
  title: string;
  images: string[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const current = images[Math.min(index, Math.max(0, count - 1))] || null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && count > 1) setIndex((i) => (i + 1) % count);
      if (e.key === "ArrowLeft" && count > 1) setIndex((i) => (i - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-2xl flex-col rounded-card border border-white/15 bg-[#1c1c20] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-white">{title}</div>
            <div className="font-mono text-[11px] text-white/40">
              {sku}
              {count > 1 ? ` · photo ${Math.min(index + 1, count)} of ${count}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-chip border border-white/20 px-3 py-1.5 text-[12px] text-white/70 hover:border-accent hover:text-white"
          >
            ✕ Close
          </button>
        </div>

        <div className="relative aspect-square w-full overflow-hidden rounded-card bg-black/40">
          {current ? (
            <Image
              src={current}
              alt={title}
              fill
              sizes="(max-width: 768px) 100vw, 672px"
              className="object-contain"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[12.5px] text-white/40">
              No photos on file for this piece.
            </div>
          )}
          {count > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => setIndex((i) => (i - 1 + count) % count)}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-[18px] text-white/80 hover:bg-black/80 hover:text-white"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => setIndex((i) => (i + 1) % count)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-[18px] text-white/80 hover:bg-black/80 hover:text-white"
              >
                ›
              </button>
            </>
          ) : null}
        </div>

        {count > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {images.map((url, i) => (
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                className={clsx(
                  "relative h-16 w-16 shrink-0 overflow-hidden rounded border transition",
                  i === index ? "border-accent" : "border-white/15 opacity-60 hover:opacity-100",
                )}
              >
                <Image src={url} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
