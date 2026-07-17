import { ROLE } from "@/lib/constants";

export type RepNavItem = { label: string; href: string };

/** Shared staff-portal nav — kept off `"use client"` modules so soft-nav
 *  webpack stubs can't serve a stale label while SSR HTML is already updated. */
export function repNavItems(isManager: boolean): RepNavItem[] {
  return [
    { label: "Order Requests", href: "/wholesaleportal/rep" },
    { label: "Applications", href: "/wholesaleportal/rep/applications" },
    { label: "Clients", href: "/wholesaleportal/rep/clients" },
    { label: "Catalog", href: "/wholesaleportal/rep/catalog" },
    { label: "Bundles", href: "/wholesaleportal/rep/bundles" },
    { label: "Curation", href: "/wholesaleportal/rep/curation" },
    { label: "Invoices", href: "/wholesaleportal/rep/invoices" },
    { label: "Wishlist", href: "/wholesaleportal/rep/wishlist" },
    ...(isManager ? [{ label: "Staff", href: "/wholesaleportal/rep/staff" }] : []),
    { label: "Settings", href: "/wholesaleportal/rep/settings" },
  ];
}

export function isRepManagerRole(role: string): boolean {
  return role === ROLE.MANAGER;
}
