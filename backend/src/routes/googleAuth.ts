import { Router } from "express";
import crypto from "crypto";
import { requireAdmin } from "../middleware/auth";
import { googleOAuthConfigured } from "../env";
import { getAuthUrl, handleCallback, disconnect } from "../services/googleMail";

export const googleAuthRouter = Router();

googleAuthRouter.get("/connect", requireAdmin, (req, res) => {
  if (!googleOAuthConfigured) {
    return res.status(503).send("Google OAuth ist nicht konfiguriert (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/APP_URL fehlen).");
  }
  const state = crypto.randomBytes(24).toString("hex");
  req.session.googleOAuthState = state;
  req.session.save((err) => {
    if (err) return res.status(500).send("Session error");
    res.redirect(getAuthUrl(state));
  });
});

// Google redirects the admin's browser here after consent - this is a plain
// top-level GET navigation, not an XHR from the SPA, so it can't carry the
// X-Requested-With header requireApiHeader normally checks (GETs are exempt
// from that check anyway). The `state` param is what stops a third party
// from tricking an admin into linking an attacker-controlled Google account.
//
// This lands in a popup window (see Settings.tsx), so instead of redirecting
// straight to /settings it redirects to the SPA's /oauth-callback route,
// which relays the result back to the opener via postMessage and closes
// itself - falling back to a normal /settings redirect if there's no
// opener (e.g. popups were blocked and /connect was opened top-level).
googleAuthRouter.get("/callback", requireAdmin, async (req, res) => {
  const { code, state, error } = req.query;
  const expectedState = req.session.googleOAuthState;
  delete req.session.googleOAuthState;

  function redirectResult(ok: boolean, message?: string) {
    const params = new URLSearchParams({ ok: ok ? "1" : "0" });
    if (message) params.set("message", message);
    res.redirect(`/oauth-callback?${params.toString()}`);
  }

  if (error) {
    return redirectResult(false, String(error));
  }
  if (!code || typeof code !== "string" || !state || state !== expectedState) {
    return redirectResult(false, "Ungültige oder abgelaufene Anfrage");
  }

  try {
    await handleCallback(code, req.session.userId!);
    redirectResult(true);
  } catch (err: any) {
    console.error("Google OAuth callback failed:", err);
    redirectResult(false, String(err?.message ?? err));
  }
});

googleAuthRouter.post("/disconnect", requireAdmin, async (_req, res) => {
  await disconnect();
  res.json({ ok: true });
});
