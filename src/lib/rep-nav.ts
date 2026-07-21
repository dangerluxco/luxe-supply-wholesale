import { ROLE } from "@/lib/constants";

export type RepNavIconKey =
  | "dashboard"
  | "orderRequests"
  | "leads"
  | "clients"
  | "catalog"
  | "bundles"
  | "curation"
  | "invoices"
  | "wishlist"
  | "performance"
  | "staff"
  | "settings";

export type RepNavItem = { label: string; href: string; icon: RepNavIconKey };

/** Shared staff-portal nav — kept off `"use client"` modules so soft-nav
 *  webpack stubs can't serve a stale label while SSR HTML is already updated. */
export function repNavItems(isManager: boolean): RepNavItem[] {
  return [
    { label: "Dashboard", href: "/wholesaleportal/rep/dashboard", icon: "dashboard" },
    { label: "Order Requests", href: "/wholesaleportal/rep", icon: "orderRequests" },
    { label: "Leads", href: "/wholesaleportal/rep/leads", icon: "leads" },
    { label: "Clients", href: "/wholesaleportal/rep/clients", icon: "clients" },
    { label: "Catalog", href: "/wholesaleportal/rep/catalog", icon: "catalog" },
    { label: "Bundles", href: "/wholesaleportal/rep/bundles", icon: "bundles" },
    { label: "Curation", href: "/wholesaleportal/rep/curation", icon: "curation" },
    { label: "Invoices", href: "/wholesaleportal/rep/invoices", icon: "invoices" },
    { label: "Wishlist", href: "/wholesaleportal/rep/wishlist", icon: "wishlist" },
    ...(isManager
      ? ([
          { label: "Performance", href: "/wholesaleportal/rep/performance", icon: "performance" },
          { label: "Staff", href: "/wholesaleportal/rep/staff", icon: "staff" },
        ] as RepNavItem[])
      : []),
    { label: "Settings", href: "/wholesaleportal/rep/settings", icon: "settings" },
  ];
}

export function isRepManagerRole(role: string): boolean {
  return role === ROLE.MANAGER;
}
