import { Router } from "express";
import { config } from "../config";
import { requireAdmin } from "../auth/session";
import { getAuthedClient } from "../auth/getClient";
import { buildGmailComplianceManualSteps, buildTrustRuleManualSteps, ADMIN_CONSOLE_LINKS } from "../services/ruleBuilder";
import { appendAuditRecord, listAuditRecords, getAuditRecord, updateAuditRecord } from "../services/auditStore";
import { getOrgUnitByPath } from "../services/directoryService";
import { createLiveGmailDlpRule, deleteLivePolicies, LiveDlpApiError } from "../services/policyService";
import { isLikelyEmailAddress } from "../services/emailUtil";
import type { GmailRuleRequest, TrustRuleRequest } from "../types";

export const rulesRouter = Router();

rulesRouter.get("/", requireAdmin, (_req, res) => {
  res.json(listAuditRecords());
});

rulesRouter.post("/gmail-compliance", requireAdmin, async (req, res) => {
  const user = req.session.user!;
  const body = req.body as GmailRuleRequest;

  const fromAddress = body?.fromAddress?.trim() || undefined;
  const toAddress = body?.toAddress?.trim() || undefined;

  if (!body?.orgUnitPath) {
    return res.status(400).json({ error: "invalid_request", message: "orgUnitPath is required." });
  }
  if (!fromAddress && !toAddress) {
    return res.status(400).json({
      error: "invalid_request",
      message: "Enter at least one of a sender or recipient address."
    });
  }
  if ((fromAddress && !isLikelyEmailAddress(fromAddress)) || (toAddress && !isLikelyEmailAddress(toAddress))) {
    return res.status(400).json({ error: "invalid_request", message: "Addresses must look like a real email address." });
  }

  const manual = buildGmailComplianceManualSteps({ ...body, fromAddress, toAddress });

  // Off by default (ENABLE_LIVE_DLP_API) - see config.ts and NOTICE.md.
  // When off, or if the live call fails for any reason, this always falls
  // back to the guided manual/deep-link flow so the admin can still get
  // the rule created by hand.
  if (!config.enableLiveDlpApi) {
    const record = appendAuditRecord({
      kind: "gmail-compliance",
      createdBy: user.email,
      orgUnitPath: body.orgUnitPath,
      summary: manual.summary,
      outcome: "manual-required",
      consoleDeepLink: manual.consoleDeepLink
    });
    return res.json({ outcome: "manual-required", manual, record });
  }

  try {
    const client = getAuthedClient(user);
    const orgUnit = await getOrgUnitByPath(client, body.orgUnitPath);
    const result = await createLiveGmailDlpRule(client, fromAddress, toAddress, orgUnit.orgUnitId);

    const names = result.policyNames.join(", ");
    const detail = result.pending
      ? `Google accepted the rule (${names}) but hadn't finished creating it yet as of this response - check Admin console > Security > Data protection > Rules in a minute to confirm it's Active.`
      : `Created live Gmail DLP rule${result.policyNames.length > 1 ? "s" : ""} ${names}. Confirm the address(es) and direction match what you expected under Admin console > Security > Data protection > Rules before relying on it.`;

    const record = appendAuditRecord({
      kind: "gmail-compliance",
      createdBy: user.email,
      orgUnitPath: body.orgUnitPath,
      summary: manual.summary,
      outcome: "created-live",
      detail,
      consoleDeepLink: ADMIN_CONSOLE_LINKS.rulesPage,
      livePolicyNames: result.policyNames
    });

    return res.json({ outcome: "created-live", manual, record, policyNames: result.policyNames });
  } catch (err: any) {
    const message = err instanceof LiveDlpApiError ? err.message : "Unexpected error calling Google.";
    const detail = err instanceof LiveDlpApiError ? err.detail : err?.message;
    console.error("Live Gmail DLP rule creation failed, falling back to manual flow:", message, detail ?? err);

    const record = appendAuditRecord({
      kind: "gmail-compliance",
      createdBy: user.email,
      orgUnitPath: body.orgUnitPath,
      summary: manual.summary,
      outcome: "manual-required",
      detail: `Live rule creation failed (${message}${detail ? " " + detail : ""}) - falling back to the guided manual steps below.`,
      consoleDeepLink: manual.consoleDeepLink
    });

    return res.json({
      outcome: "manual-required",
      manual,
      record,
      warning: `Automatic creation failed, so this still needs the manual steps below. Google said: ${message}${detail ? " " + detail : ""}`
    });
  }
});

rulesRouter.post("/drive-trust", requireAdmin, (req, res) => {
  const user = req.session.user!;
  const body = req.body as TrustRuleRequest;

  if (!body?.orgUnitPath || !body?.scope) {
    return res.status(400).json({ error: "invalid_request", message: "orgUnitPath and scope are required." });
  }
  if (body.scope === "allow-only-trusted-domains" && (!body.trustedDomains || body.trustedDomains.length === 0)) {
    return res.status(400).json({
      error: "invalid_request",
      message: "trustedDomains must include at least one domain for the allow-only-trusted-domains scope."
    });
  }

  // Trust rules have no write API at all today (from Google or any known
  // third party) - this is always the guided manual flow, never a live call.
  const manual = buildTrustRuleManualSteps(body);
  const record = appendAuditRecord({
    kind: "drive-trust",
    createdBy: user.email,
    orgUnitPath: body.orgUnitPath,
    summary: manual.summary,
    outcome: "manual-required",
    consoleDeepLink: manual.consoleDeepLink
  });

  res.json({ outcome: "manual-required", manual, record });
});

// Deletes the real Google policy/policies behind a "created-live" audit
// record. Records with no live policy (manual-only rules, or Drive trust
// rules, which have no write API at all) have nothing to delete here -
// those still have to be undone by hand in the Admin console, same as
// creating them.
rulesRouter.delete("/:id", requireAdmin, async (req, res) => {
  const user = req.session.user!;
  const record = getAuditRecord(req.params.id);

  if (!record) {
    return res.status(404).json({ error: "not_found", message: "No rule with that ID." });
  }
  if (!record.livePolicyNames || record.livePolicyNames.length === 0) {
    return res.status(400).json({
      error: "no_live_policy",
      message: "This rule has no live Google policy attached (it was manual-only), so there's nothing for this app to delete. Remove it directly in the Admin console if needed."
    });
  }
  if (record.deletedAt) {
    return res.status(400).json({ error: "already_deleted", message: `Already deleted on ${record.deletedAt}.` });
  }

  try {
    const client = getAuthedClient(user);
    const result = await deleteLivePolicies(client, record.livePolicyNames);

    if (result.failed.length > 0) {
      const failedDetail = result.failed.map((f) => `${f.name}: ${f.message}`).join("; ");
      return res.status(502).json({
        error: "partial_delete_failure",
        message: `Deleted ${result.deleted.length} of ${record.livePolicyNames.length} - the rest failed: ${failedDetail}. Re-run delete to retry the rest, or remove them by hand in the Admin console.`,
        deleted: result.deleted,
        failed: result.failed
      });
    }

    const updated = updateAuditRecord(record.id, {
      deletedAt: new Date().toISOString(),
      deletedBy: user.email
    });

    return res.json({ record: updated });
  } catch (err: any) {
    console.error(`Failed to delete live policies for audit record ${record.id}:`, err);
    return res.status(502).json({
      error: "delete_failed",
      message: err?.message ?? "Unexpected error calling Google to delete this rule."
    });
  }
});
