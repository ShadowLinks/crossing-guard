import { Router } from "express";
import { config } from "../config";
import { requireAdmin } from "../auth/session";
import { getAuthedClient } from "../auth/getClient";
import { buildGmailComplianceManualSteps, buildTrustRuleManualSteps, ADMIN_CONSOLE_LINKS } from "../services/ruleBuilder";
import { appendAuditRecord, listAuditRecords } from "../services/auditStore";
import { getOrgUnitByPath } from "../services/directoryService";
import { createLiveGmailDlpRule, LiveDlpApiError } from "../services/policyService";
import type { GmailRuleRequest, TrustRuleRequest } from "../types";

export const rulesRouter = Router();

rulesRouter.get("/", requireAdmin, (_req, res) => {
  res.json(listAuditRecords());
});

rulesRouter.post("/gmail-compliance", requireAdmin, async (req, res) => {
  const user = req.session.user!;
  const body = req.body as GmailRuleRequest;

  if (!body?.orgUnitPath || !body?.direction) {
    return res.status(400).json({ error: "invalid_request", message: "orgUnitPath and direction are required." });
  }

  const manual = buildGmailComplianceManualSteps(body);

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
    const result = await createLiveGmailDlpRule(client, body, orgUnit.orgUnitId);

    const detail = result.pending
      ? `Google accepted the rule (${result.policyName}) but hadn't finished creating it yet as of this response - check Admin console > Security > Data protection > Rules in a minute to confirm it's Active.`
      : `Created live Gmail DLP rule ${result.policyName}. Confirm the direction and action match what you expected under Admin console > Security > Data protection > Rules before relying on it.`;

    const record = appendAuditRecord({
      kind: "gmail-compliance",
      createdBy: user.email,
      orgUnitPath: body.orgUnitPath,
      summary: manual.summary,
      outcome: "created-live",
      detail,
      consoleDeepLink: ADMIN_CONSOLE_LINKS.rulesPage
    });

    return res.json({ outcome: "created-live", manual, record, policyName: result.policyName });
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
