import type { GmailRuleRequest, TrustRuleRequest } from "../types";

// Verified against Google's own help center articles (each has a "Go to
// Compliance" / "Go to Rules" link pointing at these exact URLs). Google
// does not support pre-scoping these pages to a specific OU via URL
// parameters, so the admin still has to pick the OU inside the console -
// the app tells them exactly which one, in plain language, right above
// the link.
export const ADMIN_CONSOLE_LINKS = {
  gmailCompliance: "https://admin.google.com/ac/apps/gmail/compliance",
  rulesPage: "https://admin.google.com/ac/ax"
};

export interface ManualSteps {
  consoleDeepLink: string;
  summary: string;
  steps: string[];
}

export function buildGmailComplianceManualSteps(req: GmailRuleRequest): ManualSteps {
  const from = req.fromAddress?.trim();
  const to = req.toAddress?.trim();

  const addressText = from && to ? `"${from}" to "${to}"` : from ? `"${from}" to anyone` : `anyone to "${to}"`;

  const envelopeSteps: string[] = [];
  if (from) {
    envelopeSteps.push(`add an "Envelope filter" (or "Metadata match" > Sender) condition matching exactly: ${from}`);
  }
  if (to) {
    envelopeSteps.push(`add an "Envelope filter" (or "Metadata match" > Recipient) condition matching exactly: ${to}`);
  }

  // "Email messages to affect" needs to cover every direction the given
  // address(es) could travel in, since the classic Content compliance UI
  // (unlike the live DLP path) applies one rule to one direction setting
  // at a time - if only one address is given, both directions may be
  // relevant, so the admin may need two rules (noted below).
  const messagesToAffect =
    from && to
      ? "Inbound, Outbound, and Internal - receiving (whichever matches how these two addresses relate to your domain - Admin console will only show the options that make sense once you've set the sender/recipient conditions above)"
      : "Inbound, Outbound, and/or Internal - receiving as needed - you may need to save this as two rules (one for internal-to-internal traffic, one for traffic crossing your domain boundary) since a single Content compliance rule only covers one of Admin console's message-direction options at a time";

  return {
    consoleDeepLink: ADMIN_CONSOLE_LINKS.gmailCompliance,
    summary: `Block mail from ${addressText}, scoped to org unit "${req.orgUnitPath}".`,
    steps: [
      `Open the Compliance page (link below) and select the org unit "${req.orgUnitPath}" in the left-hand OU tree.`,
      `Click "Add another rule" under "Content compliance" and give it a clear name, e.g. "Block ${addressText}".`,
      `Under Email messages to affect, choose: ${messagesToAffect}.`,
      `Under Add expressions, ${envelopeSteps.join(", and ")}.`,
      'Under "If the above expressions match, do the following", choose "Reject message" (or "Modify message" > quarantine, if you prefer a review queue instead of an outright block).',
      "Save the rule, then use Admin console's built-in rule tester (top of the Compliance page) to confirm it fires only on the traffic you intended before it goes live.",
      req.description ? `Note for your records: ${req.description}` : "Note for your records: none provided."
    ]
  };
}

export function buildTrustRuleManualSteps(req: TrustRuleRequest): ManualSteps {
  const scopeText =
    req.scope === "block-all-external"
      ? "Block sharing Drive files outside the organization entirely"
      : `Allow sharing only with these trusted domains: ${(req.trustedDomains ?? []).join(", ") || "(none listed)"}`;

  const steps = [
    `Open the Rules page (link below), click "Create rule", and choose "Trust" as the rule type.`,
    `Set the scope to the org unit "${req.orgUnitPath}".`,
    req.scope === "block-all-external"
      ? 'Under conditions, choose "File owner\'s organization" and set the action to "Restrict access" / "Deny" for any target outside your domain.'
      : `Under conditions, add each trusted domain (${(req.trustedDomains ?? []).join(", ") || "none listed - add at least one before saving"}) and set the action to "Allow"; leave the default action for all other domains as "Deny".`,
    "Name the rule clearly, e.g. \"Trust rule - " + req.orgUnitPath + "\", then save it.",
    "Trust rules can take up to a few hours to fully propagate - Google's console will show the rule as \"Active\" once it has.",
    req.description ? `Note for your records: ${req.description}` : "Note for your records: none provided."
  ];

  return {
    consoleDeepLink: ADMIN_CONSOLE_LINKS.rulesPage,
    summary: `${scopeText}, scoped to org unit "${req.orgUnitPath}".`,
    steps
  };
}
