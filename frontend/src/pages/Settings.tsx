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
  version: string;
  kodiConfigured: boolean;
  tmdbConfigured: boolean;
  emailConfigured: boolean;
  lastSync: SyncLogEntry | null;
  lastMetadataRefresh: SyncLogEntry | null;
}

interface SmtpStatus {
  configured: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string | null;
  from?: string;
  passwordSet?: boolean;
}

export default function Settings() {
  const { user, logout, setUser } = useAuth();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [notifyEmail, setNotifyEmail] = useState(user?.notifyEmail ?? true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [smtp, setSmtp] = useState<SmtpStatus | null>(null);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [removingSmtp, setRemovingSmtp] = useState(false);

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
    if (user?.role === "admin") {
      loadUsers();
      loadSmtp();
    }
  }, [user?.role]);

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

  function loadSmtp() {
    api.get<SmtpStatus>("/admin/smtp").then((s) => {
      setSmtp(s);
      setSmtpHost(s.host ?? "");
      setSmtpPort(String(s.port ?? "587"));
      setSmtpSecure(s.secure ?? false);
      setSmtpUser(s.user ?? "");
      setSmtpFrom(s.from ?? "");
      setSmtpPassword("");
    });
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

  async function saveSmtp(e: FormEvent) {
    e.preventDefault();
    setSmtpError(null);
    setSmtpSaved(false);
    setSavingSmtp(true);
    try {
      await api.put("/admin/smtp", {
        host: smtpHost,
        port: Number(smtpPort),
        secure: smtpSecure,
        user: smtpUser || undefined,
        password: smtpPassword || undefined,
        from: smtpFrom,
      });
      setSmtpSaved(true);
      loadStatus();
      loadSmtp();
    } catch (err) {
      setSmtpError(err instanceof ApiError ? [err.message, err.detail].filter(Boolean).join(": ") : "Konnte nicht gespeichert werden");
    } finally {
      setSavingSmtp(false);
    }
  }

  async function removeSmtp() {
    if (!confirm("SMTP-Konfiguration entfernen? \"Passwort vergessen\" und Benachrichtigungsmails funktionieren dann nicht mehr.")) {
      return;
    }
    setRemovingSmtp(true);
    try {
      await api.delete("/admin/smtp");
      setSmtpHost("");
      setSmtpPort("587");
      setSmtpSecure(false);
      setSmtpUser("");
      setSmtpPassword("");
      setSmtpFrom("");
      loadStatus();
      loadSmtp();
    } catch (err) {
      setSmtpError(err instanceof ApiError ? err.message : "Entfernen fehlgeschlagen");
    } finally {
      setRemovingSmtp(false);
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
          <h2>E-Mail-Versand (SMTP)</h2>
          <p className="form-hint">
            Wird für "Passwort vergessen" und tägliche Benachrichtigungsmails (neue Folgen / abgeschlossene Serien)
            verwendet. Bei Gmail: Host <code>smtp.gmail.com</code>, Port <code>587</code>, als Passwort ein{" "}
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
              App-Passwort
            </a>{" "}
            verwenden (erfordert 2-Faktor-Authentifizierung), nicht das normale Google-Passwort.
          </p>
          <form className="user-form" onSubmit={saveSmtp}>
            <label>
              SMTP-Host
              <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" required />
            </label>
            <label>
              Port
              <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} min={1} max={65535} required />
            </label>
            <label className="settings-checkbox-row">
              <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
              Implizites TLS (meist Port 465) - sonst STARTTLS auf Port 587
            </label>
            <label>
              Benutzername
              <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
            </label>
            <label>
              Passwort {smtp?.passwordSet && <span className="form-hint">(gesetzt - leer lassen, um es zu behalten)</span>}
              <input
                type="password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={smtp?.passwordSet ? "unverändert lassen" : ""}
              />
            </label>
            <label>
              Absenderadresse
              <input
                type="text"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder="MyWatchlist <you@example.com>"
                required
              />
            </label>
            {smtpError && <div className="form-error">{smtpError}</div>}
            {smtpSaved && <div className="form-hint">Gespeichert.</div>}
            <div className="user-list__actions">
              <button type="submit" disabled={savingSmtp}>
                {savingSmtp ? "Speichere…" : "Speichern"}
              </button>
              {smtp?.configured && (
                <button type="button" className="danger-button--small" onClick={removeSmtp} disabled={removingSmtp}>
                  {removingSmtp ? "Entferne…" : "Entfernen"}
                </button>
              )}
            </div>
          </form>

          {status?.emailConfigured && (
            <>
              <div className="user-list__actions settings-mt">
                <button onClick={() => sendTestEmail("simple")} disabled={testingEmail}>
                  {testingEmail ? "Sende…" : "Test-E-Mail senden"}
                </button>
                <button onClick={() => sendTestEmail("digest")} disabled={testingEmail}>
                  {testingEmail ? "Sende…" : "Beispiel-Digest senden"}
                </button>
              </div>
              <p className="form-hint">Sendet an deine eigene hinterlegte Adresse ({user.email}).</p>
              {testEmailMessage && <p className="form-hint">{testEmailMessage}</p>}
            </>
          )}
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

      {status?.version && <p className="app-version">MyWatchlist v{status.version}</p>}
    </div>
  );
}
