"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

// The server snapshot behind /api/bundled-skus is cached ~15s (AVAILABILITY_TTL_MS),
// so polling faster than this mostly re-reads the same cache while flooding logs.
const POLL_MS = 10_000;

type AvailabilityCtx = {
  /** Uppercase SKUs currently locked in an active suggested lot. */
  bundledSkus: Set<string>;
  isBundled: (sku: string) => boolean;
};

const Ctx = createContext<AvailabilityCtx>({
  bundledSkus: new Set(),
  isBundled: () => false,
});

export function useStorefrontAvailability() {
  return useContext(Ctx);
}

/**
 * Polls active bundled SKUs so open buyer tabs hide pieces the moment they enter
 * a suggested lot — no manual refresh required.
 */
export function StorefrontAvailabilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [bundledSkus, setBundledSkus] = useState<Set<string>>(() => new Set());
  const revisionRef = useRef<string | null>(null);
  const prevSkusRef = useRef<Set<string>>(new Set());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySnapshot = useCallback(
    (skus: string[], revision: string) => {
      const next = new Set(
        skus.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean),
      );
      const released = [...prevSkusRef.current].some((s) => !next.has(s));
      prevSkusRef.current = next;

      setBundledSkus((prev) => {
        if (prev.size === next.size && [...next].every((s) => prev.has(s))) {
          return prev;
        }
        return next;
      });

      const prevRev = revisionRef.current;
      revisionRef.current = revision;
      // Skip the first successful poll so we don't double-fetch the SSR page.
      // Refresh when revision changes OR SKUs are released (archive / edit remove)
      // so pieces can re-enter the catalog product list from the server.
      if (prevRev == null || revision === "error") return;
      if (prevRev === revision && !released) return;

      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        router.refresh();
      }, 150);
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      try {
        const res = await fetch("/api/bundled-skus", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { skus?: string[]; revision?: string };
        if (cancelled) return;
        applySnapshot(
          Array.isArray(data.skus) ? data.skus : [],
          String(data.revision || ""),
        );
      } catch {
        /* ignore transient network errors */
      }
    }

    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [applySnapshot]);

  const isBundled = useCallback(
    (sku: string) => bundledSkus.has(String(sku || "").trim().toUpperCase()),
    [bundledSkus],
  );

  const value = useMemo(
    () => ({ bundledSkus, isBundled }),
    [bundledSkus, isBundled],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** On PDP: if this SKU becomes bundled while the tab is open, leave the page. */
export function LiveBundledSkuGuard({ sku }: { sku: string }) {
  const { isBundled } = useStorefrontAvailability();
  const router = useRouter();

  useEffect(() => {
    if (!sku || !isBundled(sku)) return;
    router.replace("/wholesale");
  }, [sku, isBundled, router]);

  return null;
}
