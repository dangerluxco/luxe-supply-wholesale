"use client";

import { useEffect } from "react";

/**
 * Forces full document navigations for staff-portal links.
 *
 * Next.js 15 soft-nav + any leftover `"use server"` action stubs in the client
 * graph produces intermittent webpack "Cannot read properties of undefined
 * (reading 'call')" crashes. Hard navigation avoids that class of bug entirely
 * for the staff console, even if a future page accidentally reintroduces an
 * action prop.
 */
export function StaffHardNav() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const el = e.target;
      if (!(el instanceof Element)) return;
      const a = el.closest("a");
      if (!a) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;

      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      if (/^https?:\/\//i.test(href)) return;

      // Same-origin app paths only (staff + buyer surfaces linked from console).
      if (!href.startsWith("/")) return;

      e.preventDefault();
      window.location.assign(href);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
