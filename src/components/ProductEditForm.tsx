"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { formatMargin, marginFor, marginTone, marginToneClass } from "@/lib/pricing";
import { Placeholder } from "@/components/Placeholder";

export type ProductEditData = {
  sku: string;
  inDb: boolean;
  soldOut: boolean;
  title: string;
  titleOverridden: boolean;
  brand: string;
  brandOverridden: boolean;
  category: string;
  description: string;
  origin: string;
  provenance: string;
  marks: string;
  dimensions: string;
  vaultLocation: string;
  era: string;
  eraOverridden: boolean;
  material: string;
  materialOverridden: boolean;
  condition: string;
  conditionOverridden: boolean;
  inventoryCost: number | null;
  cost: number | null;
  costOverridden: boolean;
  listPrice: number | null;
  listPriceOverridden: boolean;
  salePrice: number | null;
  effectivePrice: number | null;
  marginAmount: number | null;
  marginPercent: number | null;
  images: string[];
  imagesOverridden: boolean;
  updatedAt: string | null;
  updatedBy: string;
};

const labelClass = "micro-badge text-[10px] tracking-[0.14em] text-muted";
const fieldClass =
  "h-10 w-full rounded-chip border border-border bg-ground px-3 text-[13px] text-ink outline-none focus:border-accent";
const moneyFieldClass =
  "h-10 w-full rounded-chip border border-border bg-ground px-3 font-mono text-[13px] text-ink outline-none focus:border-accent";
const textareaClass =
  "w-full rounded-chip border border-border bg-ground px-3 py-2 text-[13px] text-ink outline-none focus:border-accent";

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? <span className="text-[10.5px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function ProductEditForm({ initial, backHref }: { initial: ProductEditData; backHref: string }) {
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initial.title);
  const [brand, setBrand] = useState(initial.brand);
  const [category, setCategory] = useState(initial.category);
  const [description, setDescription] = useState(initial.description);
  const [era, setEra] = useState(initial.era);
  const [material, setMaterial] = useState(initial.material);
  const [origin, setOrigin] = useState(initial.origin);
  const [provenance, setProvenance] = useState(initial.provenance);
  const [condition, setCondition] = useState(initial.condition);
  const [marks, setMarks] = useState(initial.marks);
  const [dimensions, setDimensions] = useState(initial.dimensions);
  const [vaultLocation, setVaultLocation] = useState(initial.vaultLocation);

  const [cost, setCost] = useState(initial.cost != null ? String(initial.cost) : "");
  const [listPrice, setListPrice] = useState(initial.listPrice != null ? String(initial.listPrice) : "");
  const [salePrice, setSalePrice] = useState(initial.salePrice != null ? String(initial.salePrice) : "");
  const [images, setImages] = useState<string[]>(initial.images);
  const [imageUrlInput, setImageUrlInput] = useState("");

  const costNum = cost.trim() ? Number(cost) : null;
  const listPriceNum = listPrice.trim() ? Number(listPrice) : null;
  const salePriceNum = salePrice.trim() ? Number(salePrice) : null;
  const effectivePrice = salePriceNum ?? listPriceNum;
  const margin = marginFor(costNum, effectivePrice);

  function showToast(kind: "success" | "error", text: string) {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 4000);
  }

  function moveImage(index: number, dir: -1 | 1) {
    setImages((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function addImageUrl() {
    const url = imageUrlInput.trim();
    if (!url) return;
    setImages((prev) => [...prev, url]);
    setImageUrlInput("");
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/staff/products/${encodeURIComponent(initial.sku)}/image`, {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok || data.error || !data.url) {
        showToast("error", data.error || "Could not upload image.");
        return;
      }
      setImages((prev) => [...prev, data.url as string]);
    } catch {
      showToast("error", "Could not upload image.");
    } finally {
      setUploading(false);
    }
  }

  function handleSave() {
    start(async () => {
      const res = await fetch(`/api/staff/products/${encodeURIComponent(initial.sku)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          brand,
          category,
          description,
          era,
          material,
          origin,
          provenance,
          condition,
          marks,
          dimensions,
          vaultLocation,
          cost: costNum,
          listPrice: listPriceNum,
          salePrice: salePriceNum,
          images,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        showToast("error", data.error || "Could not save product.");
        return;
      }
      showToast("success", "Product saved.");
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      {toast ? (
        <div
          className={
            "fixed right-6 top-6 z-50 rounded-chip border px-4 py-3 text-[12.5px] shadow-lg " +
            (toast.kind === "success"
              ? "border-[#4E9A6A]/40 bg-[#F0F8F3] text-[#2F6B47]"
              : "border-danger/40 bg-danger/5 text-danger")
          }
        >
          {toast.text}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={backHref} className="text-[11px] text-muted hover:text-ink">
            ← Back to catalog
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-[22px] font-semibold text-ink">Edit product</h1>
            {initial.soldOut ? (
              <span className="micro-badge rounded-chip bg-danger/10 px-2 py-0.5 text-[10px] text-danger">
                SOLD
              </span>
            ) : null}
            {!initial.inDb ? (
              <span className="micro-badge rounded-chip bg-danger/10 px-2 py-0.5 text-[10px] text-danger">
                NOT IN INVENTORY
              </span>
            ) : null}
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{initial.sku}</div>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={handleSave}
          className="h-10 rounded-chip bg-ink px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Images */}
      <div className="space-y-3 rounded-card border border-border bg-surface p-6">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">IMAGES</div>
        {images.length === 0 ? (
          <div className="rounded-chip border border-border px-4 py-6 text-center text-[12px] text-muted">
            No images yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((url, i) => (
              <div key={`${url}-${i}`} className="overflow-hidden rounded-chip border border-border bg-ground">
                <div className="aspect-square">
                  <Placeholder imageSrc={url} alt={`${initial.sku} photo ${i + 1}`} className="h-full w-full" />
                </div>
                <div className="flex items-center justify-between px-2 py-1.5">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => moveImage(i, -1)}
                      className="text-[11px] text-muted hover:text-ink disabled:opacity-30"
                      aria-label="Move earlier"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={i === images.length - 1}
                      onClick={() => moveImage(i, 1)}
                      className="text-[11px] text-muted hover:text-ink disabled:opacity-30"
                      aria-label="Move later"
                    >
                      →
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="text-[11px] text-muted hover:text-danger"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <input
            type="text"
            value={imageUrlInput}
            onChange={(e) => setImageUrlInput(e.target.value)}
            placeholder="Paste an image URL…"
            className="h-9 min-w-[240px] flex-1 rounded-chip border border-border bg-ground px-3 text-[12px] text-ink outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={addImageUrl}
            disabled={!imageUrlInput.trim()}
            className="h-9 rounded-chip border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary hover:border-accent hover:text-ink disabled:opacity-50"
          >
            Add URL
          </button>
          <span className="text-[11px] text-muted">or</span>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="h-9 rounded-chip bg-ink px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ground disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Upload photo"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
        {initial.imagesOverridden ? (
          <p className="text-[10.5px] text-muted">
            Custom image set — overrides the photos synced from inventory.
          </p>
        ) : null}
      </div>

      {/* Basic info */}
      <div className="space-y-4 rounded-card border border-border bg-surface p-6">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">BASIC INFO</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="NAME" hint={initial.titleOverridden ? "Manual override" : "From inventory"}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="BRAND" hint={initial.brandOverridden ? "Manual override" : "From inventory"}>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="CATEGORY">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Handbags, Jewelry, Watches"
              className={fieldClass}
            />
          </Field>
          <Field label="SKU">
            <input value={initial.sku} disabled className={fieldClass + " opacity-60"} />
          </Field>
        </div>
        <Field label="DESCRIPTION">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={textareaClass}
          />
        </Field>
      </div>

      {/* Pricing */}
      <div className="space-y-4 rounded-card border border-border bg-surface p-6">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">PRICING</div>
        <div className="grid grid-cols-3 gap-4">
          <Field
            label="COST"
            hint={
              initial.costOverridden
                ? "Manual override"
                : initial.inventoryCost != null
                  ? "From inventory"
                  : "Not set in inventory"
            }
          >
            <div className="flex items-center gap-1">
              <span className="text-muted">$</span>
              <input
                type="number"
                min={0}
                step="1"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className={moneyFieldClass}
              />
            </div>
          </Field>
          <Field
            label="LIST PRICE"
            hint={initial.listPriceOverridden ? "Manual override" : "Calculated: cost ÷ 0.8"}
          >
            <div className="flex items-center gap-1">
              <span className="text-muted">$</span>
              <input
                type="number"
                min={0}
                step="1"
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                className={moneyFieldClass}
              />
            </div>
          </Field>
          <Field label="SALE PRICE (OVERRIDE)" hint="Optional — leave blank when not on sale">
            <div className="flex items-center gap-1">
              <span className="text-muted">$</span>
              <input
                type="number"
                min={0}
                step="1"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className={moneyFieldClass}
              />
            </div>
          </Field>
        </div>
        <div className="rounded-chip border border-border bg-ground px-4 py-3">
          <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">PROFIT MARGIN</span>
          <div className="mt-1 font-mono text-[16px]">
            <span className={marginToneClass(marginTone(margin.percent))}>{formatMargin(margin)}</span>
            <span className="ml-2 text-[11px] text-muted">
              based on {salePriceNum != null ? "sale price" : "list price"}
            </span>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-4 rounded-card border border-border bg-surface p-6">
        <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">METADATA</div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="ERA" hint={initial.eraOverridden ? "Manual override" : "From inventory"}>
            <input value={era} onChange={(e) => setEra(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="MATERIAL" hint={initial.materialOverridden ? "Manual override" : "From inventory"}>
            <input value={material} onChange={(e) => setMaterial(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="CONDITION" hint={initial.conditionOverridden ? "Manual override" : "From inventory"}>
            <input value={condition} onChange={(e) => setCondition(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="ORIGIN">
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="PROVENANCE">
            <input value={provenance} onChange={(e) => setProvenance(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="MARKS">
            <input value={marks} onChange={(e) => setMarks(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="DIMENSIONS">
            <input value={dimensions} onChange={(e) => setDimensions(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="VAULT LOCATION">
            <input
              value={vaultLocation}
              onChange={(e) => setVaultLocation(e.target.value)}
              className={fieldClass}
            />
          </Field>
        </div>
      </div>

      {initial.updatedAt ? (
        <p className="text-[11px] text-muted">
          Last edited {new Date(initial.updatedAt).toLocaleString("en-US")}
          {initial.updatedBy ? ` by ${initial.updatedBy}` : ""}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={handleSave}
          className="h-10 rounded-chip bg-ink px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href={backHref} className="text-[11px] text-muted hover:text-ink">
          Back to catalog
        </Link>
      </div>
    </div>
  );
}
