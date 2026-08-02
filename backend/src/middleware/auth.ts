import { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: "Not authenticated" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session.userId && req.session.role === "admin") {
    return next();
  }
  return res.status(403).json({ error: "Admin privileges required" });
}

/**
 * Lightweight CSRF mitigation for the session-cookie based API.
 * The SPA always calls the API with this header set (see frontend/src/api/client.ts);
 * a cross-site form or <img>/<script> submission cannot set custom headers,
 * so requests missing it are rejected for any state-changing method.
 */
export function requireApiHeader(req: Request, res: Response, next: NextFunction) {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) return next();
  if (req.get("X-Requested-With") === "MyWatchlist") return next();
  return res.status(403).json({ error: "Missing required request header" });
}
