"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Immediate pressed state + useTransition while soft-navigating (CheckoutNavButton pattern).
 * Resets when pathname matches `resetWhenPath` (prefix match).
 */
export function useNavPress(href: string, resetWhenPath?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [clicked, setClicked] = useState(false);
  const resetPrefix = resetWhenPath ?? href;

  useEffect(() => {
    if (pathname.startsWith(resetPrefix)) setClicked(false);
  }, [pathname, resetPrefix]);

  const busy = pending || clicked;

  function navigate() {
    setClicked(true);
    start(() => {
      router.push(href);
    });
  }

  return { busy, navigate };
}
