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
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  function load() {
    api
      .history()
      .then(setRecords)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleDelete(id: string) {
    setWorkingId(id);
    setRowError((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await api.deleteRule(id);
      setRecords((prev) => (prev ? prev.map((r) => (r.id === id ? res.record : r)) : prev));
      setConfirmingId(null);
    } catch (err: any) {
      setRowError((prev) => ({ ...prev, [id]: err.message }));
    } finally {
      setWorkingId(null);
    }
  }

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
              <th>Live rule</th>
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
                <td>
                  {!r.livePolicyNames || r.livePolicyNames.length === 0 ? (
                    <span className="muted small">n/a</span>
                  ) : r.deletedAt ? (
                    <span className="muted small">
                      Deleted {new Date(r.deletedAt).toLocaleDateString()} by {r.deletedBy ?? "unknown"}
                    </span>
                  ) : confirmingId === r.id ? (
                    <span className="delete-confirm">
                      <span className="muted small">
                        Delete {r.livePolicyNames.length > 1 ? `${r.livePolicyNames.length} Google rules` : "this Google rule"}?
                      </span>
                      <button
                        className="link-button danger"
                        disabled={workingId === r.id}
                        onClick={() => handleDelete(r.id)}
                      >
                        {workingId === r.id ? "Deleting..." : "Confirm delete"}
                      </button>
                      <button
                        className="link-button"
                        disabled={workingId === r.id}
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button className="link-button danger" onClick={() => setConfirmingId(r.id)}>
                      Delete
                    </button>
                  )}
                  {rowError[r.id] && <div className="banner banner-error small">{rowError[r.id]}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
