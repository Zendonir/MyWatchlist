-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MediaItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "tvdbId" INTEGER,
    "title" TEXT NOT NULL,
    "originalTitle" TEXT,
    "overview" TEXT,
    "posterPath" TEXT,
    "backdropPath" TEXT,
    "releaseDate" TEXT,
    "tmdbStatus" TEXT,
    "inProduction" BOOLEAN,
    "lastAirDate" TEXT,
    "isAnime" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'watchlist',
    "userRating" REAL,
    "notes" TEXT,
    "watched" BOOLEAN NOT NULL DEFAULT false,
    "watchedAt" DATETIME,
    "kodiId" INTEGER,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MediaItem" ("addedAt", "backdropPath", "id", "kodiId", "mediaType", "notes", "originalTitle", "overview", "posterPath", "releaseDate", "status", "title", "tmdbId", "tvdbId", "updatedAt", "userRating", "watched", "watchedAt") SELECT "addedAt", "backdropPath", "id", "kodiId", "mediaType", "notes", "originalTitle", "overview", "posterPath", "releaseDate", "status", "title", "tmdbId", "tvdbId", "updatedAt", "userRating", "watched", "watchedAt" FROM "MediaItem";
DROP TABLE "MediaItem";
ALTER TABLE "new_MediaItem" RENAME TO "MediaItem";
CREATE UNIQUE INDEX "MediaItem_mediaType_tmdbId_key" ON "MediaItem"("mediaType", "tmdbId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
