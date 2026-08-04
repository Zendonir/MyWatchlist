import { FormEvent, useEffect, useState } from "react";
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
  lastSync: SyncLogEntry | null;
  lastMetadataRefresh: SyncLogEntry | null;
}

export default function Settings() {
  const { user, logout, setUser } = useAuth();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const [email, setEmail] = useState(user?.email ?? "");
  const [notifyEmail, setNotifyEmail] = useState(user?.notifyEmail ?? true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
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
    setEmail(user?.email ?? "");
    setNotifyEmail(user?.notifyEmail ?? true);
  }, [user?.email, user?.notifyEmail]);

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
      const updated = await api.patch<User>("/auth/me", { email: email.trim() || null, notifyEmail });
      setUser(updated);
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Konnte nicht gespeichert werden");
    } finally {
      setSavingProfile(false);
    }
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setUserError(null);
    setCreatingUser(true);
    try {
      await api.post("/users", {
        username: newUsername,
        password: newPassword,
        email: newEmail.trim() || undefined,
      });
      setNewUsername("");
      setNewPassword("");
      setNewEmail("");
      loadUsers();
    } catch (err) {
      setUserError(err instanceof ApiError ? err.message : "Nutzer konnte nicht angelegt werden");
    } finally {
      setCreatingUser(false);
    }
  }

  async function deleteUser(id: number, username: string) {
    if (!confirm(`Nutzer "${username}" wirklich löschen? Seine komplette Watchlist wird dabei unwiderruflich mitgelöscht.`))
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
        <p>Angemeldet als {user?.username}</p>
        <button onClick={logout}>Abmelden</button>
      </section>

      <section className="settings-section">
        <h2>Passwort ändern</h2>
        <ChangePasswordForm />
      </section>

      <section className="settings-section">
        <h2>E-Mail &amp; Benachrichtigungen</h2>
        <p className="form-hint">
          Wird für "Passwort vergessen" sowie Benachrichtigungen über neue Folgen und abgeschlossene Serien
          verwendet. Ohne E-Mail-Adresse funktioniert beides nicht.
        </p>
        <form className="user-form" onSubmit={saveProfile}>
          <label>
            E-Mail-Adresse
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@example.com" />
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
                    {u.username}
                    {u.role === "admin" && <span className="user-list__badge">Admin</span>}
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
                      <button
                        className="danger-button danger-button--small"
                        onClick={() => deleteUser(u.id, u.username)}
                      >
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
              Nutzername
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                minLength={3}
                required
              />
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
            <label>
              E-Mail (optional)
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
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
