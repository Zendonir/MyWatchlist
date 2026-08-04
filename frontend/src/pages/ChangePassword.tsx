import { useNavigate } from "react-router-dom";
import ChangePasswordForm from "../components/ChangePasswordForm";

export default function ChangePassword() {
  const navigate = useNavigate();

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🎬 MyWatchlist</h1>
        <p className="form-hint">
          Ein Admin hat dein Passwort vergeben. Bitte setze jetzt dein eigenes Passwort, bevor es weitergeht.
        </p>
        <ChangePasswordForm onSuccess={() => navigate("/")} />
      </div>
    </div>
  );
}
