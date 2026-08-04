import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

// Lands here after the Google OAuth redirect - normally inside the popup
// window Settings.tsx opened (see connectGoogle there). Relays the result to
// the opener and closes itself; if there's no opener (popup got blocked and
// the connect link was followed top-level instead), falls back to a normal
// in-app redirect to Settings.
export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const ok = searchParams.get("ok") === "1";
    const message = searchParams.get("message");

    if (window.opener) {
      window.opener.postMessage({ source: "mywatchlist-google-oauth", ok, message }, window.location.origin);
      window.close();
    } else {
      const params = new URLSearchParams({ google: ok ? "connected" : "error" });
      if (message) params.set("message", message);
      navigate(`/settings?${params.toString()}`, { replace: true });
    }
    // Only ever needs to run once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="centered-message">Verbindung wird abgeschlossen…</div>;
}
