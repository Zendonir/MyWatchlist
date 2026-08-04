import { FormEvent, useState } from "react";
import { api, ApiError, User } from "../api/client";
import { useAuth } from "../api/AuthContext";

export default function ChangePasswordForm({ onSuccess }: { onSuccess?: () => void }) {
  const { setUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    setSubmitting(true);
    try {
      const updated = await api.post<User>("/auth/change-password", { currentPassword, newPassword });
      setUser(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Passwort konnte nicht geändert werden");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="change-password-form" onSubmit={handleSubmit}>
      <label>
        Aktuelles Passwort
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </label>
      <label>
        Neues Passwort
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={8}
          required
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
      {success && <div className="form-hint">Passwort erfolgreich geändert.</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Ändere…" : "Passwort ändern"}
      </button>
    </form>
  );
}
