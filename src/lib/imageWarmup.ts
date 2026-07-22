import "server-only";

/**
 * Fire-and-forget warm-up of the Next image optimizer: hit /_next/image for
 * the sizes buyers actually request, so even the FIRST catalog view after a
 * save gets cached, resized WebP/AVIF instead of paying the resize cost.
 *
 * Requests go to the app itself (localhost inside the same instance). Bounded
 * concurrency, per-request timeout, errors swallowed — never blocks a save.
 */
const WARM_WIDTHS = [384, 640, 1080];
const CONCURRENCY = 4;
const PER_REQUEST_TIMEOUT_MS = 10_000;
const MAX_IMAGES = 150;

export function warmupOptimizedImages(imageUrls: Array<string | null | undefined>): void {
  const urls = [...new Set(imageUrls.filter((u): u is string => !!u))].slice(0, MAX_IMAGES);
  if (!urls.length) return;
  const port = process.env.PORT || 3000;
  const base = `http://127.0.0.1:${port}`;

  const jobs = urls.flatMap((url) =>
    WARM_WIDTHS.map(
      (w) => `${base}/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`,
    ),
  );

  void (async () => {
    let i = 0;
    async function worker() {
      while (i < jobs.length) {
        const job = jobs[i++]!;
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), PER_REQUEST_TIMEOUT_MS);
          await fetch(job, { signal: ctrl.signal });
          clearTimeout(t);
        } catch {
          // Cache warm-up only — a miss just means the first viewer resizes it.
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log(`[image-warmup] warmed ${urls.length} images × ${WARM_WIDTHS.length} sizes`);
  })();
}
