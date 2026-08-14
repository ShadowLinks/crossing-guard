import { useState } from "react";
import OrgUnitPicker from "../components/OrgUnitPicker";
import DeepLinkCard from "../components/DeepLinkCard";
import { api, MailDirection, RuleResult } from "../api";

export default function GmailRuleWizard({ liveDlpEnabled }: { liveDlpEnabled: boolean }) {
  const [orgUnitPath, setOrgUnitPath] = useState("/");
  const [direction, setDirection] = useState<MailDirection>("internal-external");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RuleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.createGmailRule({ orgUnitPath, direction, description: description || undefined });
      setResult(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1>Block Gmail content</h1>
      <p className="muted">
        Choose which org unit this applies to and which direction of mail to block. This does not delete or filter
        existing mail - it prevents new mail matching this route from being delivered going forward.
      </p>

      {!liveDlpEnabled && (
        <div className="banner banner-info">
          This will prepare the rule and give you a direct link to finish creating it in the Admin console - Google
          doesn't currently allow any app to create this specific rule type automatically end-to-end.
        </div>
      )}

      <div className="card form-card">
        <label className="field-label">1. Org unit</label>
        <OrgUnitPicker value={orgUnitPath} onChange={setOrgUnitPath} />

        <label className="field-label">2. What to block</label>
        <div className="radio-group">
          <label className={`radio-option ${direction === "internal-external" ? "radio-option-selected" : ""}`}>
            <input
              type="radio"
              checked={direction === "internal-external"}
              onChange={() => setDirection("internal-external")}
            />
            <div>
              <strong>Internal &rarr; External</strong>
              <p>Block mail sent from an address on your domain to an address outside your domain.</p>
            </div>
          </label>
          <label className={`radio-option ${direction === "external-internal" ? "radio-option-selected" : ""}`}>
            <input
              type="radio"
              checked={direction === "external-internal"}
              onChange={() => setDirection("external-internal")}
            />
            <div>
              <strong>External &rarr; Internal</strong>
              <p>Block mail sent from an address outside your domain to an address on your domain.</p>
            </div>
          </label>
          <label className={`radio-option ${direction === "internal-internal" ? "radio-option-selected" : ""}`}>
            <input
              type="radio"
              checked={direction === "internal-internal"}
              onChange={() => setDirection("internal-internal")}
            />
            <div>
              <strong>Internal &rarr; Internal</strong>
              <p>Block mail sent between two addresses that are both on your domain.</p>
            </div>
          </label>
        </div>

        <label className="field-label" htmlFor="description">
          3. Notes (optional, for your own records)
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Requested by principal Smith for 8th grade OU, ticket #1234"
        />

        <button className="primary-button" disabled={submitting} onClick={handleSubmit}>
          {submitting ? "Working..." : "Create rule"}
        </button>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      {result?.outcome === "created-live" && (
        <div className="banner banner-success">
          Rule created automatically. Google reference: {result.policyName}. Double-check it under Admin console
          &rarr; Security &rarr; Data protection &rarr; Rules.
        </div>
      )}

      {result?.warning && <div className="banner banner-error">{result.warning}</div>}

      {result?.outcome === "manual-required" && result.manual && <DeepLinkCard manual={result.manual} />}
    </div>
  );
}
