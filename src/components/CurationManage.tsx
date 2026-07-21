"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { money } from "@/lib/format";
import { portalDisplayTitle, portalShowSkuLine } from "@/components/PortalItemLine";
import { Placeholder } from "@/components/Placeholder";
import { TrashIcon } from "@/components/icons";
import { clsx } from "@/lib/clsx";
import { CurationBookCall } from "@/components/CurationBookCall";
import { SimilarItemsCarousel, type SimilarItem } from "@/components/SimilarItemsLink";
import { Logo } from "@/components/Logo";

type Decision = "" | "approve" | "maybe" | "decline";

type CurationItem = {
  sku: string;
  title: string;
  brand: string;
  condition: string;
  cost: number | null;
  price: number;
  imageUrl: string | null;
  imageUrls: string[];
  decision: Decision;
  note: string;
  liveAdded?: boolean;
};

type CurationShare = {
  token: string;
  clientName: string;
  invoiceDate: string;
  note: string;
  items: CurationItem[];
  itemCount: number;
  heroSku: string | null;
  sessionEnded: boolean;
  revoked: boolean;
  revision: number;
  expiresAt: string | null;
  createdAt: string | null;
  quoteId: string | null;
  linkedBuyerId: string | null;
  callRequestedAt: string | null;
};

type ResolvedPreview = {
  sku: string;
  title: string;
  brand: string;
  condition: string;
  cost: number | null;
  imageUrl: string | null;
  imageUrls: string[];
};

type BulkDraftItem = ResolvedPreview & { price: number | null };

const DECISION_META: Record<
  Exclude<Decision, "">,
  { label: string; activeClass: string; idleClass: string }
> = {
  approve: {
    label: "Approve",
    activeClass: "border-[#4E9A6A] bg-[#4E9A6A] text-white",
    idleClass: "border-border text-secondary hover:border-[#4E9A6A] hover:text-[#4E9A6A]",
  },
  maybe: {
    label: "Maybe",
    activeClass: "border-accent bg-accent text-ink",
    idleClass: "border-border text-secondary hover:border-accent hover:text-accent",
  },
  decline: {
    label: "Decline",
    activeClass: "border-danger bg-danger text-white",
    idleClass: "border-border text-secondary hover:border-danger hover:text-danger",
  },
};

function callStartedKey(token: string): string {
  return `curation-call-started:${token}`;
}

function formatElapsed(ms: number): string {
  if (!ms || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function computeStats(items: CurationItem[], callStartedAtMs: number | null, nowMs: number) {
  let approve = 0;
  let maybe = 0;
  let decline = 0;
  let pending = 0;
  let cart = 0;
  let costTotal = 0;
  for (const it of items) {
    if (it.decision === "approve") {
      approve += 1;
      cart += it.price;
      if (it.cost != null) costTotal += it.cost;
    } else if (it.decision === "maybe") maybe += 1;
    else if (it.decision === "decline") decline += 1;
    else pending += 1;
  }
  const elapsedMs = callStartedAtMs ? nowMs - callStartedAtMs : 0;
  const hours = elapsedMs > 0 ? elapsedMs / 3600000 : 0;
  const perHour = hours > 0 ? approve / hours : 0;
  const margin = cart - costTotal;
  const marginPct = cart > 0 ? (margin / cart) * 100 : null;
  return { approve, maybe, decline, pending, cart, rev: cart, pieces: approve, margin, marginPct, elapsedMs, perHour };
}

/** Margin color bands matching the marketing-site review table: green ≥18%, amber below, red if negative. */
function marginColorClass(percent: number | null): string {
  if (percent == null) return "text-secondary";
  if (percent < 0) return "text-danger";
  if (percent < 18) return "text-accent";
  return "text-[#4E9A6A]";
}

function expiresLabel(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export function CurationManage({ initialShare, buyerUrl }: { initialShare: CurationShare; buyerUrl: string }) {
  const [share, setShare] = useState(initialShare);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [extendHours, setExtendHours] = useState("168");
  const editingSku = useRef<Set<string>>(new Set());
  const metaEditing = useRef(false);

  // -- Call timer (Start call / elapsed / items-per-hour) --------------------
  const [callStartedAtMs, setCallStartedAtMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(callStartedKey(share.token));
      const ms = raw ? Number(raw) : NaN;
      if (Number.isFinite(ms) && ms > 0) setCallStartedAtMs(ms);
    } catch {
      /* ignore */
    }
  }, [share.token]);

  useEffect(() => {
    if (!callStartedAtMs || share.sessionEnded) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [callStartedAtMs, share.sessionEnded]);

  function startCall() {
    const ms = Date.now();
    setCallStartedAtMs(ms);
    setNow(ms);
    try {
      sessionStorage.setItem(callStartedKey(share.token), String(ms));
    } catch {
      /* ignore */
    }
  }

  // -- Live poll ---------------------------------------------------------
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/staff/curation/${share.token}`, {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as { share?: CurationShare };
        if (data.share && data.share.revision >= share.revision) {
          setShare((prev) => ({
            ...data.share!,
            clientName: metaEditing.current ? prev.clientName : data.share!.clientName,
            invoiceDate: metaEditing.current ? prev.invoiceDate : data.share!.invoiceDate,
            items: data.share!.items.map((incoming) => {
              if (!editingSku.current.has(incoming.sku)) return incoming;
              const local = prev.items.find((it) => it.sku === incoming.sku);
              return local
                ? { ...incoming, price: local.price, decision: local.decision, note: local.note }
                : incoming;
            }),
          }));
        }
      } catch {
        /* ignore transient poll failures */
      }
    }, 2500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share.token]);

  const stats = computeStats(share.items, callStartedAtMs, now);

  function savePrice(sku: string, value: string) {
    const price = Number(value);
    setShare((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.sku === sku ? { ...it, price: Number.isFinite(price) ? price : it.price } : it)),
    }));
    editingSku.current.add(sku);
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/price`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, price }),
      });
      editingSku.current.delete(sku);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not update price.");
      }
    });
  }

  function setItemDecision(sku: string, decision: Decision) {
    setShare((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.sku === sku ? { ...it, decision } : it)),
    }));
    editingSku.current.add(sku);
    fetch(`/api/curation/${share.token}/decision`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, decision }),
    })
      .catch(() => {})
      .finally(() => editingSku.current.delete(sku));
  }

  function toggleDecision(sku: string, decision: Exclude<Decision, "">) {
    const current = share.items.find((it) => it.sku === sku)?.decision;
    setItemDecision(sku, current === decision ? "" : decision);
  }

  function removeItem(sku: string) {
    if (!window.confirm(`Remove ${sku} from this curation link?`)) return;
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/remove-item`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not remove item.");
        return;
      }
      setShare((prev) => ({
        ...prev,
        items: prev.items.filter((it) => it.sku !== sku),
        itemCount: prev.itemCount - 1,
        heroSku: prev.heroSku === sku ? null : prev.heroSku,
      }));
    });
  }

  function saveNote(sku: string, note: string) {
    setShare((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.sku === sku ? { ...it, note } : it)),
    }));
    editingSku.current.add(sku);
    fetch(`/api/curation/${share.token}/note`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, note }),
    })
      .catch(() => {})
      .finally(() => editingSku.current.delete(sku));
  }

  // -- Live add (scan → preview → "Share to Live View") ----------------------
  const [addFolded, setAddFolded] = useState(false);
  const [addSku, setAddSku] = useState("");
  const [addPreview, setAddPreview] = useState<ResolvedPreview | null>(null);
  const [addPrice, setAddPrice] = useState("");
  const [addStatus, setAddStatus] = useState<string | null>(null);

  function lookupForAdd() {
    const sku = addSku.trim();
    if (!sku) return;
    setAddStatus(null);
    setError(null);
    const existing = share.items.find((it) => it.sku.toLowerCase() === sku.toLowerCase());
    if (existing) {
      // Already on the link — no need to re-add it, just bring it back into the
      // hero view so the rep can keep talking about it with the buyer.
      featureExistingItem(existing.sku);
      setAddSku("");
      return;
    }
    start(async () => {
      const res = await fetch("/api/staff/curation/resolve", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skusText: sku }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        items?: ResolvedPreview[];
        missing?: string[];
      };
      const resolved = data.items?.[0];
      if (!resolved || data.missing?.length) {
        setAddStatus(`SKU "${sku}" was not found in inventory.`);
        return;
      }
      setAddPreview(resolved);
      setAddPrice(
        resolved.cost != null && resolved.cost > 0 ? String(Math.round(resolved.cost / 0.8)) : "",
      );
    });
  }

  function shareToLiveView() {
    if (!addPreview) return;
    const price = Number(addPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a price above $0 before sharing to the live view.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/add-item`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: addPreview.sku,
          title: addPreview.title,
          brand: addPreview.brand,
          condition: addPreview.condition,
          cost: addPreview.cost,
          price,
          imageUrl: addPreview.imageUrl,
          imageUrls: addPreview.imageUrls,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not add item.");
        return;
      }
      setMessage(`${addPreview.sku} is now featured for the client.`);
      setAddSku("");
      setAddPreview(null);
      setAddPrice("");
      setAddStatus(null);
      setAddFolded(true);
    });
  }

  function clearAddPreview() {
    setAddSku("");
    setAddPreview(null);
    setAddPrice("");
    setAddStatus(null);
  }

  // -- Bulk add (paste a list of SKUs → review/price → add to the catalog) --
  const [bulkFolded, setBulkFolded] = useState(true);
  const [bulkSkusText, setBulkSkusText] = useState("");
  const [bulkDraft, setBulkDraft] = useState<BulkDraftItem[]>([]);
  const [bulkMissing, setBulkMissing] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);

  function resolveBulkSkus() {
    const raw = bulkSkusText.trim();
    if (!raw) return;
    setBulkStatus(null);
    setError(null);
    start(async () => {
      const res = await fetch("/api/staff/curation/resolve", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skusText: raw }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: ResolvedPreview[];
        missing?: string[];
      };
      if (!res.ok || data.error || !data.items) {
        setBulkStatus(data.error || "Could not resolve SKUs.");
        return;
      }
      const already = new Set(share.items.map((it) => it.sku.toLowerCase()));
      const seen = new Set(bulkDraft.map((d) => d.sku.toLowerCase()));
      const skippedAsExisting: string[] = [];
      const additions = data.items.filter((it) => {
        const key = it.sku.toLowerCase();
        if (already.has(key)) {
          skippedAsExisting.push(it.sku);
          return false;
        }
        return !seen.has(key);
      });
      setBulkDraft((prev) => [
        ...prev,
        ...additions.map((it) => ({
          ...it,
          price: it.cost != null && it.cost > 0 ? Math.round(it.cost / 0.8) : null,
        })),
      ]);
      setBulkMissing([...(data.missing || []), ...skippedAsExisting]);
      setBulkSkusText("");
    });
  }

  function updateBulkPrice(index: number, value: string) {
    const price = Number(value);
    setBulkDraft((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, price: Number.isFinite(price) ? Math.max(0, price) : null } : it,
      ),
    );
  }

  function removeBulkRow(index: number) {
    setBulkDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function clearBulk() {
    setBulkDraft([]);
    setBulkSkusText("");
    setBulkMissing([]);
    setBulkStatus(null);
  }

  function addBulkItems() {
    if (!bulkDraft.length) return;
    const unpriced = bulkDraft.filter((it) => it.price == null || !(it.price > 0));
    if (unpriced.length) {
      setBulkStatus(
        `${unpriced.length} item${unpriced.length === 1 ? "" : "s"} need a price above $0.`,
      );
      return;
    }
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/add-items`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: bulkDraft.map((it) => ({
            sku: it.sku,
            title: it.title,
            brand: it.brand,
            condition: it.condition,
            cost: it.cost,
            price: it.price,
            imageUrl: it.imageUrl,
            imageUrls: it.imageUrls,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        added?: string[];
        alreadyPresent?: string[];
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not add items.");
        return;
      }
      const addedSet = new Set((data.added || []).map((s) => s.toLowerCase()));
      setShare((prev) => {
        const newItems = bulkDraft
          .filter((it) => addedSet.has(it.sku.toLowerCase()))
          .map((it) => ({
            sku: it.sku,
            title: it.title || it.sku,
            brand: it.brand || "",
            condition: it.condition || "",
            cost: it.cost,
            price: it.price ?? 0,
            imageUrl: it.imageUrl,
            imageUrls: it.imageUrls || [],
            decision: "" as Decision,
            note: "",
            liveAdded: true,
          }));
        return { ...prev, items: [...prev.items, ...newItems], itemCount: prev.itemCount + newItems.length };
      });
      setMessage(
        `${data.added?.length || 0} item${data.added?.length === 1 ? "" : "s"} added to the catalog.`,
      );
      clearBulk();
      setBulkFolded(true);
    });
  }

  // -- Per-item "suggest similar items" (subtle expander under each row) -----
  async function addSuggestedItem(item: SimilarItem) {
    const res = await fetch(`/api/staff/curation/${share.token}/add-items`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            sku: item.sku,
            title: item.title,
            brand: item.brand,
            condition: item.condition,
            price: item.price ?? 0,
            imageUrl: item.imageUrl,
          },
        ],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; added?: string[] };
    if (!res.ok || data.error || !data.added?.length) {
      setError(data.error || "Could not add that item.");
      throw new Error(data.error || "Could not add item.");
    }
    setShare((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          sku: item.sku,
          title: item.title || item.sku,
          brand: item.brand || "",
          condition: item.condition || "",
          cost: null,
          price: item.price ?? 0,
          imageUrl: item.imageUrl,
          imageUrls: [],
          decision: "" as Decision,
          note: "",
          liveAdded: true,
        },
      ],
      itemCount: prev.itemCount + 1,
    }));
    setMessage(`${item.sku} added to the catalog.`);
  }

  /** Same idea, but features the item live for the buyer right away — for when the rep wants to pivot the call to it immediately rather than just adding it to browse. */
  async function addSuggestedItemAsHero(item: SimilarItem) {
    const res = await fetch(`/api/staff/curation/${share.token}/add-item`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: item.sku,
        title: item.title,
        brand: item.brand,
        condition: item.condition,
        price: item.price ?? 0,
        imageUrl: item.imageUrl,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok || data.error) {
      setError(data.error || "Could not feature that item.");
      throw new Error(data.error || "Could not feature item.");
    }
    setShare((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          sku: item.sku,
          title: item.title || item.sku,
          brand: item.brand || "",
          condition: item.condition || "",
          cost: null,
          price: item.price ?? 0,
          imageUrl: item.imageUrl,
          imageUrls: [],
          decision: "" as Decision,
          note: "",
          liveAdded: true,
        },
      ],
      itemCount: prev.itemCount + 1,
      heroSku: item.sku,
    }));
    setMessage(`${item.sku} is now featured for the client.`);
  }

  /** Re-feature a SKU that's already on this link — brings it back into the
   *  hero view without re-adding it (which the server rejects as a dupe). */
  function featureExistingItem(sku: string) {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/feature`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not feature that item.");
        return;
      }
      setShare((prev) => ({ ...prev, heroSku: sku }));
      setMessage(`${sku} is back in the hero view for the client.`);
    });
  }

  function endSession() {
    setError(null);
    if (stats.maybe > 0) {
      const reviewMaybes = window.confirm(
        `You still have ${stats.maybe} Maybe item${stats.maybe === 1 ? "" : "s"}.\n\n` +
          "OK = go back and review Maybes first\nCancel = continue ending the session",
      );
      if (reviewMaybes) {
        setMessage("Review Maybe items in the catalog below, then end the session when ready.");
        return;
      }
    } else if (stats.pending > 0) {
      if (
        !window.confirm(
          `You still have ${stats.pending} pending item${stats.pending === 1 ? "" : "s"} with no decision.\n\n` +
            "End session anyway and finalize current selections?",
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(
        "End this sales session?\n\n" +
          "• Selections will be finalized (buyer catalog becomes read-only)\n" +
          "• Live add stops; the featured item is cleared\n" +
          "• Link stays available until expiry (or revoke)\n" +
          (share.quoteId
            ? "• The linked order request updates to match: declined items come off (holds released); items already on the order stay unless declined; anything you added live only joins the order if it was approved\n"
            : "") +
          "• You can export the final CSV afterward",
      )
    ) {
      return;
    }

    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/end`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        orderSynced?: boolean;
        orderSyncError?: string | null;
        canCreateOrder?: boolean;
        approvedCount?: number;
        removedCount?: number;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not end session.");
        return;
      }
      setShare((prev) => ({ ...prev, sessionEnded: true, heroSku: null }));
      try {
        sessionStorage.removeItem(callStartedKey(share.token));
      } catch {
        /* ignore */
      }
      if (share.quoteId && data.orderSynced) {
        const removed = data.removedCount ?? 0;
        setMessage(
          removed > 0
            ? `Session ended — order request updated (${removed} declined item${removed === 1 ? "" : "s"} removed, holds released).`
            : "Session ended — order request updated to match today's prices.",
        );
      } else if (share.quoteId && data.orderSyncError) {
        setMessage("Session ended, but the linked order request couldn't be updated automatically.");
        setError(data.orderSyncError);
      } else if (
        data.canCreateOrder &&
        window.confirm(
          `Create an order request from the ${data.approvedCount ?? 0} approved item${data.approvedCount === 1 ? "" : "s"}?`,
        )
      ) {
        await createOrderFromApprovals();
      } else {
        setMessage("Session ended — the link is now read-only for the client.");
      }
      if (window.confirm("Download the final decisions CSV now?")) {
        window.location.href = `/api/staff/curation/${share.token}/export`;
      }
    });
  }

  const approvedCount = share.items.filter((it) => it.decision === "approve").length;
  const pricedCount = share.items.filter((it) => Number(it.price) > 0).length;
  const canCreateOrderRequest =
    !share.quoteId &&
    !share.revoked &&
    !!share.linkedBuyerId &&
    share.items.length > 0 &&
    (share.sessionEnded ? approvedCount > 0 : pricedCount > 0);

  async function createOrderRequest() {
    setError(null);
    if (!share.linkedBuyerId) {
      setError("Link a portal buyer first (pick one under Client call), then create the order request.");
      return;
    }
    if (share.sessionEnded && approvedCount === 0) {
      setError("No approved items to create an order from.");
      return;
    }
    if (!share.sessionEnded && pricedCount === 0) {
      setError("Add at least one priced item before creating an order request.");
      return;
    }

    const itemLabel = share.sessionEnded
      ? `${approvedCount} approved item${approvedCount === 1 ? "" : "s"}`
      : `${pricedCount} priced item${pricedCount === 1 ? "" : "s"}`;
    if (
      !window.confirm(
        `Create an order request from the ${itemLabel} for ${share.clientName || "this client"}?`,
      )
    ) {
      return;
    }

    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/create-order`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        quoteId?: string;
        quoteUrl?: string;
        itemCount?: number;
      };
      if (!res.ok || data.error || !data.quoteId) {
        setError(data.error || "Could not create the order request.");
        return;
      }
      setShare((prev) => ({ ...prev, quoteId: data.quoteId! }));
      setMessage(
        `Order request created with ${data.itemCount ?? 0} item${data.itemCount === 1 ? "" : "s"}.`,
      );
    });
  }

  async function createOrderFromApprovals() {
    const res = await fetch(`/api/staff/curation/${share.token}/create-order`, {
      method: "POST",
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      quoteId?: string;
      quoteUrl?: string;
      itemCount?: number;
    };
    if (!res.ok || data.error || !data.quoteId) {
      setError(data.error || "Could not create the order request.");
      setMessage("Session ended — the link is now read-only for the client.");
      return;
    }
    setShare((prev) => ({ ...prev, quoteId: data.quoteId! }));
    setMessage(
      `Session ended — new order request created with ${data.itemCount ?? 0} item${data.itemCount === 1 ? "" : "s"}.`,
    );
  }

  function saveMeta(patch: { clientName?: string; invoiceDate?: string }) {
    setShare((prev) => ({ ...prev, ...patch }));
    metaEditing.current = true;
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/meta`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      metaEditing.current = false;
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Could not update details.");
      }
    });
  }

  function restartExpiry() {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/extend`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: Number(extendHours) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; expiresAt?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not restart the link.");
        return;
      }
      setShare((prev) => ({ ...prev, expiresAt: data.expiresAt || prev.expiresAt }));
      setMessage("Link restarted — the countdown began again just now.");
    });
  }

  function revoke() {
    if (!window.confirm("Revoke this link? The client will immediately lose access.")) return;
    setError(null);
    start(async () => {
      const res = await fetch(`/api/staff/curation/${share.token}/revoke`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not revoke link.");
        return;
      }
      setShare((prev) => ({ ...prev, revoked: true }));
      setMessage("Link revoked.");
    });
  }

  const marginLabel =
    stats.marginPct != null
      ? `${money(Math.round(stats.margin))} · ${stats.marginPct.toFixed(0)}%`
      : money(Math.round(stats.margin));

  return (
    <div className="space-y-6">
      {/* Branded session header — same ink/gold treatment as the buyer-facing
          storefront chrome and the PDF invoice, so the seller's working view
          feels like Luxe, not an admin tool. */}
      <div className="overflow-hidden rounded-card bg-ink shadow-[0_18px_48px_-24px_rgba(22,22,26,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-5 pt-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Logo tone="light" height={22} />
              <span className="micro-badge rounded-full border border-accent/40 px-2 py-0.5 text-[9px] tracking-[0.14em] text-accent">
                CURATION SESSION
              </span>
            </div>
            <h1 className="mt-2.5 truncate text-[24px] font-semibold text-ground">
              {share.clientName || "Curation link"}
            </h1>
            <div className="mt-1 font-mono text-[11px] text-white/45">
              #{share.token.slice(0, 10)}…
              {share.quoteId ? (
                <a
                  href={`/wholesaleportal/rep/quotes/${share.quoteId}`}
                  className="ml-3 text-accent underline-offset-2 hover:underline"
                >
                  Linked order #{share.quoteId.slice(0, 10)}… — approvals sync back on end →
                </a>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className={
                "micro-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9.5px] tracking-[0.14em] " +
                (share.revoked
                  ? "border border-danger/50 text-danger"
                  : share.sessionEnded
                    ? "border border-white/25 text-white/60"
                    : "border border-[#4E9A6A]/60 text-[#7BC49A]")
              }
            >
              {!share.revoked && !share.sessionEnded ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7BC49A]" />
              ) : null}
              {share.revoked ? "REVOKED" : share.sessionEnded ? "SESSION ENDED" : "LIVE"}
            </span>
            {!share.revoked ? (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-white/50">
                  {expiresLabel(share.expiresAt)}
                </span>
                <select
                  value={extendHours}
                  onChange={(e) => setExtendHours(e.target.value)}
                  disabled={pending}
                  aria-label="Restart link for"
                  className="h-8 rounded-chip border border-white/20 bg-white/5 px-2 text-[11px] text-white/75 outline-none focus:border-accent disabled:opacity-60"
                >
                  <option value="24">24 hours</option>
                  <option value="48">48 hours</option>
                  <option value="72">3 days</option>
                  <option value="168">7 days</option>
                </select>
                <button
                  type="button"
                  disabled={pending}
                  onClick={restartExpiry}
                  className="h-8 rounded-chip border border-white/20 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/75 transition hover:border-accent hover:text-ground disabled:opacity-60"
                >
                  Restart
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-white/10 bg-white/[0.04] px-6 py-4">
          <div className="micro-badge mb-2 text-[9.5px] tracking-[0.14em] text-accent">
            BUYER LINK — SEND ANYTIME
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={buyerUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 min-w-[260px] flex-1 rounded-chip border border-white/15 bg-ink px-3 font-mono text-[12px] text-white/80 outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(buyerUrl).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="h-10 rounded-chip border border-white/20 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/75 transition hover:border-accent hover:text-ground"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={buyerUrl}
              target="_blank"
              rel="noreferrer"
              className="h-10 rounded-chip bg-accent px-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] leading-10 text-ink transition hover:opacity-90"
            >
              Open
            </a>
            <a
              href={`/api/staff/curation/${share.token}/export`}
              className="h-10 rounded-chip border border-white/20 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] leading-10 text-white/75 transition hover:border-accent hover:text-ground"
            >
              Export CSV
            </a>
            {!share.revoked ? (
              <button
                type="button"
                disabled={pending}
                onClick={revoke}
                className="h-10 rounded-chip border border-danger/50 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#D98A75] transition hover:bg-danger/15 disabled:opacity-60"
              >
                Revoke
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
      {message ? <p className="text-[12.5px] text-[#4E9A6A]">{message}</p> : null}

      {!share.quoteId && !share.revoked ? (
        <CurationBookCall
          token={share.token}
          linkedBuyerId={share.linkedBuyerId}
          initialCallRequestedAt={share.callRequestedAt}
        />
      ) : null}

      {!share.quoteId && !share.revoked ? (
        <div className="rounded-card border border-border bg-surface p-6">
          <div className="micro-badge text-[10px] tracking-[0.14em] text-accent">
            ORDER REQUEST
          </div>
          <p className="mt-1 text-[12.5px] text-secondary">
            {share.sessionEnded
              ? "Turn approved selections into an order request for the linked buyer."
              : "Save this curation list as an order request for the linked buyer — same as Create order request on Curate Order."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending || !canCreateOrderRequest}
              onClick={createOrderRequest}
              title={
                !share.linkedBuyerId
                  ? "Link a portal buyer under Client call first."
                  : share.sessionEnded && approvedCount === 0
                    ? "Approve at least one item before creating an order request."
                    : !share.sessionEnded && pricedCount === 0
                      ? "Price at least one item above $0 first."
                      : "Create an order request from this curation."
              }
              className="h-11 rounded-chip bg-accent px-6 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create order request"}
            </button>
            {!share.linkedBuyerId ? (
              <span className="text-[12px] text-muted">
                Link a portal buyer under Client call first (potential clients can&apos;t become
                order requests yet).
              </span>
            ) : share.sessionEnded && approvedCount === 0 ? (
              <span className="text-[12px] text-muted">
                Approve at least one item to create an order request.
              </span>
            ) : !canCreateOrderRequest ? (
              <span className="text-[12px] text-muted">
                Price at least one item above $0 to create an order request.
              </span>
            ) : (
              <span className="text-[12px] text-secondary">
                {share.sessionEnded
                  ? `Creates from ${approvedCount} approved item${approvedCount === 1 ? "" : "s"}.`
                  : `Creates from ${pricedCount} priced item${pricedCount === 1 ? "" : "s"}.`}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {/* 4. Live add (on the call) */}
      {!share.revoked ? (
        <div className="rounded-card border border-accent/30 bg-surface p-6">
          <div className="micro-badge mb-3 text-[10px] tracking-[0.14em] text-accent">
            LIVE — ON THE CALL
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                CLIENT NAME
              </span>
              <input
                defaultValue={share.clientName}
                disabled={share.sessionEnded}
                onBlur={(e) => saveMeta({ clientName: e.target.value })}
                className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="micro-badge text-[10px] tracking-[0.14em] text-muted">
                INVOICE DATE
              </span>
              <input
                defaultValue={share.invoiceDate}
                disabled={share.sessionEnded}
                onBlur={(e) => saveMeta({ invoiceDate: e.target.value })}
                placeholder="Optional"
                className="h-10 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
              />
            </label>
          </div>

          {share.sessionEnded ? (
            <div className="rounded-chip border border-border bg-ground px-4 py-4">
              <p className="text-[13px] font-semibold text-ink">
                Sales session ended — selections are finalized.
              </p>
              <p className="mt-1 font-mono text-[11.5px] text-secondary">
                ✓{stats.approve} approved · ~{stats.maybe} maybe · ✕{stats.decline} declined ·{" "}
                {stats.pending} pending · {money(Math.round(stats.cart))} cart
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {share.quoteId ? (
                  <a
                    href={`/wholesaleportal/rep/quotes/${share.quoteId}`}
                    className="inline-block h-9 rounded-chip border border-border px-4 text-[11px] font-semibold uppercase tracking-[0.14em] leading-9 text-ink"
                  >
                    Open order request
                  </a>
                ) : null}
                <a
                  href={`/api/staff/curation/${share.token}/export`}
                  className="inline-block h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] leading-9 text-ground"
                >
                  Export final CSV
                </a>
              </div>
            </div>
          ) : (
            <>
              {!callStartedAtMs ? (
                <div className="mb-5">
                  <p className="text-[12.5px] text-secondary">
                    Your catalog link is ready — send it anytime. Add items below now or during
                    the call; start the timer once you and the client are on together.
                  </p>
                  <button
                    type="button"
                    onClick={startCall}
                    className="mt-3 h-10 rounded-chip bg-ink px-5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ground"
                  >
                    Start call
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[12px] text-secondary">
                      When you&apos;re done deciding items, end the session to finalize selections.
                    </p>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={endSession}
                      className="h-9 rounded-chip border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary hover:border-accent hover:text-ink disabled:opacity-60"
                    >
                      End sales session
                    </button>
                  </div>

                  <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
                    {[
                      { label: "Time elapsed", value: formatElapsed(stats.elapsedMs) },
                      { label: "Piece count", value: String(stats.pieces) },
                      { label: "Items/hour", value: stats.perHour ? stats.perHour.toFixed(1) : "0" },
                      { label: "Total rev", value: money(Math.round(stats.rev)) },
                      { label: "Net margin", value: marginLabel },
                      { label: "Approve", value: String(stats.approve) },
                      { label: "Maybe", value: String(stats.maybe) },
                      { label: "Decline", value: String(stats.decline) },
                      { label: "Pending", value: String(stats.pending) },
                      { label: "Cart (approved)", value: money(Math.round(stats.cart)) },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className="rounded-chip border border-border bg-ground px-3 py-2.5 text-center"
                      >
                        <div className="font-mono text-[15px] text-ink">{s.value}</div>
                        <div className="mt-0.5 text-[9.5px] uppercase tracking-[0.08em] text-muted">
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Adding items works whether or not the call has started yet — reps often
                  build the list out ahead of time, then start the timer once live. */}
              {addFolded && !addPreview ? (
                <button
                  type="button"
                  onClick={() => setAddFolded(false)}
                  className="h-9 rounded-chip border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary hover:border-accent hover:text-ink"
                >
                  Add another item
                </button>
              ) : (
                <div className="rounded-chip border border-border bg-ground p-4">
                  <p className="text-[11.5px] text-muted">
                    Scan or type a SKU, set the listing price, then share it — the client sees it
                    featured immediately. Already on this link? It jumps straight back into the
                    hero view instead.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={addSku}
                      onChange={(e) => setAddSku(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          lookupForAdd();
                        }
                      }}
                      placeholder="Scan or type SKU, then Enter"
                      className="h-10 flex-1 rounded-chip border border-border bg-surface px-3 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      disabled={pending || !addSku.trim()}
                      onClick={lookupForAdd}
                      className="h-10 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
                    >
                      Look up
                    </button>
                  </div>
                  {addStatus ? <p className="mt-2 text-[11.5px] text-danger">{addStatus}</p> : null}

                  {addPreview ? (
                    <div className="mt-3 flex gap-3 rounded-chip border border-border bg-surface p-3">
                      <Placeholder
                        imageSrc={addPreview.imageUrl}
                        alt={portalDisplayTitle(addPreview.title, addPreview.sku)}
                        className="h-16 w-16 shrink-0 rounded-chip"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] text-ink">
                          {portalDisplayTitle(addPreview.title, addPreview.sku)}
                        </div>
                        <div className="font-mono text-[11px] text-muted">{addPreview.sku}</div>
                        <div className="text-[11px] text-secondary">
                          Cost:{" "}
                          <strong className="text-ink">
                            {addPreview.cost != null ? money(Math.round(addPreview.cost)) : "—"}
                          </strong>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <label className="flex items-center gap-1.5 font-mono text-[12px]">
                            <span className="text-muted">$</span>
                            <input
                              type="number"
                              min={0}
                              value={addPrice}
                              onChange={(e) => setAddPrice(e.target.value)}
                              className="w-[80px] rounded-chip border border-border bg-ground px-2 py-1 text-ink outline-none focus:border-accent"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={shareToLiveView}
                            className="h-9 rounded-chip bg-ink px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ground disabled:opacity-60"
                          >
                            Share to Live View
                          </button>
                          <button
                            type="button"
                            onClick={clearAddPreview}
                            className="text-[11px] text-muted hover:text-ink"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="mt-3">
                {bulkFolded && !bulkDraft.length ? (
                  <button
                    type="button"
                    onClick={() => setBulkFolded(false)}
                    className="h-9 rounded-chip border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary hover:border-accent hover:text-ink"
                  >
                    Paste a list of SKUs
                  </button>
                ) : (
                  <div className="rounded-chip border border-border bg-ground p-4">
                    <p className="text-[11.5px] text-muted">
                      Paste multiple SKUs (one per line, comma, or space-separated) to build out
                      the catalog the client can browse — these don&apos;t feature as the hero item
                      the way a single scan does.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <textarea
                        value={bulkSkusText}
                        onChange={(e) => setBulkSkusText(e.target.value)}
                        rows={3}
                        placeholder={"SKU-001\nSKU-002\nSKU-003"}
                        className="h-20 flex-1 rounded-chip border border-border bg-surface px-3 py-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        disabled={pending || !bulkSkusText.trim()}
                        onClick={resolveBulkSkus}
                        className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
                      >
                        Look up
                      </button>
                    </div>
                    {bulkMissing.length > 0 ? (
                      <p className="mt-2 text-[11.5px] text-danger">
                        {bulkMissing.length} skipped (not found or already on this link):{" "}
                        {bulkMissing.slice(0, 6).join(", ")}
                        {bulkMissing.length > 6 ? "…" : ""}
                      </p>
                    ) : null}
                    {bulkStatus ? <p className="mt-2 text-[11.5px] text-danger">{bulkStatus}</p> : null}

                    {bulkDraft.length > 0 ? (
                      <>
                        <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto">
                          {bulkDraft.map((it, index) => (
                            <div
                              key={`${it.sku}-${index}`}
                              className="flex items-center gap-3 rounded-chip border border-border bg-surface p-2.5"
                            >
                              <Placeholder
                                imageSrc={it.imageUrl}
                                alt={portalDisplayTitle(it.title, it.sku)}
                                className="h-12 w-12 shrink-0 rounded-chip"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[12px] text-ink">
                                  {portalDisplayTitle(it.title, it.sku)}
                                </div>
                                <div className="truncate font-mono text-[10.5px] text-muted">
                                  {it.sku} · cost{" "}
                                  {it.cost != null ? money(Math.round(it.cost)) : "—"}
                                </div>
                              </div>
                              <label className="flex items-center gap-1 font-mono text-[12px]">
                                <span className="text-muted">$</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={it.price ?? ""}
                                  onChange={(e) => updateBulkPrice(index, e.target.value)}
                                  className="w-[70px] rounded-chip border border-border bg-ground px-2 py-1 text-ink outline-none focus:border-accent"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => removeBulkRow(index)}
                                aria-label="Remove from list"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-chip text-muted transition hover:bg-danger/10 hover:text-danger"
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={addBulkItems}
                            className="h-9 rounded-chip bg-ink px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ground disabled:opacity-60"
                          >
                            {pending
                              ? "Adding…"
                              : `Add ${bulkDraft.length} item${bulkDraft.length === 1 ? "" : "s"} to catalog`}
                          </button>
                          <button
                            type="button"
                            onClick={clearBulk}
                            className="text-[11px] text-muted hover:text-ink"
                          >
                            Clear list
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-chip border border-border">
        <div className="grid grid-cols-[112px_minmax(160px,1fr)_80px_90px_100px_190px_minmax(120px,1fr)_84px] items-center gap-x-3 border-b border-border bg-ground px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          <span />
          <span>Item</span>
          <span className="text-right">Cost</span>
          <span className="text-right">Price</span>
          <span className="text-right">Margin</span>
          <span className="text-center">Decision</span>
          <span>Client note</span>
          <span />
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {share.items.map((it) => {
            const margin = it.cost != null ? it.price - it.cost : null;
            const marginPct = margin != null && it.price > 0 ? (margin / it.price) * 100 : null;
            return (
              <div
                key={it.sku}
                className={clsx(
                  "grid grid-cols-[112px_minmax(160px,1fr)_80px_90px_100px_190px_minmax(120px,1fr)_84px] items-center gap-x-3 border-b border-border/60 px-3 py-2.5 text-[12.5px] last:border-b-0",
                  share.heroSku === it.sku && "bg-accent/5",
                )}
              >
                <Placeholder
                  imageSrc={it.imageUrl}
                  alt={portalDisplayTitle(it.title, it.sku)}
                  className="h-24 w-24 shrink-0 rounded-chip"
                />
                <div className="min-w-0 px-2">
                  <div className="truncate text-ink">
                    {portalDisplayTitle(it.title, it.sku)}
                    {share.heroSku === it.sku ? (
                      <span className="ml-1.5 text-[10px] uppercase tracking-[0.08em] text-accent">
                        now viewing
                      </span>
                    ) : null}
                  </div>
                  {portalShowSkuLine(it.title, it.sku) ? (
                    <div className="truncate font-mono text-[11px] text-muted">{it.sku}</div>
                  ) : null}
                </div>
                <span className="text-right font-mono text-secondary">
                  {it.cost != null ? money(Math.round(it.cost)) : "—"}
                </span>
                <div className="flex items-center justify-end gap-1 font-mono">
                  <span className="text-muted">$</span>
                  <input
                    type="number"
                    min={0}
                    disabled={pending || share.sessionEnded || share.revoked}
                    defaultValue={it.price}
                    onBlur={(e) => savePrice(it.sku, e.target.value)}
                    className="w-[70px] rounded-chip border border-border bg-ground px-2 py-1 text-right text-[12.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
                  />
                </div>
                <span className={`whitespace-nowrap text-right font-mono ${marginColorClass(marginPct)}`}>
                  {margin != null ? money(Math.round(margin)) : "—"}
                  {marginPct != null ? ` · ${marginPct.toFixed(0)}%` : ""}
                </span>
                <div className="flex justify-center gap-1">
                  {(["approve", "maybe", "decline"] as const).map((d) => {
                    const meta = DECISION_META[d];
                    const active = it.decision === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={share.sessionEnded || share.revoked}
                        onClick={() => toggleDecision(it.sku, d)}
                        className={clsx(
                          "h-7 rounded-chip border px-2 text-[10px] font-semibold uppercase tracking-[0.06em] transition disabled:opacity-50",
                          active ? meta.activeClass : meta.idleClass,
                        )}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  defaultValue={it.note}
                  disabled={share.sessionEnded || share.revoked}
                  onBlur={(e) => saveNote(it.sku, e.target.value)}
                  placeholder="—"
                  className="h-8 min-w-0 rounded-chip border border-border bg-ground px-2 text-[11.5px] text-ink outline-none focus:border-accent disabled:opacity-60"
                />
                <div className="flex items-center justify-end gap-1">
                  {share.heroSku !== it.sku ? (
                    <button
                      type="button"
                      disabled={pending || share.sessionEnded || share.revoked}
                      onClick={() => featureExistingItem(it.sku)}
                      title="Bring this back into the hero view"
                      className="inline-flex h-8 items-center rounded-chip border border-border px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary transition hover:border-accent hover:text-ink disabled:opacity-50"
                    >
                      Feature
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={pending || share.sessionEnded || share.revoked}
                    onClick={() => removeItem(it.sku)}
                    aria-label="Remove item"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-chip text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                {!share.sessionEnded && !share.revoked ? (
                  <div className="col-span-full border-t border-border/60 pt-1">
                    <SimilarItemsCarousel
                      sku={it.sku}
                      excludeSkus={share.items.map((row) => row.sku)}
                      onAdd={addSuggestedItem}
                      onAddAsHero={addSuggestedItemAsHero}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
