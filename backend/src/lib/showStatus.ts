import { prisma } from "../db";

/**
 * Marks a TV show "watched" once every one of its known episodes has been
 * watched. Called after any episode/season-level watched-state change.
 */
export async function maybeMarkShowWatched(mediaItemId: number) {
  const episodes = await prisma.episode.findMany({ where: { mediaItemId } });
  if (episodes.length === 0 || !episodes.every((e) => e.watched)) return;

  await prisma.mediaItem.updateMany({
    where: { id: mediaItemId, status: { not: "watched" } },
    data: { status: "watched" },
  });
}
