import { Router } from "express";
import { Readable } from "stream";

/**
 * Proxies TMDB artwork through this server so the browser only ever loads
 * same-origin images.
 *
 * This isn't just cosmetic: fetching image.tmdb.org directly from the page
 * makes every poster a cross-origin request, which on an installed iOS PWA
 * goes through the service worker as an "opaque" response. Those are billed
 * against the origin's storage quota at a large fixed padding each, so a few
 * hundred posters can blow through iOS's tight PWA quota, at which point the
 * cache write fails and the image request fails with it - while the exact
 * same URL opened directly in Safari loads fine. Same-origin responses have
 * none of those problems, are cacheable normally, and are covered by the
 * app's existing `img-src 'self'` CSP.
 */
export const imagesRouter = Router();

const ALLOWED_SIZES = new Set([
  "w92",
  "w154",
  "w185",
  "w200",
  "w300",
  "w342",
  "w500",
  "w780",
  "original",
]);

// TMDB image paths are a flat hash-like filename - anything else is rejected
// so this can't be used as a general-purpose open proxy.
const FILE_PATTERN = /^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|svg)$/;

imagesRouter.get("/:size/:file", async (req, res) => {
  const { size, file } = req.params;
  if (!ALLOWED_SIZES.has(size) || !FILE_PATTERN.test(file)) {
    return res.status(400).json({ error: "Invalid image request" });
  }

  try {
    const upstream = await fetch(`https://image.tmdb.org/t/p/${size}/${file}`);
    if (!upstream.ok || !upstream.body) {
      return res.status(502).end();
    }

    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);
    // The artwork behind a given TMDB path never changes, so let the browser
    // cache it hard - that's what keeps this proxy cheap after the first load.
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");

    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  } catch {
    if (!res.headersSent) res.status(502).end();
  }
});
