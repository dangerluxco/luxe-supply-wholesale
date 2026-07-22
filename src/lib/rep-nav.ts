import { ROLE } from "@/lib/constants";
import type { PortalFeatures } from "@/lib/firestore/settings";

export type RepNavIconKey =
  | "dashboard"
  | "orderRequests"
  | "leads"
  | "clients"
  | "catalog"
  | "bundles"
  | "curation"
  | "invoices"
  | "fulfillment"
  | "wishlist"
  | "performance"
  | "staff"
  | "settings";

export type RepNavItem = { label: string; href: string; icon: RepNavIconKey };

const DEFAULT_FEATURES: PortalFeatures = {
  leads: true,
  wishlist: true,
  performance: true,
  curation: true,
};

/** Shared staff-portal nav — kept off `"use client"` modules so soft-nav
 *  webpack stubs can't serve a stale label while SSR HTML is already updated. */
export function repNavItems(
  isManager: boolean,
  features: PortalFeatures = DEFAULT_FEATURES,
): RepNavItem[] {
  const items: RepNavItem[] = [
    { label: "Dashboard", href: "/wholesaleportal/rep/dashboard", icon: "dashboard" },
    { label: "Order Requests", href: "/wholesaleportal/rep", icon: "orderRequests" },
  ];
  if (features.leads) {
    items.push({ label: "Leads", href: "/wholesaleportal/rep/leads", icon: "leads" });
  }
  items.push(
    { label: "Clients", href: "/wholesaleportal/rep/clients", icon: "clients" },
    { label: "Catalog", href: "/wholesaleportal/rep/catalog", icon: "catalog" },
    { label: "Bundles", href: "/wholesaleportal/rep/bundles", icon: "bundles" },
  );
  if (features.curation) {
    items.push({ label: "Curate Order", href: "/wholesaleportal/rep/curation", icon: "curation" });
  }
  items.push({ label: "Invoices", href: "/wholesaleportal/rep/invoices", icon: "invoices" });
  if (isManager) {
    // Warehouse console — PPAS logins land there directly; admins get a link.
    items.push({ label: "Fulfillment", href: "/fulfillment", icon: "fulfillment" });
  }
  if (features.wishlist) {
    items.push({ label: "Wishlist", href: "/wholesaleportal/rep/wishlist", icon: "wishlist" });
  }
  if (isManager && features.performance) {
    items.push({
      label: "Performance",
      href: "/wholesaleportal/rep/performance",
      icon: "performance",
    });
  }
  items.push({ label: "Settings", href: "/wholesaleportal/rep/settings", icon: "settings" });
  return items;
}

export function isRepManagerRole(role: string): boolean {
  return role === ROLE.MANAGER;
}
