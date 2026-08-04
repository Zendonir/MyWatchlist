# MyWatchlist

Self-hosted watchlist for movies and TV shows. Runs as a single Docker
container, packaged for TrueNAS. Tracks what you plan to watch / are
watching / have watched, pulls posters and metadata from **TMDB** (and
optionally **TVDB**), and can automatically mark things as watched by
reading play-counts straight out of your **Kodi MySQL video library**.
Installs as a home-screen app on iPhone (PWA).

Beyond basic tracking: episode overviews and thumbnail images, marking a
whole season watched in one tap, and a daily metadata refresh that adds
newly-aired episodes for shows you're tracking (flagged with a "Neu" badge
on the dashboard until watched) and backfills any missing poster/overview
data.

## Architecture

- **Backend**: Node.js/Express + TypeScript, SQLite (via Prisma) for its own
  data, `mysql2` for a **read-only** connection to Kodi's video database.
- **Frontend**: React + Vite, mobile-first, installable as a PWA (manifest +
  service worker, `apple-touch-icon` for iOS "Add to Home Screen").
- Both are built into **one Docker image**; Express serves the built
  frontend and the `/api/*` REST API from the same origin.
- Session-based auth (bcrypt-hashed passwords, HTTP-only cookies), rate
  limiting on login, and security headers via Helmet.

## Installing a release via YAML (no local build)

Every tagged release (`vX.Y.Z`) is built by GitHub Actions and published to
GitHub Container Registry as `ghcr.io/zendonir/mywatchlist`. Use
[`deploy/truenas-install.yaml`](deploy/truenas-install.yaml) to install it
without cloning the repo or building anything locally:

- **TrueNAS SCALE**: Apps → Discover Apps → **Custom App** → **Install via
  YAML**, paste the contents of `deploy/truenas-install.yaml` (filled in
  with your own `SESSION_SECRET`/`APP_EMAIL`/`APP_PASSWORD`/`TMDB_API_KEY`).
- **Any other Docker host**:
  ```bash
  curl -O https://raw.githubusercontent.com/Zendonir/MyWatchlist/main/deploy/truenas-install.yaml
  # edit the placeholders, then:
  docker compose -f truenas-install.yaml up -d
  ```

The first time you do this, make sure the `ghcr.io/zendonir/mywatchlist`
package is set to **Public** visibility (GitHub profile → Packages →
mywatchlist → Package settings), otherwise anonymous pulls are denied.

To build the image yourself instead of using the published one, follow the
"Quick start" section below with the repo's root `docker-compose.yml`.

## Quick start (TrueNAS / any Docker host)

1. Clone this repo onto your TrueNAS box (or wherever `docker compose` runs).
2. Copy the environment template and fill it in:
   ```bash
   cp .env.example .env
   ```
   At minimum set `SESSION_SECRET`, `APP_EMAIL`, `APP_PASSWORD`, and a
   `TMDB_API_KEY` (see below). Kodi, TVDB and email (configured later from
   Settings) are optional.
3. Build and start:
   ```bash
   docker compose up -d --build
   ```
   By default the app is **not** published to the host at all - see
   "Externer Zugriff & Sicherheit" below for how to actually reach it.
4. Log in with the `APP_EMAIL`/`APP_PASSWORD` you set. That account is
   created automatically on first boot (only if no users exist yet).

On TrueNAS Scale, this repo's `docker-compose.yml` can be used directly with
the "Launch Docker Compose" / custom app import feature, or you can run
`docker compose` from a shell (e.g. via an app that gives you a terminal, or
SSH into the NAS if you allow that).

## TMDB / TVDB API keys

- **TMDB** (required for search/metadata): create a free account at
  https://www.themoviedb.org, then generate a key under
  *Settings → API*. Either the "API Key (v3 auth)" (`TMDB_API_KEY`) or the
  "API Read Access Token (v4 auth)" (`TMDB_ACCESS_TOKEN`) works.
- **TVDB** (optional, supplemental TV metadata): create a key at
  https://thetvdb.com/dashboard/account/apikey and set `TVDB_API_KEY`.

Both keys stay server-side; the browser never talks to TMDB/TVDB directly.

## Kodi MySQL sync

MyWatchlist can read Kodi's watched status directly out of Kodi's **MySQL**
video library (this requires Kodi to already be configured to use MySQL
instead of the default SQLite file - see the [Kodi wiki on MySQL](https://kodi.wiki/view/MySQL)
if it isn't yet).

1. Create a **read-only** MySQL user for this app (never give it write
   access - it should never modify your Kodi library). Grant it access to
   every `MyVideosNNN` database with a single wildcarded GRANT, rather than
   one exact name, since Kodi's schema-version suffix changes on upgrades:
   ```sql
   CREATE USER 'mywatchlist'@'%' IDENTIFIED BY 'choose-a-strong-password';
   GRANT SELECT ON `MyVideos%`.* TO 'mywatchlist'@'%';
   FLUSH PRIVILEGES;
   ```
   (If your Kodi video database uses a different prefix - check
   `advancedsettings.xml` under `<videodatabase><name>` - substitute it for
   `MyVideos` both here and in `KODI_DB_NAME_PREFIX` below.)
2. Fill in `KODI_DB_HOST`, `KODI_DB_PORT`, `KODI_DB_USER`, `KODI_DB_PASSWORD`
   in `.env`. Leave `KODI_DB_NAME_PREFIX` at its default (`MyVideos`) unless
   you use a custom prefix.
3. Restart the container. Sync runs automatically on the `KODI_SYNC_CRON`
   schedule (default once a day at 03:00 - use a shorter interval like
   `*/30 * * * *` for more frequent updates) and can be triggered manually
   from **Settings → Kodi-Synchronisierung** (admin accounts only).

**Which database it picks**: `KODI_DB_NAME_PREFIX` is a prefix, not the
full database name. On every sync, the app lists all databases on the
MySQL server matching `<prefix><number>` (e.g. `MyVideos116`, `MyVideos121`)
and always uses whichever has the **highest number** - i.e. whatever Kodi's
current schema version actually is, without needing to update `.env` after
a Kodi upgrade creates a new database.

**How matching works**: the sync matches Kodi's movies/episodes to TMDB via
Kodi's `uniqueid` table (which stores each item's TMDB ID, as long as you're
scraping with a TMDB-based scraper in Kodi - the default "The Movie
Database" / "TheTVDB" scrapers do this from Kodi 19+). Items Kodi has no
TMDB id for (e.g. only scraped from IMDB in older libraries) can't be
auto-matched; add and mark those watched manually in the app.

**Watched items are imported automatically** - anything in your Kodi
library with a play count greater than zero is added to your watchlist
(fetching metadata from TMDB) and marked watched if it isn't already
there, not just matched against items you added by hand. A first sync
against a large library can take a while and make a lot of TMDB requests
(one per movie/show, plus one per season for shows); subsequent syncs are
fast since only newly-watched items trigger new TMDB lookups.

Season/episode numbers are read via Kodi's `episode_view` using column names
that are correct for most modern Kodi schema versions, but can shift on very
old/new Kodi releases. If sync logs (`Settings` page, or container logs)
show mismatched episodes, run `DESCRIBE episode_view;` against your Kodi DB
and adjust `KODI_EPISODE_SEASON_COLUMN` / `KODI_EPISODE_NUMBER_COLUMN` in
`.env` accordingly.

## Externer Zugriff & Sicherheit

The app is already hardened for exposure (bcrypt passwords, HTTP-only
session cookies, per-IP login rate limiting, Helmet security headers, CSRF
mitigation, non-root container user, read-only Kodi DB access). How you get
external traffic to it matters just as much:

**Recommended, in order of preference:**

1. **VPN (best)** - use TrueNAS Scale's / your router's built-in WireGuard,
   or Tailscale, to reach your home network, then hit MyWatchlist over its
   internal address. Nothing is exposed to the internet at all.
2. **Cloudflare Tunnel** - exposes the app via Cloudflare without opening any
   inbound ports on your router, and gets you free TLS + Cloudflare's edge
   protection. Point the tunnel at `mywatchlist:3000` on the Docker network.
3. **Reverse proxy with TLS, port-forwarded** - only if 1/2 aren't options.
   This repo includes a Caddy overlay that gets you automatic HTTPS via
   Let's Encrypt for a real domain:
   ```bash
   docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --build
   ```
   Set `DOMAIN=watchlist.yourdomain.com` in `.env` first, and forward only
   ports 80/443 to this host (never forward 3000 directly).

**LAN-only HTTPS (no domain, no port-forwarding):** modern browsers
increasingly assume HTTPS everywhere and can misbehave against a plain-HTTP
app (e.g. upgrading individual asset requests to HTTPS on their own,
breaking the page). If you only need this reachable inside your home
network by IP, use the LAN overlay instead - it gives the app a real,
self-signed certificate via Caddy's local CA:
```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy-lan.yml up -d --build
```
Then open `https://<truenas-ip>` (port 443, not `:3000`). The browser warns
once that the certificate isn't trusted (expected, self-signed) - accept it
("Advanced" -> "Proceed") and it won't ask again on that device.

**Regardless of which option you pick:**

- Set a strong, unique `APP_PASSWORD` and a random `SESSION_SECRET`
  (`openssl rand -base64 48`).
- Consider adding a firewall rule / fail2ban-style tool (TrueNAS Scale apps
  like CrowdSec, or your router's) watching for repeated `401` responses on
  `/api/auth/login`, as defense in depth beyond the app's built-in rate
  limit.
- Keep the container updated (`docker compose pull && docker compose up -d`
  if you push image updates to a registry, or rebuild from a pulled repo).

## Multi-user

The account from `APP_EMAIL`/`APP_PASSWORD` is an admin. Login is by email
address, with a separate display name shown throughout the UI. From
**Settings → Nutzer**, an admin can add accounts for friends/family (name +
email + password each) - each person gets their own completely independent
watchlist (own statuses, own watched progress). Kodi sync only ever touches
the admin account's list, since Kodi is a shared household library, not
something each friend has their own copy of; everyone else adds things by
hand via search.

**Watching together**: on any item's detail page, "Zusammen schauen mit"
lets you add other users you're watching it with. Adding someone puts that
movie/show on their list automatically too (if they don't already have it),
and everyone in the group can see who else is watching along - handy for
picking up where you left off together. Removing someone from the group
only detaches that shared context; it doesn't touch their list entry.

**Passwords**: anyone can change their own password any time under
**Settings**. A user an admin creates (or resets the password for) has to
set their own password on their very next login before they can do anything
else - the admin-picked one is one-time only.

## Email (optional)

Every account has an email address (it's the login), but actually *sending*
mail is opt-in and configured entirely from **Settings → E-Mail-Versand
(SMTP)** as an admin - not via env vars or the deploy YAML. It enables two
things:

- **Passwort vergessen**: a "Passwort vergessen?" link on the login page
  sends a one-hour, single-use reset link. Without SMTP configured, this
  stays disabled, but users can still be helped out via **Settings → Nutzer
  → Passwort zurücksetzen** (admin-only, no email required).
- **Digest emails**: once a day, alongside the metadata refresh, anyone with
  "Per E-Mail benachrichtigen" enabled (on by default, toggle it under
  Settings) gets a summary of new episodes discovered and shows that just
  finished - only for content on their own list.

**Setup:** in **Settings → E-Mail-Versand (SMTP)**, fill in host, port,
user, password and a "From" address, then save. For Gmail:

- Host `smtp.gmail.com`, port `587`, "Implizites TLS" unchecked (STARTTLS)
- Password: a Google **App-Passwort**, not your normal Google password -
  requires 2-Faktor-Authentifizierung on the account, then generate one at
  [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

Any other SMTP provider (a self-hosted relay, a transactional-email service,
etc.) works the same way - just its host/port/credentials instead. `APP_URL`
(env var, see `.env.example`) still needs to be set so password-reset links
point back at your app.

An admin can verify the configuration works and preview the digest format
from the same section ("Test-E-Mail senden" / "Beispiel-Digest senden").

## Installing on iPhone

Open the site in Safari, tap the Share icon, then **"Zum Home-Bildschirm"**
("Add to Home Screen"). It launches full-screen, without Safari's UI, and
works like a native app icon.

## Environment variables

See `.env.example` for the full list with comments.

## Local development (without Docker)

```bash
# Backend
cd backend
cp ../.env.example .env   # edit DATABASE_URL to e.g. file:./dev.db
npm install
npx prisma migrate dev
npm run dev               # listens on :3000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                # listens on :5173, proxies /api to :3000
```

## Data & backups

All app data (SQLite database) lives in the `mywatchlist_data` Docker
volume. Back it up like any other Docker volume, e.g.:

```bash
docker run --rm -v mywatchlist_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/mywatchlist-backup.tar.gz -C /data .
```
