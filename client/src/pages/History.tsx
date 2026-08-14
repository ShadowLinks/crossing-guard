import { useEffect, useState } from "react";
import { api, AuditRecord } from "../api";

const OUTCOME_LABEL: Record<AuditRecord["outcome"], string> = {
  "created-live": "Created automatically",
  "manual-required": "Needs manual finish",
  failed: "Failed"
};

export default function History() {
  const [records, setRecords] = useState<AuditRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .history()
      .then(setRecords)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="page">
      <h1>Rule history</h1>
      <p className="muted">Every rule this tool has created or prepared, most recent first.</p>

      {error && <div className="banner banner-error">{error}</div>}
      {!records && !error && <div className="muted">Loading...</div>}

      {records && records.length === 0 && <p className="muted">No rules created yet.</p>}

      {records && records.length > 0 && (
        <table className="history-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Org unit</th>
              <th>Summary</th>
              <th>Requested by</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.kind === "gmail-compliance" ? "Gmail rule" : "Drive trust rule"}</td>
                <td>
                  <code>{r.orgUnitPath}</code>
                </td>
                <td>{r.summary}</td>
                <td>{r.createdBy}</td>
                <td>
                  <span className={`status-pill status-${r.outcome}`}>{OUTCOME_LABEL[r.outcome]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
