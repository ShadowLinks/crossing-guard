import { Link } from "react-router-dom";
import type { MeResponse } from "../api";

export default function Dashboard({ me }: { me: MeResponse }) {
  return (
    <div className="page">
      <h1>Welcome, {me.name?.split(" ")[0]}</h1>
      <p className="muted">
        Signed in as {me.email} &middot; {me.isAdmin ? "Super admin" : "Delegated admin"}
      </p>

      {!me.liveDlpApiEnabled && (
        <div className="banner banner-info">
          Gmail rules are currently created in guided mode: this app fills in every value for you and hands you a
          direct link into the Admin console to finish with a couple of clicks. Fully automatic creation is built
          in but turned off until your admin enables and verifies it (see NOTICE.md).
        </div>
      )}

      <div className="tile-grid">
        <Link to="/gmail-rule" className="tile">
          <h2>Block Gmail content</h2>
          <p>Stop mail from a specific address, to a specific address, or between two specific addresses - internal or external.</p>
        </Link>
        <Link to="/trust-rule" className="tile">
          <h2>Restrict Google Drive sharing</h2>
          <p>Create a trust rule to block sharing files outside your organization, or allow only trusted domains.</p>
        </Link>
        <Link to="/history" className="tile">
          <h2>View history</h2>
          <p>See every rule this tool has created or prepared, and who requested it.</p>
        </Link>
      </div>
    </div>
  );
}
