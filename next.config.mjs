/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  output: "standalone",
  // `next build` and `next dev` corrupt each other when they share .next.
  // Set NEXT_DIST_DIR (e.g. ".next-build") to verify a build while dev runs.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
    // Reuse a just-rendered dynamic page (e.g. the catalog) when navigating back
    // to it within this window, instead of re-fetching all products/images from
    // scratch. Makes Catalog → Orders → Catalog feel instant. Mutations still call
    // router.refresh(), which busts this cache, so edits stay fresh. Kept short so
    // one-of-one inventory/availability doesn't look stale for long.
    staleTimes: {
      dynamic: 30,
    },
  },
  images: {
    // Product photo URLs are content-stable (tokened Firebase Storage links),
    // so optimized variants can cache long on the instance disk + browser.
    minimumCacheTTL: 2_678_400, // 31 days
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "**.googleapis.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
  async headers() {
    // HTML/RSC: never cache. Static chunks: immutable only in production
    // (content-hashed filenames). In dev, long-lived immutable caching of
    // `/_next/static/*` leaves stale webpack modules after `.next` wipes —
    // which surfaces as "Cannot read properties of undefined (reading 'call')".
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: isProd
              ? "public, max-age=31536000, immutable"
              : "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
      {
        // Optimized product images — must override the no-store catch-all above,
        // or every catalog view re-downloads every photo.
        source: "/_next/image",
        headers: [
          {
            key: "Cache-Control",
            value: isProd
              ? "public, max-age=86400, stale-while-revalidate=2592000"
              : "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
