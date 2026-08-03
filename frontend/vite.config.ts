import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "MyWatchlist",
        short_name: "Watchlist",
        description: "Track movies and TV shows, synced with Kodi watched status",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0b1120",
        theme_color: "#111827",
        orientation: "portrait",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // API responses are session/auth-sensitive - never cache them, only
        // the static app shell.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/,
            // StaleWhileRevalidate instead of CacheFirst: always re-fetches
            // in the background and updates the cache, so a previously
            // failed/opaque response (TMDB's CDN doesn't reliably support
            // anonymous CORS, so <img> tags intentionally don't set
            // crossorigin - meaning these responses stay opaque and can't be
            // filtered by status) self-heals within one extra load instead
            // of being stuck for the full cache lifetime.
            handler: "StaleWhileRevalidate",
            options: {
              // "v3": bust the caches from earlier, more aggressive configs.
              cacheName: "tmdb-images-v3",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 3 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
  },
});
