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
            handler: "CacheFirst",
            options: {
              // "v2" so upgrading to this version starts with a clean cache -
              // the previous config had no cacheableResponse restriction, so
              // any image that failed to load while <img> tags lacked
              // crossorigin (making the response "opaque", status always
              // reported as 0) got cached as if it had succeeded, and would
              // keep being served as broken forever after.
              cacheName: "tmdb-images-v2",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
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
