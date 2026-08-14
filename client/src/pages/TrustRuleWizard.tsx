import { useState } from "react";
import DeepLinkCard from "../components/DeepLinkCard";
import { api, RuleResult } from "../api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TrustRuleWizard() {
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [bothDirections, setBothDirections] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RuleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedFrom = fromAddress.trim();
  const trimmedTo = toAddress.trim();
  const bothProvided = Boolean(trimmedFrom) && Boolean(trimmedTo);
  const addressesLookValid = !bothProvided || (EMAIL_RE.test(trimmedFrom) && EMAIL_RE.test(trimmedTo));
  const canSubmit = bothProvided && addressesLookValid && !submitting;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.createTrustRule({
        fromAddress: trimmedFrom,
        toAddress: trimmedTo,
        bothDirections,
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
        Block one specific person from sharing Drive files with another specific person. Google's trust rules can't
        target two individuals directly, so this walks you through the standard workaround: a small Google Group
        containing just the sender, plus a trust rule that blocks sharing to the recipient. There is no Google API
        for trust rules at all (not even to read them), so this is always a guided manual flow - it prepares every
        value and gives you a direct link to finish with a few clicks in the Admin console.
      </p>

      <div className="card form-card">
        <label className="field-label" htmlFor="fromAddress">
          1. Restrict sharing from this person
        </label>
        <input
          id="fromAddress"
          type="email"
          value={fromAddress}
          onChange={(e) => setFromAddress(e.target.value)}
          placeholder="e.g. student@yourdistrict.example.org"
        />

        <label className="field-label" htmlFor="toAddress">
          2. Block sharing specifically to this person
        </label>
        <input
          id="toAddress"
          type="email"
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
          placeholder="e.g. someone@yourdistrict.example.org"
        />
        <p className="muted small">Both addresses are required - this rule only ever targets this one specific pair.</p>
        {!addressesLookValid && (
          <p className="banner banner-error">One of the addresses above doesn't look like a real email address.</p>
        )}

        <label className="field-label">
          <input
            type="checkbox"
            checked={bothDirections}
            onChange={(e) => setBothDirections(e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Also block the reverse direction (so neither can share with the other)
        </label>

        <label className="field-label" htmlFor="trust-description">
          3. Notes (optional, for your own records)
        </label>
        <textarea
          id="trust-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Requested by IT security review, ticket #5678"
        />

        <button className="primary-button" disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? "Working..." : "Prepare rule"}
        </button>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      {result?.outcome === "manual-required" && result.manual && <DeepLinkCard manual={result.manual} />}
    </div>
  );
}
