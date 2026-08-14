import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { api, MeResponse } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import GmailRuleWizard from "./pages/GmailRuleWizard";
import TrustRuleWizard from "./pages/TrustRuleWizard";
import History from "./pages/History";

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="centered">Loading...</div>;
  }

  const error = params.get("error");

  if (!me?.signedIn) {
    return <Login error={error} />;
  }

  if (!me.hasAdminAccess) {
    return (
      <div className="centered">
        <div className="card">
          <h1>No admin access</h1>
          <p>
            You're signed in as <strong>{me.email}</strong>, but this Google account does not hold a Google
            Workspace admin role. Ask your Workspace super admin to grant you the appropriate delegated admin
            privileges (Organizational Units, Security settings, Groups) and sign in again.
          </p>
          <button
            onClick={async () => {
              await api.logout();
              window.location.href = "/";
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <Link to="/" className="brand">
          <img src="/logo.png" alt="" className="brand-logo" />
          Compliance Rule Manager
        </Link>
        <nav>
          <Link to="/gmail-rule">New Gmail rule</Link>
          <Link to="/trust-rule">New Drive trust rule</Link>
          <Link to="/history">History</Link>
        </nav>
        <div className="user-chip">
          <span>{me.name}</span>
          <button
            className="link-button"
            onClick={async () => {
              await api.logout();
              navigate(0);
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard me={me} />} />
          <Route path="/gmail-rule" element={<GmailRuleWizard liveDlpEnabled={Boolean(me.liveDlpApiEnabled)} />} />
          <Route path="/trust-rule" element={<TrustRuleWizard />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
      <footer className="app-footer">Built with AI assistance (Claude) &middot; see NOTICE.md</footer>
    </div>
  );
}
