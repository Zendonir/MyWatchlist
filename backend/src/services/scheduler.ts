import cron from "node-cron";
import { env, kodiConfigured, tmdbConfigured } from "../env";
import { runKodiSync } from "./kodiSync";
import { runMetadataRefresh } from "./metadataRefresh";

export function startScheduler() {
  if (!kodiConfigured) {
    console.log("Kodi sync disabled - KODI_DB_* environment variables not fully set.");
  } else if (!cron.validate(env.KODI_SYNC_CRON)) {
    console.error(`Invalid KODI_SYNC_CRON expression: "${env.KODI_SYNC_CRON}" - sync disabled.`);
  } else {
    cron.schedule(env.KODI_SYNC_CRON, async () => {
      try {
        const { itemsUpdated } = await runKodiSync();
        console.log(`Kodi sync complete: ${itemsUpdated} item(s) updated.`);
      } catch (err) {
        console.error("Kodi sync failed:", err);
      }
    });
    console.log(`Kodi sync scheduled with cron "${env.KODI_SYNC_CRON}".`);
  }

  if (!tmdbConfigured) {
    console.log("Metadata refresh disabled - TMDB is not configured.");
  } else if (!cron.validate(env.METADATA_REFRESH_CRON)) {
    console.error(`Invalid METADATA_REFRESH_CRON expression: "${env.METADATA_REFRESH_CRON}" - refresh disabled.`);
  } else {
    cron.schedule(env.METADATA_REFRESH_CRON, async () => {
      try {
        const { episodesAdded, itemsRefreshed } = await runMetadataRefresh();
        console.log(`Metadata refresh complete: ${episodesAdded} episode(s) added, ${itemsRefreshed} item(s) refreshed.`);
      } catch (err) {
        console.error("Metadata refresh failed:", err);
      }
    });
    console.log(`Metadata refresh scheduled with cron "${env.METADATA_REFRESH_CRON}".`);
  }
}
