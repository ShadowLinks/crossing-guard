import { useState } from "react";
import OrgUnitPicker from "../components/OrgUnitPicker";
import DeepLinkCard from "../components/DeepLinkCard";
import { api, RuleResult, TrustRuleScope } from "../api";

export default function TrustRuleWizard() {
  const [orgUnitPath, setOrgUnitPath] = useState("/");
  const [scope, setScope] = useState<TrustRuleScope>("block-all-external");
  const [domainsText, setDomainsText] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RuleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const trustedDomains = domainsText
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      const res = await api.createTrustRule({
        orgUnitPath,
        scope,
        trustedDomains: scope === "allow-only-trusted-domains" ? trustedDomains : undefined,
        description: description || undefined
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1>Restrict Google Drive sharing</h1>
      <p className="muted">
        Trust rules control who your users can share Drive files with, outside your organization. Google does not
        currently offer any way to create these automatically from an outside app - this wizard prepares everything
        and hands you a direct link to finish with a couple of clicks.
      </p>

      <div className="card form-card">
        <label className="field-label">1. Org unit</label>
        <OrgUnitPicker value={orgUnitPath} onChange={setOrgUnitPath} />

        <label className="field-label">2. Sharing policy</label>
        <div className="radio-group">
          <label className={`radio-option ${scope === "block-all-external" ? "radio-option-selected" : ""}`}>
            <input
              type="radio"
              checked={scope === "block-all-external"}
              onChange={() => setScope("block-all-external")}
            />
            <div>
              <strong>Block all external sharing</strong>
              <p>No Drive files can be shared with anyone outside your organization.</p>
            </div>
          </label>
          <label
            className={`radio-option ${scope === "allow-only-trusted-domains" ? "radio-option-selected" : ""}`}
          >
            <input
              type="radio"
              checked={scope === "allow-only-trusted-domains"}
              onChange={() => setScope("allow-only-trusted-domains")}
            />
            <div>
              <strong>Allow only trusted domains</strong>
              <p>Sharing is blocked everywhere except the specific outside domains you list.</p>
            </div>
          </label>
        </div>

        {scope === "allow-only-trusted-domains" && (
          <>
            <label className="field-label" htmlFor="domains">
              Trusted domains (comma-separated)
            </label>
            <input
              id="domains"
              type="text"
              value={domainsText}
              onChange={(e) => setDomainsText(e.target.value)}
              placeholder="partnerdistrict.k12.va.us, vendor.com"
            />
          </>
        )}

        <label className="field-label" htmlFor="trust-description">
          3. Notes (optional, for your own records)
        </label>
        <textarea
          id="trust-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Requested by IT security review, ticket #5678"
        />

        <button className="primary-button" disabled={submitting} onClick={handleSubmit}>
          {submitting ? "Working..." : "Prepare rule"}
        </button>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      {result?.outcome === "manual-required" && result.manual && <DeepLinkCard manual={result.manual} />}
    </div>
  );
}
