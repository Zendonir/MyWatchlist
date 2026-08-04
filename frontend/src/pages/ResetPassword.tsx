import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", { token, newPassword });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Zurücksetzen fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>🎬 MyWatchlist</h1>
          <p className="form-error">Kein gültiger Link. Bitte fordere einen neuen an.</p>
          <p className="form-hint">
            <Link to="/forgot-password">Passwort vergessen</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🎬 MyWatchlist</h1>
        <h2>Neues Passwort setzen</h2>
        {success ? (
          <p className="form-hint">
            Passwort geändert. <Link to="/login">Jetzt anmelden</Link>
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              Neues Passwort
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
                autoFocus
              />
            </label>
            <label>
              Neues Passwort bestätigen
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Speichere…" : "Passwort setzen"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
