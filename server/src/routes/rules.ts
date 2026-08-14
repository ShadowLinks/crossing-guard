import { Router } from "express";
import { requireAdmin } from "../auth/session";
import { getAuthedClient } from "../auth/getClient";
import { getOrgUnitTree } from "../services/directoryService";
import { buildGmailComplianceManualSteps, buildTrustRuleManualSteps } from "../services/ruleBuilder";
import { createLiveGmailDlpRule, LiveDlpApiError } from "../services/policyService";
import { appendAuditRecord, listAuditRecords } from "../services/auditStore";
import { config } from "../config";
import type { GmailRuleRequest, OrgUnitNode, TrustRuleRequest } from "../types";

export const rulesRouter = Router();

function findOrgUnit(root: OrgUnitNode, orgUnitPath: string): OrgUnitNode | undefined {
  if (root.orgUnitPath === orgUnitPath) return root;
  for (const child of root.children) {
    const found = findOrgUnit(child, orgUnitPath);
    if (found) return found;
  }
  return undefined;
}

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
    const tree = await getOrgUnitTree(client);
    const ou = findOrgUnit(tree, body.orgUnitPath);
    if (!ou) {
      return res.status(404).json({ error: "orgunit_not_found" });
    }

    const result = await createLiveGmailDlpRule(client, ou.orgUnitId, body);
    const record = appendAuditRecord({
      kind: "gmail-compliance",
      createdBy: user.email,
      orgUnitPath: body.orgUnitPath,
      summary: manual.summary,
      outcome: "created-live",
      detail: `Created via live DLP API as ${result.policyName}. Verify it in Admin console under Security > Data protection > Rules.`
    });
    return res.json({ outcome: "created-live", policyName: result.policyName, record });
  } catch (err) {
    const message =
      err instanceof LiveDlpApiError
        ? err.message
        : "Unexpected error calling the live DLP API.";
    const record = appendAuditRecord({
      kind: "gmail-compliance",
      createdBy: user.email,
      orgUnitPath: body.orgUnitPath,
      summary: manual.summary,
      outcome: "failed",
      detail: message,
      consoleDeepLink: manual.consoleDeepLink
    });
    console.error("Live DLP rule creation failed, returning manual fallback", err);
    return res.json({ outcome: "manual-required", manual, record, warning: message });
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
