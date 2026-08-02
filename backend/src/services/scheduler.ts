import cron from "node-cron";
import { env, kodiConfigured } from "../env";
import { runKodiSync } from "./kodiSync";

export function startScheduler() {
  if (!kodiConfigured) {
    console.log("Kodi sync disabled - KODI_DB_* environment variables not fully set.");
    return;
  }

  if (!cron.validate(env.KODI_SYNC_CRON)) {
    console.error(`Invalid KODI_SYNC_CRON expression: "${env.KODI_SYNC_CRON}" - sync disabled.`);
    return;
  }

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
