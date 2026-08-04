import { prisma } from "../db";

/**
 * Keeps a TV show's status in sync with its episodes' watched state:
 * marks it "watched" once every known episode is, and reverts it back to
 * "watchlist" if it previously was "watched" but no longer qualifies (e.g.
 * an episode got unwatched, or Kodi sync unwatched one - see kodiSync.ts).
 * Only ever touches the "watched" <-> "watchlist" transition, so a
 * deliberately-set "watching"/"dropped" status is left alone.
 */
export async function syncShowWatchedStatus(mediaItemId: number) {
  const [episodes, mediaItem] = await Promise.all([
    prisma.episode.findMany({ where: { mediaItemId } }),
    prisma.mediaItem.findUnique({ where: { id: mediaItemId } }),
  ]);
  if (!mediaItem) return;

  const allWatched = episodes.length > 0 && episodes.every((e) => e.watched);

  if (allWatched && mediaItem.status !== "watched") {
    await prisma.mediaItem.update({ where: { id: mediaItemId }, data: { status: "watched" } });
  } else if (!allWatched && mediaItem.status === "watched") {
    await prisma.mediaItem.update({ where: { id: mediaItemId }, data: { status: "watchlist" } });
  }
}
