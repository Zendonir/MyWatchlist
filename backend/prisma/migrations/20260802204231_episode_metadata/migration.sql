-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Episode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaItemId" INTEGER NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "title" TEXT,
    "overview" TEXT,
    "stillPath" TEXT,
    "voteAverage" REAL,
    "airDate" TEXT,
    "watched" BOOLEAN NOT NULL DEFAULT false,
    "watchedAt" DATETIME,
    "discoveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Episode_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "MediaItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Episode" ("airDate", "episodeNumber", "id", "mediaItemId", "seasonNumber", "title", "watched", "watchedAt") SELECT "airDate", "episodeNumber", "id", "mediaItemId", "seasonNumber", "title", "watched", "watchedAt" FROM "Episode";
DROP TABLE "Episode";
ALTER TABLE "new_Episode" RENAME TO "Episode";
CREATE UNIQUE INDEX "Episode_mediaItemId_seasonNumber_episodeNumber_key" ON "Episode"("mediaItemId", "seasonNumber", "episodeNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
