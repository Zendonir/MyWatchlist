-- Replaces the username-based login with an email-based one, and adds a
-- separate display name.
--
-- Backfill for existing rows (hand-edited - Prisma's auto-generated version
-- left `name`/`email` unset, which would violate the new NOT NULL
-- constraints on any non-empty database):
--   - name  <- the old username (preserves the identity shown in the UI)
--   - email <- the old email if one was already set, otherwise the old
--              username. This keeps every existing account able to log in
--              immediately after the upgrade (they just type their old
--              username into the now-relabeled "E-Mail" field) instead of
--              being locked out; anyone can set a real address afterwards
--              under Settings.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("id", "email", "name", "passwordHash", "role", "mustChangePassword", "notifyEmail", "createdAt")
SELECT "id", COALESCE(NULLIF("email", ''), "username"), "username", "passwordHash", "role", "mustChangePassword", "notifyEmail", "createdAt"
FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
