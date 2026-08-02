import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("production"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  TRUST_PROXY: z.coerce.number().default(1),

  APP_USERNAME: z.string().min(1).optional(),
  APP_PASSWORD: z.string().min(8).optional(),

  TMDB_API_KEY: z.string().optional(),
  TMDB_ACCESS_TOKEN: z.string().optional(),

  TVDB_API_KEY: z.string().optional(),

  KODI_DB_HOST: z.string().optional(),
  KODI_DB_PORT: z.coerce.number().default(3306),
  KODI_DB_USER: z.string().optional(),
  KODI_DB_PASSWORD: z.string().optional(),
  KODI_DB_NAME: z.string().optional(),
  KODI_SYNC_CRON: z.string().default("*/30 * * * *"),
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
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const kodiConfigured = Boolean(
  env.KODI_DB_HOST && env.KODI_DB_USER && env.KODI_DB_PASSWORD && env.KODI_DB_NAME
);

export const tmdbConfigured = Boolean(env.TMDB_API_KEY || env.TMDB_ACCESS_TOKEN);
export const tvdbConfigured = Boolean(env.TVDB_API_KEY);
