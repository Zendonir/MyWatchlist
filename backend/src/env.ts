import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("production"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  TRUST_PROXY: z.coerce.number().default(1),

  APP_EMAIL: z.string().email().optional(),
  APP_NAME: z.string().min(1).max(100).default("Admin"),
  APP_PASSWORD: z.string().min(8).optional(),

  TMDB_API_KEY: z.string().optional(),
  TMDB_ACCESS_TOKEN: z.string().optional(),

  TVDB_API_KEY: z.string().optional(),

  KODI_DB_HOST: z.string().optional(),
  KODI_DB_PORT: z.coerce.number().default(3306),
  KODI_DB_USER: z.string().optional(),
  KODI_DB_PASSWORD: z.string().optional(),
  // Kodi creates a new "<prefix><schema version>" database (e.g. MyVideos116,
  // MyVideos121, ...) every time it bumps its video DB schema, and older ones
  // are usually left behind on the MySQL server. Rather than pin an exact
  // name, we only take the prefix and pick whichever matching database has
  // the highest numeric suffix - i.e. whatever Kodi is actually using now.
  KODI_DB_NAME_PREFIX: z
    .string()
    .regex(/^[A-Za-z0-9_]+$/, "must be alphanumeric/underscore only, e.g. MyVideos")
    .default("MyVideos"),
  KODI_SYNC_CRON: z.string().default("0 3 * * *"),
  METADATA_REFRESH_CRON: z.string().default("30 3 * * *"),
  // Column names for season/episode number in the `episode_view` view.
  // These are content columns (c12/c13) that are historically stable but can
  // shift between major Kodi schema versions - override if `runKodiSync`
  // logs mismatches. Run `DESCRIBE episode_view;` on your Kodi DB to check.
  KODI_EPISODE_SEASON_COLUMN: z
    .string()
    .regex(/^c[0-9]{1,2}$/, "must look like a column name, e.g. c12")
    .default("c12"),
  KODI_EPISODE_NUMBER_COLUMN: z
    .string()
    .regex(/^c[0-9]{1,2}$/, "must look like a column name, e.g. c13")
    .default("c13"),

  // --- Email (optional): password reset + new-episode/show-completed digest ---
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  // Public base URL used to build links in emails (password reset). No
  // trailing slash, e.g. https://watchlist.example.com or https://192.168.1.2:3000
  APP_URL: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const kodiConfigured = Boolean(env.KODI_DB_HOST && env.KODI_DB_USER && env.KODI_DB_PASSWORD);

export const tmdbConfigured = Boolean(env.TMDB_API_KEY || env.TMDB_ACCESS_TOKEN);
export const tvdbConfigured = Boolean(env.TVDB_API_KEY);
export const emailConfigured = Boolean(env.SMTP_HOST && env.SMTP_FROM);
// The forgot-password email needs an absolute link back into the app, so it
// additionally requires APP_URL - notification digests don't strictly need it.
export const passwordResetConfigured = emailConfigured && Boolean(env.APP_URL);
