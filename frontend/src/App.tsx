import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./api/AuthContext";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";
import OAuthCallback from "./pages/OAuthCallback";
import Dashboard from "./pages/Dashboard";
import Search from "./pages/Search";
import MediaDetail from "./pages/MediaDetail";
import Settings from "./pages/Settings";
import BottomNav from "./components/BottomNav";

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="centered-message">Lädt…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;

  return (
    <div className="app-shell">
      <main className="app-content">{children}</main>
      <BottomNav />
    </div>
  );
}

function ChangePasswordShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="centered-message">Lädt…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to="/" replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/oauth-callback" element={<OAuthCallback />} />
      <Route
        path="/change-password"
        element={
          <ChangePasswordShell>
            <ChangePassword />
          </ChangePasswordShell>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedShell>
            <Dashboard />
          </ProtectedShell>
        }
      />
      <Route
        path="/search"
        element={
          <ProtectedShell>
            <Search />
          </ProtectedShell>
        }
      />
      <Route
        path="/media/:id"
        element={
          <ProtectedShell>
            <MediaDetail />
          </ProtectedShell>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedShell>
            <Settings />
          </ProtectedShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
