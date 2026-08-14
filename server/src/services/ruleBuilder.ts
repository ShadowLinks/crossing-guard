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
  const directionText =
    req.direction === "internal-internal"
      ? "email sent from one internal address to another internal address"
      : "email sent from an internal address to an external (outside your domain) address";

  const envelopeHint =
    req.direction === "internal-internal"
      ? "Set both the sender and recipient conditions to \"Internal\"."
      : "Set the sender condition to \"Internal\" and the recipient condition to \"Not Internal\" (External).";

  return {
    consoleDeepLink: ADMIN_CONSOLE_LINKS.gmailCompliance,
    summary: `Block ${directionText}, scoped to org unit "${req.orgUnitPath}".`,
    steps: [
      `Open the Compliance page (link below) and select the org unit "${req.orgUnitPath}" in the left-hand OU tree.`,
      'Click "Add another rule" under "Content compliance" and give it a clear name, e.g. ' +
        `"Block ${req.direction === "internal-internal" ? "internal-to-internal" : "internal-to-external"} mail - ${req.orgUnitPath}".`,
      "Under Email messages to affect, choose Inbound, Outbound and Internal - receiving so both legs of internal mail are covered.",
      `Under Add expressions, add an "Envelope filter" (or "Metadata match" > Sender/Recipient) condition. ${envelopeHint}`,
      "Under Add expressions, add a Content match if you only want to block specific words/patterns, or leave it unset to match all mail on that route.",
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
