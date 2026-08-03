import path from "path";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { env } from "./env";
import { PrismaSessionStore } from "./lib/prismaSessionStore";
import { bootstrapAdminUser } from "./lib/bootstrap";
import { requireAuth, requireApiHeader } from "./middleware/auth";
import { startScheduler } from "./services/scheduler";

import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { mediaRouter } from "./routes/media";
import { searchRouter } from "./routes/search";
import { syncRouter } from "./routes/sync";
import { imagesRouter } from "./routes/images";

const app = express();

// The app is expected to sit behind a reverse proxy (Caddy/Traefik/Nginx
// Proxy Manager) that terminates TLS - trust its X-Forwarded-* headers so
// rate limiting and secure cookies see the real client and scheme.
app.set("trust proxy", env.TRUST_PROXY);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "https://image.tmdb.org", "https://artworks.thetvdb.com", "data:"],
        connectSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    // The app itself never terminates TLS - it's plain HTTP unless a reverse
    // proxy (e.g. the bundled Caddy setup) sits in front of it. Helmet's
    // default Strict-Transport-Security header asserts HTTPS regardless,
    // which can get a browser to remember/enforce HTTPS for this host even
    // for direct HTTP-only LAN access. Let the reverse proxy set HSTS
    // instead (ours already does, see deploy/Caddyfile).
    hsts: false,
  })
);

app.use(express.json({ limit: "100kb" }));

const sessionTtlMs = 30 * 24 * 60 * 60 * 1000; // 30 days
app.use(
  session({
    name: "mywatchlist.sid",
    secret: env.SESSION_SECRET,
    store: new PrismaSessionStore({ ttlMs: sessionTtlMs }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtlMs,
    },
  })
);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Artwork gets a much higher ceiling than the rest of the API and is mounted
// ahead of it: opening a long-running show can legitimately request hundreds
// of episode stills in one go, which would otherwise trip the API limiter.
// It also skips requireApiHeader, since <img> tags can't set custom headers
// (and GETs are exempt from that check anyway).
const imageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/images", imageLimiter, requireAuth, imagesRouter);

app.use("/api", apiLimiter, requireApiHeader);
app.use("/api/auth", authRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/media", requireAuth, mediaRouter);
app.use("/api/search", requireAuth, searchRouter);
app.use("/api/sync", requireAuth, syncRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Serve the built frontend (copied into ./public during the Docker build).
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir, { index: false }));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

async function main() {
  await bootstrapAdminUser();
  startScheduler();

  app.listen(env.PORT, () => {
    console.log(`MyWatchlist backend listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
