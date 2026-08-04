import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    role?: string;
    // CSRF protection for the Google OAuth redirect round-trip - see
    // routes/googleAuth.ts.
    googleOAuthState?: string;
  }
}
