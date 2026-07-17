"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders `fallback` on the server and on the first client paint, then swaps
 * to `children` after mount. Use for auth screens that otherwise hydrate-mismatch
 * when deploys/HMR leave stale client bundles against newer server HTML.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}
