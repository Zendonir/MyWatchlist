import MailComposer from "nodemailer/lib/mail-composer";
import { prisma } from "../db";
import { env, googleOAuthConfigured } from "../env";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

// gmail.send is a "sensitive" scope, not "restricted" like the full
// mail.google.com SMTP scope - it doesn't need Google's CASA security
// assessment to keep working past the unverified-app testing window.
const SCOPE = "https://www.googleapis.com/auth/gmail.send openid email";

function redirectUri() {
  return `${env.APP_URL}/api/admin/google/callback`;
}

export function getAuthUrl(state: string) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  // offline + consent guarantees a refresh_token comes back even if this
  // Google account connected before (Google otherwise only issues one on
  // the very first consent).
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function handleCallback(code: string, connectedByUserId: number): Promise<string> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token?: string; scope?: string };
  if (!tokens.refresh_token) {
    throw new Error(
      "Google hat keinen Refresh-Token geliefert (passiert meist bei einer erneuten Verbindung desselben " +
        "Kontos). Bitte den Zugriff unter https://myaccount.google.com/permissions entfernen und erneut verbinden."
    );
  }

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) {
    throw new Error(`Failed to fetch Google account info: ${userRes.status}`);
  }
  const userInfo = (await userRes.json()) as { email: string };

  await prisma.emailConnection.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      email: userInfo.email,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope ?? SCOPE,
      connectedByUserId,
    },
    update: {
      email: userInfo.email,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope ?? SCOPE,
      connectedByUserId,
      connectedAt: new Date(),
    },
  });

  return userInfo.email as string;
}

export function getConnection() {
  return prisma.emailConnection.findUnique({ where: { id: 1 } });
}

export async function isEmailConnected() {
  return (await getConnection()) !== null;
}

export async function disconnect() {
  const connection = await getConnection();
  if (!connection) return;
  // Best-effort - the local row is removed either way so a stuck/expired
  // token doesn't leave the app thinking it's still connected.
  await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: connection.refreshToken }),
  }).catch(() => null);
  await prisma.emailConnection.delete({ where: { id: 1 } });
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to refresh Google access token: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function buildRawMessage(opts: { from: string; to: string; subject: string; text: string; html: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    new MailComposer(opts).compile().build((err: Error | null, message: Buffer) => {
      if (err) return reject(err);
      // Gmail API wants URL-safe base64, no padding.
      resolve(message.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
    });
  });
}

export async function sendMail(opts: { to: string; subject: string; text: string; html: string }) {
  if (!googleOAuthConfigured) {
    throw new Error("Google OAuth ist nicht konfiguriert (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/APP_URL fehlen)");
  }
  const connection = await getConnection();
  if (!connection) {
    throw new Error("Kein Google-Konto verbunden - unter Settings verbinden");
  }

  const accessToken = await getAccessToken(connection.refreshToken);
  const raw = await buildRawMessage({
    from: `MyWatchlist <${connection.email}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
  }
}
