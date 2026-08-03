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
        // the static app shell. Artwork is served same-origin under /api/images
        // (see backend/src/routes/images.ts) and is deliberately left to the
        // browser's normal HTTP cache: routing cross-origin images through the
        // service worker made them opaque responses, which blew through iOS's
        // PWA storage quota and broke image loading on iPhone entirely.
        navigateFallbackDenylist: [/^\/api/],
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
