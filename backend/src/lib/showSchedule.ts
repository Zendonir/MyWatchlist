interface ScheduleEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  airDate: string | null;
}

export interface ShowSchedule {
  /** The next episode that hasn't aired yet, if any. */
  nextEpisode: ScheduleEpisode | null;
  /** Air date of the final episode of the season `nextEpisode` belongs to. */
  seasonFinaleDate: string | null;
}

/**
 * Derives upcoming-air info from the episodes already stored for a show.
 *
 * Air dates are TMDB's plain "YYYY-MM-DD" strings, which compare correctly
 * with a lexicographic `>` against today in the same format - no date parsing
 * or timezone handling needed.
 */
export function getShowSchedule(episodes: ScheduleEpisode[]): ShowSchedule {
  const today = new Date().toISOString().slice(0, 10);

  const upcoming = episodes
    .filter((e) => e.airDate && e.airDate > today)
    .sort((a, b) => a.airDate!.localeCompare(b.airDate!));

  const nextEpisode = upcoming[0] ?? null;
  if (!nextEpisode) return { nextEpisode: null, seasonFinaleDate: null };

  const seasonDates = episodes
    .filter((e) => e.seasonNumber === nextEpisode.seasonNumber && e.airDate)
    .map((e) => e.airDate!)
    .sort();

  return {
    nextEpisode,
    seasonFinaleDate: seasonDates.length > 0 ? seasonDates[seasonDates.length - 1] : null,
  };
}
