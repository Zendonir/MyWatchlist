import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<{ ok: boolean; message: string }>("/auth/forgot-password", { email });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Anfrage fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🎬 MyWatchlist</h1>
        <h2>Passwort vergessen</h2>
        {message ? (
          <p className="form-hint">{message}</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              E-Mail-Adresse
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Sende…" : "Link anfordern"}
            </button>
          </form>
        )}
        <p className="form-hint">
          <Link to="/login">Zurück zur Anmeldung</Link>
        </p>
      </div>
    </div>
  );
}
