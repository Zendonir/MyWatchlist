/*
  Warnings:

  - Added the required column `userId` to the `MediaItem` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "WatchGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WatchGroupMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "watchGroupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchGroupMember_watchGroupId_fkey" FOREIGN KEY ("watchGroupId") REFERENCES "WatchGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WatchGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MediaItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Every existing row predates multi-user support, so it belongs to whoever
-- was the sole (admin) account at the time - the earliest-created user.
-- This only matters for a non-empty table; a fresh install has no MediaItem
-- rows yet, so the subquery result is never actually used.
INSERT INTO "new_MediaItem" ("userId", "addedAt", "backdropPath", "id", "inProduction", "isAnime", "kodiId", "lastAirDate", "mediaType", "notes", "originalTitle", "overview", "posterPath", "releaseDate", "status", "title", "tmdbId", "tmdbStatus", "tvdbId", "updatedAt", "userRating", "watched", "watchedAt") SELECT (SELECT "id" FROM "User" ORDER BY "id" ASC LIMIT 1), "addedAt", "backdropPath", "id", "inProduction", "isAnime", "kodiId", "lastAirDate", "mediaType", "notes", "originalTitle", "overview", "posterPath", "releaseDate", "status", "title", "tmdbId", "tmdbStatus", "tvdbId", "updatedAt", "userRating", "watched", "watchedAt" FROM "MediaItem";
DROP TABLE "MediaItem";
ALTER TABLE "new_MediaItem" RENAME TO "MediaItem";
CREATE UNIQUE INDEX "MediaItem_userId_mediaType_tmdbId_key" ON "MediaItem"("userId", "mediaType", "tmdbId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "WatchGroup_mediaType_tmdbId_key" ON "WatchGroup"("mediaType", "tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchGroupMember_watchGroupId_userId_key" ON "WatchGroupMember"("watchGroupId", "userId");
