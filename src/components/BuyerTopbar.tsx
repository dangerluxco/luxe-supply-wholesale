"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "./Logo";
import { clsx } from "@/lib/clsx";
import { useCartBadge } from "@/components/CartBadgeProvider";
import { CheckoutNavButton } from "@/components/CheckoutNavButton";
import { useStorefrontAvailability } from "@/components/StorefrontAvailability";
import { SearchIcon } from "@/components/icons";

type IndexItem = { sku: string; name: string; era: string; material: string };

const GUEST_NAV = [{ label: "Catalog", href: "/wholesale" }];

const BUYER_NAV = [
  { label: "Catalog", href: "/wholesale" },
  { label: "Orders", href: "/wholesale/orders" },
  { label: "Invoices", href: "/wholesale/invoices" },
  { label: "Wishlist", href: "/wholesale/wishlist" },
  { label: "Account", href: "/wholesale/account" },
];

export function BuyerTopbar({
  user,
  wishlistCount = 0,
  index,
}: {
  user: { name: string; initials: string } | null;
  wishlistCount?: number;
  index: IndexItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isBundled } = useStorefrontAvailability();
  const { cartCount, cartTotal } = useCartBadge();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const signedIn = !!user;
  const nav = signedIn ? BUYER_NAV : GUEST_NAV;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const liveIndex = useMemo(
    () => index.filter((i) => !isBundled(i.sku)),
    [index, isBundled],
  );

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return liveIndex.slice(0, 8);
    return liveIndex
      .filter((i) =>
        `${i.name} ${i.era} ${i.material} ${i.sku}`.toLowerCase().includes(term),
      )
      .slice(0, 8);
  }, [q, liveIndex]);

  function isActive(href: string) {
    if (href === "/wholesale") return pathname === "/wholesale";
    return pathname.startsWith(href);
  }

  // Don't duplicate chrome on auth pages
  if (pathname.startsWith("/wholesale/sign-in") || pathname.startsWith("/wholesale/register")) {
    return null;
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex h-[60px] items-center gap-8 border-b border-border bg-surface/95 px-8 backdrop-blur-sm print:hidden">
        <Link href="/wholesale">
          <Logo />
        </Link>
        <nav className="flex gap-1 text-[12.5px] font-medium text-secondary">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={clsx(
                "flex items-center gap-1.5 rounded-chip px-3 py-1.5 transition",
                isActive(n.href) ? "bg-[#F0EFEA] text-ink" : "hover:text-ink",
              )}
            >
              {n.label}
              {n.href === "/wholesale/wishlist" && wishlistCount > 0 ? (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-semibold text-white">
                  {wishlistCount}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <button
          onClick={() => setOpen(true)}
          className="flex h-9 w-[300px] items-center gap-2 rounded-chip border border-border bg-ground px-3 text-[12.5px] text-muted transition hover:border-accent"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span>Search the collection…</span>
          <span className="ml-auto rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10.5px] text-muted">
            ⌘K
          </span>
        </button>
        {signedIn ? (
          <>
            {cartCount > 0 ? (
              <CheckoutNavButton cartCount={cartCount} cartTotal={cartTotal} />
            ) : (
              <Link
                href="/wholesale/cart"
                className="pressable relative flex items-center gap-1.5 text-[12px] text-secondary"
              >
                <span className="rounded-chip border border-border px-2.5 py-1.5">Cart</span>
              </Link>
            )}
            <div className="flex items-center gap-2 text-[12px] text-secondary">
              <div className="flex h-7 w-7 items-center justify-center rounded-chip bg-ink text-[10px] font-semibold text-ground">
                {user.initials}
              </div>
              {user.name.split(" ")[0]}
            </div>
            <a
              href="/api/logout?area=buyer"
              className="pressable rounded-chip border border-border px-2.5 py-1.5 text-[11px] text-secondary hover:border-accent hover:text-ink"
            >
              Sign out
            </a>
          </>
        ) : (
          <Link
            href="/wholesale/sign-in"
            className="pressable rounded-chip bg-ink px-3.5 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ground hover:opacity-90"
          >
            Sign in
          </Link>
        )}
      </header>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[620px] max-w-[92vw] overflow-hidden rounded-card border border-border bg-surface shadow-[0_30px_80px_-30px_rgba(22,22,26,0.5)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the collection…"
                className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) {
                    router.push(`/wholesale/product/${results[0].sku}`);
                    setOpen(false);
                  }
                }}
              />
              <span className="font-mono text-[10.5px] text-muted">ESC</span>
            </div>
            <div className="max-h-[50vh] overflow-auto py-2">
              {results.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12.5px] text-muted">
                  No pieces match “{q}”.
                </div>
              ) : (
                results.map((r, index) => (
                  <button
                    key={`${r.sku}-${index}`}
                    onClick={() => {
                      router.push(`/wholesale/product/${r.sku}`);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-ground"
                  >
                    <span className="font-mono text-[11px] text-muted">{r.sku}</span>
                    <span className="text-[13px] text-ink">{r.name}</span>
                    <span className="ml-auto font-mono text-[10.5px] uppercase text-muted">
                      {r.material}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
