import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError, User } from "../api/client";
import { useAuth } from "../api/AuthContext";
import ChangePasswordForm from "../components/ChangePasswordForm";

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
  googleOAuthConfigured: boolean;
  emailConfigured: boolean;
  connectedGoogleEmail: string | null;
  lastSync: SyncLogEntry | null;
  lastMetadataRefresh: SyncLogEntry | null;
}

export default function Settings() {
  const { user, logout, setUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  const [googleStatusMessage, setGoogleStatusMessage] = useState<string | null>(() => {
    if (searchParams.get("google") === "connected") return "Google-Konto erfolgreich verbunden.";
    if (searchParams.get("google") === "error") {
      return `Verbindung fehlgeschlagen: ${searchParams.get("message") ?? "unbekannter Fehler"}`;
    }
    return null;
  });

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [notifyEmail, setNotifyEmail] = useState(user?.notifyEmail ?? true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailMessage, setTestEmailMessage] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [userError, setUserError] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);

  const [resettingUserId, setResettingUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
    if (user?.role === "admin") loadUsers();
  }, [user?.role]);

  useEffect(() => {
    if (searchParams.has("google")) {
      setSearchParams({}, { replace: true });
    }
    // Only ever needs to run once, to strip the OAuth redirect's query
    // params - re-running on every searchParams change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The popup's /oauth-callback page posts the result here instead of the
  // popup itself navigating this window - see connectGoogle below.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== "mywatchlist-google-oauth") return;
      if (event.data.ok) {
        setGoogleStatusMessage("Google-Konto erfolgreich verbunden.");
        loadStatus();
      } else {
        setGoogleStatusMessage(`Verbindung fehlgeschlagen: ${event.data.message ?? "unbekannter Fehler"}`);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  function connectGoogle() {
    const popup = window.open("/api/admin/google/connect", "google-connect", "width=500,height=650");
    // Popup blockers etc. can return null - fall back to a normal top-level
    // navigation, which /oauth-callback also handles fine (no window.opener).
    if (!popup) {
      window.location.href = "/api/admin/google/connect";
    }
  }

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setNotifyEmail(user?.notifyEmail ?? true);
  }, [user?.name, user?.email, user?.notifyEmail]);

  function loadStatus() {
    api.get<SyncStatus>("/sync/status").then(setStatus);
  }

  function loadUsers() {
    api.get<User[]>("/users").then(setUsers);
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSaved(false);
    setSavingProfile(true);
    try {
      const updated = await api.patch<User>("/auth/me", { name, email, notifyEmail });
      setUser(updated);
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Konnte nicht gespeichert werden");
    } finally {
      setSavingProfile(false);
    }
  }

  async function disconnectGoogle() {
    if (!confirm("Verbindung zum Google-Konto trennen? Passwort vergessen und Benachrichtigungsmails funktionieren dann nicht mehr, bis erneut verbunden wird.")) {
      return;
    }
    setDisconnectingGoogle(true);
    try {
      await api.post("/admin/google/disconnect");
      setGoogleStatusMessage("Verbindung getrennt.");
      loadStatus();
    } catch (err) {
      setGoogleStatusMessage(err instanceof ApiError ? err.message : "Trennen fehlgeschlagen");
    } finally {
      setDisconnectingGoogle(false);
    }
  }

  async function sendTestEmail(kind: "simple" | "digest") {
    setTestingEmail(true);
    setTestEmailMessage(null);
    try {
      const result = await api.post<{ sentTo: string }>("/sync/test-email", { kind });
      setTestEmailMessage(`Gesendet an ${result.sentTo}.`);
    } catch (err) {
      setTestEmailMessage(
        err instanceof ApiError ? [err.message, err.detail].filter(Boolean).join(": ") : "Versand fehlgeschlagen"
      );
    } finally {
      setTestingEmail(false);
    }
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setUserError(null);
    setCreatingUser(true);
    try {
      await api.post("/users", { name: newName, email: newEmail, password: newPassword });
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      loadUsers();
    } catch (err) {
      setUserError(err instanceof ApiError ? err.message : "Nutzer konnte nicht angelegt werden");
    } finally {
      setCreatingUser(false);
    }
  }

  async function deleteUser(id: number, name: string) {
    if (!confirm(`Nutzer "${name}" wirklich löschen? Seine komplette Watchlist wird dabei unwiderruflich mitgelöscht.`))
      return;
    try {
      await api.delete(`/users/${id}`);
      loadUsers();
    } catch (err) {
      setUserError(err instanceof ApiError ? err.message : "Nutzer konnte nicht gelöscht werden");
    }
  }

  async function submitResetPassword(e: FormEvent, id: number) {
    e.preventDefault();
    setResetMessage(null);
    try {
      await api.patch(`/users/${id}/reset-password`, { password: resetPassword });
      setResetMessage("Passwort gesetzt. Der Nutzer muss es beim nächsten Login ändern.");
      setResetPassword("");
      setResettingUserId(null);
    } catch (err) {
      setResetMessage(err instanceof ApiError ? err.message : "Passwort konnte nicht gesetzt werden");
    }
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
        <p>Angemeldet als {user?.name}</p>
        <button onClick={logout}>Abmelden</button>
      </section>

      <section className="settings-section">
        <h2>Passwort ändern</h2>
        <ChangePasswordForm />
      </section>

      <section className="settings-section">
        <h2>Profil &amp; Benachrichtigungen</h2>
        <p className="form-hint">
          Die E-Mail-Adresse dient auch als Login. Sie wird außerdem für "Passwort vergessen" sowie
          Benachrichtigungen über neue Folgen und abgeschlossene Serien verwendet.
        </p>
        <form className="user-form" onSubmit={saveProfile}>
          <label>
            Name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            E-Mail-Adresse
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="settings-checkbox-row">
            <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
            Per E-Mail über neue Folgen &amp; abgeschlossene Serien benachrichtigen
          </label>
          {profileError && <div className="form-error">{profileError}</div>}
          {profileSaved && <div className="form-hint">Gespeichert.</div>}
          <button type="submit" disabled={savingProfile}>
            {savingProfile ? "Speichere…" : "Speichern"}
          </button>
        </form>
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

      {user?.role === "admin" && (
        <section className="settings-section">
          <h2>E-Mail-Versand</h2>
          {!status?.googleOAuthConfigured ? (
            <p>
              Google OAuth ist nicht konfiguriert (siehe README / Umgebungsvariablen GOOGLE_CLIENT_ID /
              GOOGLE_CLIENT_SECRET / APP_URL).
            </p>
          ) : status?.emailConfigured ? (
            <>
              <p className="form-hint">
                Verbunden als <strong>{status.connectedGoogleEmail}</strong>. Sendet Testmails an deine eigene
                hinterlegte Adresse ({user.email}). "Beispiel-Digest" zeigt genau das Format der täglichen
                Benachrichtigungsmail mit Beispieldaten.
              </p>
              <div className="user-list__actions">
                <button onClick={() => sendTestEmail("simple")} disabled={testingEmail}>
                  {testingEmail ? "Sende…" : "Test-E-Mail senden"}
                </button>
                <button onClick={() => sendTestEmail("digest")} disabled={testingEmail}>
                  {testingEmail ? "Sende…" : "Beispiel-Digest senden"}
                </button>
                <button className="danger-button--small" onClick={disconnectGoogle} disabled={disconnectingGoogle}>
                  {disconnectingGoogle ? "Trenne…" : "Verbindung trennen"}
                </button>
              </div>
              {testEmailMessage && <p className="form-hint">{testEmailMessage}</p>}
            </>
          ) : (
            <>
              <p className="form-hint">
                Verbinde ein Google-Konto, um "Passwort vergessen" und tägliche Benachrichtigungsmails (neue Folgen /
                abgeschlossene Serien) zu aktivieren.
              </p>
              <button onClick={connectGoogle}>Mit Google verbinden</button>
            </>
          )}
          {googleStatusMessage && <p className="form-hint">{googleStatusMessage}</p>}
        </section>
      )}

      {user?.role === "admin" && (
        <section className="settings-section">
          <h2>Nutzer</h2>
          <p className="form-hint">
            Jeder Nutzer verwaltet seine eigene Watchlist unabhängig. Kodi-Sync betrifft nur dein eigenes Konto. Neu
            angelegte Nutzer müssen ihr Passwort beim ersten Login selbst ändern.
          </p>

          <div className="user-list">
            {users.map((u) => (
              <div key={u.id} className="user-list__row">
                <div className="user-list__row-main">
                  <span>
                    {u.name}
                    {u.role === "admin" && <span className="user-list__badge">Admin</span>}
                    <span className="user-list__email">{u.email}</span>
                  </span>
                  <div className="user-list__actions">
                    <button
                      className="danger-button--small"
                      onClick={() => {
                        setResettingUserId(resettingUserId === u.id ? null : u.id);
                        setResetPassword("");
                        setResetMessage(null);
                      }}
                    >
                      Passwort zurücksetzen
                    </button>
                    {u.id !== user.id && (
                      <button className="danger-button danger-button--small" onClick={() => deleteUser(u.id, u.name)}>
                        Entfernen
                      </button>
                    )}
                  </div>
                </div>
                {resettingUserId === u.id && (
                  <form className="user-list__reset-form" onSubmit={(e) => submitResetPassword(e, u.id)}>
                    <input
                      type="password"
                      placeholder="Neues Passwort"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      minLength={8}
                      required
                      autoFocus
                    />
                    <button type="submit">Setzen</button>
                  </form>
                )}
              </div>
            ))}
          </div>
          {resetMessage && <p className="form-hint">{resetMessage}</p>}

          <form className="user-form" onSubmit={createUser}>
            <label>
              Name
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </label>
            <label>
              E-Mail-Adresse
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
            </label>
            <label>
              Passwort
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            {userError && <div className="form-error">{userError}</div>}
            <button type="submit" disabled={creatingUser}>
              {creatingUser ? "Lege an…" : "Nutzer hinzufügen"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
