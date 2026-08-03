import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../api/AuthContext";

interface SyncLogEntry {
  startedAt: string;
  finishedAt: string | null;
  status: string;
  itemsUpdated: number;
  message: string | null;
}

interface SyncStatus {
  kodiConfigured: boolean;
  tmdbConfigured: boolean;
  lastSync: SyncLogEntry | null;
  lastMetadataRefresh: SyncLogEntry | null;
}

export default function Settings() {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  function loadStatus() {
    api.get<SyncStatus>("/sync/status").then(setStatus);
  }

  async function triggerSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.post<{ itemsUpdated: number }>("/sync/kodi");
      setSyncMessage(`Sync erfolgreich: ${result.itemsUpdated} Eintrag/Einträge aktualisiert.`);
      loadStatus();
    } catch (err) {
      setSyncMessage(err instanceof ApiError ? err.message : "Sync fehlgeschlagen");
    } finally {
      setSyncing(false);
    }
  }

  async function triggerMetadataRefresh() {
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      const result = await api.post<{ episodesAdded: number; itemsRefreshed: number }>("/sync/metadata");
      setRefreshMessage(
        `Aktualisiert: ${result.episodesAdded} neue Folge(n), ${result.itemsRefreshed} Eintrag/Einträge geprüft.`
      );
      loadStatus();
    } catch (err) {
      setRefreshMessage(err instanceof ApiError ? err.message : "Aktualisierung fehlgeschlagen");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Einstellungen</h1>

      <section className="settings-section">
        <h2>Konto</h2>
        <p>Angemeldet als {user?.username}</p>
        <button onClick={logout}>Abmelden</button>
      </section>

      <section className="settings-section">
        <h2>Kodi-Synchronisierung</h2>
        {status?.kodiConfigured ? (
          <>
            <p>
              Letzter Sync:{" "}
              {status.lastSync
                ? `${new Date(status.lastSync.startedAt).toLocaleString("de-DE")} - ${status.lastSync.status}`
                : "noch nie"}
            </p>
            {status.lastSync?.status === "error" && status.lastSync.message && (
              <p className="form-error">{status.lastSync.message}</p>
            )}
            {user?.role === "admin" && (
              <button onClick={triggerSync} disabled={syncing}>
                {syncing ? "Synchronisiere…" : "Jetzt synchronisieren"}
              </button>
            )}
            {syncMessage && <p className="form-hint">{syncMessage}</p>}
          </>
        ) : (
          <p>Kodi-Datenbank ist nicht konfiguriert (siehe README / Umgebungsvariablen).</p>
        )}
      </section>

      <section className="settings-section">
        <h2>Neue Folgen &amp; Metadaten</h2>
        {status?.tmdbConfigured ? (
          <>
            <p>
              Letzte Aktualisierung:{" "}
              {status.lastMetadataRefresh
                ? `${new Date(status.lastMetadataRefresh.startedAt).toLocaleString("de-DE")} - ${status.lastMetadataRefresh.status}`
                : "noch nie"}
            </p>
            {status.lastMetadataRefresh?.status === "error" && status.lastMetadataRefresh.message && (
              <p className="form-error">{status.lastMetadataRefresh.message}</p>
            )}
            <p className="form-hint">Prüft täglich automatisch auf neu erschienene Folgen und fehlende Poster/Infos.</p>
            {user?.role === "admin" && (
              <button onClick={triggerMetadataRefresh} disabled={refreshing}>
                {refreshing ? "Aktualisiere…" : "Jetzt aktualisieren"}
              </button>
            )}
            {refreshMessage && <p className="form-hint">{refreshMessage}</p>}
          </>
        ) : (
          <p>TMDB ist nicht konfiguriert.</p>
        )}
      </section>
    </div>
  );
}
