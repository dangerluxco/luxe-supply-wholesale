"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Global top progress bar for client-side navigation. Gives an instant "click
 * registered" signal the moment a same-origin link is clicked, then completes
 * when the destination route resolves (pathname or query change). Pairs with
 * per-route loading.tsx skeletons: the bar acknowledges the click, the skeleton
 * fills the page while server components stream in.
 *
 * Dependency-free. Mounted once in the root layout so it covers both the buyer
 * storefront and the staff portal.
 */
function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const firstRender = useRef(true);

  function clearTrickle() {
    if (trickleRef.current) {
      clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
  }

  function start() {
    // Already running — let the current animation continue.
    if (trickleRef.current) return;
    setVisible(true);
    setProgress(8);
    trickleRef.current = setInterval(() => {
      // Ease toward 90% and hold there until navigation completes.
      setProgress((p) => (p >= 90 ? p : p + Math.max(0.5, (90 - p) * 0.08)));
    }, 180);
    // Safety net: a same-page click that never navigates shouldn't strand the bar.
    const safety = setTimeout(finish, 8000);
    timersRef.current.push(safety);
  }

  function finish() {
    clearTrickle();
    setProgress(100);
    const hide = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 280);
    timersRef.current.push(hide);
  }

  // Start on any same-origin link click — capture phase so we fire before the
  // App Router transition begins.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = e.target;
      if (!(el instanceof Element)) return;
      const a = el.closest("a");
      if (!a) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href) return;
      if (
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        /^https?:\/\//i.test(href)
      ) {
        return;
      }
      if (!href.startsWith("/")) return;
      start();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Complete when the route (path or query) actually changes.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Clear any outstanding timers on unmount.
  useEffect(() => {
    return () => {
      clearTrickle();
      timersRef.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms ease" }}
    >
      <div
        className="h-full bg-accent shadow-[0_0_8px_rgba(176,141,62,0.7)]"
        style={{
          width: `${progress}%`,
          transition: "width 180ms ease-out",
        }}
      />
    </div>
  );
}

export function NavigationProgress() {
  // useSearchParams() must sit under a Suspense boundary so it doesn't opt the
  // whole tree into client-side rendering.
  return (
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  );
}
