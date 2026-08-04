import { FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth, ApiError } from "../api/AuthContext";

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Anmeldung fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🎬 MyWatchlist</h1>
        <form onSubmit={handleSubmit}>
          <label>
            E-Mail-Adresse
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            Passwort
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Anmelden…" : "Anmelden"}
          </button>
        </form>
        <p className="form-hint">
          <Link to="/forgot-password">Passwort vergessen?</Link>
        </p>
      </div>
    </div>
  );
}
