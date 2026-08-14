import { useState } from "react";
import OrgUnitPicker from "../components/OrgUnitPicker";
import DeepLinkCard from "../components/DeepLinkCard";
import { api, RuleResult } from "../api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function GmailRuleWizard({ liveDlpEnabled }: { liveDlpEnabled: boolean }) {
  const [orgUnitPath, setOrgUnitPath] = useState("/");
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RuleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedFrom = fromAddress.trim();
  const trimmedTo = toAddress.trim();
  const hasAtLeastOneAddress = Boolean(trimmedFrom || trimmedTo);
  const addressesLookValid =
    (!trimmedFrom || EMAIL_RE.test(trimmedFrom)) && (!trimmedTo || EMAIL_RE.test(trimmedTo));
  const canSubmit = hasAtLeastOneAddress && addressesLookValid && !submitting;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.createGmailRule({
        orgUnitPath,
        fromAddress: trimmedFrom || undefined,
        toAddress: trimmedTo || undefined,
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
      <h1>Block Gmail content</h1>
      <p className="muted">
        Block mail between a specific sender and recipient. This does not delete or filter existing mail - it
        prevents new mail matching this address (or these addresses) from being delivered going forward.
      </p>

      {!liveDlpEnabled && (
        <div className="banner banner-info">
          This will prepare the rule and give you a direct link to finish creating it in the Admin console with a
          couple of clicks. Automatic, end-to-end creation is built into this app but turned off until your admin
          has verified it against this tenant - see NOTICE.md.
        </div>
      )}

      <div className="card form-card">
        <label className="field-label" htmlFor="fromAddress">
          1. Block mail from this address (optional)
        </label>
        <input
          id="fromAddress"
          type="email"
          value={fromAddress}
          onChange={(e) => setFromAddress(e.target.value)}
          placeholder="e.g. student@yourdistrict.example.org"
        />

        <label className="field-label" htmlFor="toAddress">
          2. Block mail to this address (optional)
        </label>
        <input
          id="toAddress"
          type="email"
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
          placeholder="e.g. someone@example.com"
        />
        <p className="muted small">
          Fill in one address to block everything to or from it, or fill in both to block mail specifically between
          those two addresses. At least one is required.
        </p>
        {!addressesLookValid && (
          <p className="banner banner-error">One of the addresses above doesn't look like a real email address.</p>
        )}

        <label className="field-label">3. Org unit (which mailboxes to check)</label>
        <p className="muted small">
          Google requires every rule to be scoped to an org unit - pick the one the address(es) above belong to, or
          the top of the tree if you're not sure.
        </p>
        <OrgUnitPicker value={orgUnitPath} onChange={setOrgUnitPath} />

        <label className="field-label" htmlFor="description">
          4. Notes (optional, for your own records)
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Requested by principal Smith, ticket #1234"
        />

        <button className="primary-button" disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? "Working..." : "Create rule"}
        </button>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      {result?.outcome === "created-live" && (
        <div className="banner banner-success">
          Rule created automatically ({result.policyNames?.length ?? 0} Google rule
          {result.policyNames && result.policyNames.length !== 1 ? "s" : ""}: {result.policyNames?.join(", ")}).
          Double-check it under Admin console &rarr; Security &rarr; Data protection &rarr; Rules.
        </div>
      )}

      {result?.warning && <div className="banner banner-error">{result.warning}</div>}

      {result?.outcome === "manual-required" && result.manual && <DeepLinkCard manual={result.manual} />}
    </div>
  );
}
