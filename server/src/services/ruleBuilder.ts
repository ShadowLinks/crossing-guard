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

// Suggests a short, identifiable name for the throwaway group the trust
// rule workaround needs, derived from the local part of the sender's
// address (e.g. "jsmith@k12louisa.org" -> "block-share-jsmith").
function suggestGroupName(address: string): string {
  const local =
    address
      .split("@")[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sender";
  return `block-share-${local}`;
}

// One direction of the workaround: Drive trust rules can only scope their
// "Scope" (sender) side to an org unit or a group - never a single named
// individual - but the "Condition" (target) side CAN name one specific
// person. So blocking a specific sender -> specific recipient pair means
// putting the sender alone in a throwaway group, then writing a rule that
// targets the recipient by name by name and blocks it.
function oneWayTrustRuleSteps(sender: string, recipient: string): string[] {
  const groupName = suggestGroupName(sender);
  return [
    `Create a Google Group containing only "${sender}" as a member (Admin console > Directory > Groups > Create group). Name it something identifiable, e.g. "${groupName}" - this group exists purely so the trust rule below has something to scope to, since a trust rule's "Scope" side can only be an org unit or a group, never a single named individual.`,
    `Open the Rules page (link below), click "Create rule", and choose "Trust" as the rule type.`,
    `Under Scope, choose "Groups" and select the group you just created (containing only "${sender}").`,
    `Under Condition, choose "User" and enter "${recipient}" exactly - this is the side of a trust rule that CAN target one specific individual.`,
    `Set the action to "Block".`,
    `Name the rule clearly, e.g. "Block Drive sharing: ${sender} -> ${recipient}", then save it.`
  ];
}

export function buildTrustRuleManualSteps(req: TrustRuleRequest): ManualSteps {
  const from = req.fromAddress.trim();
  const to = req.toAddress.trim();

  const steps: string[] = [...oneWayTrustRuleSteps(from, to)];

  if (req.bothDirections) {
    steps.push(
      `To also block the reverse direction (so "${to}" can't share back to "${from}" either), repeat the same process once more, swapping the two addresses:`
    );
    steps.push(...oneWayTrustRuleSteps(to, from));
  }

  steps.push(
    'Trust rules can take up to a few hours to fully propagate - Admin console will show each rule as "Active" once it has.'
  );
  steps.push(
    "There is no Google API for trust rules (read or write), so this app can't list, verify, or delete them for you afterward - manage them directly under Admin console > Rules going forward."
  );
  steps.push(req.description ? `Note for your records: ${req.description}` : "Note for your records: none provided.");

  return {
    consoleDeepLink: ADMIN_CONSOLE_LINKS.rulesPage,
    summary: `Block Drive sharing from "${from}" to "${to}"${
      req.bothDirections ? " (both directions)" : ""
    }, via a Google Group + trust rule workaround (Admin console only - no API exists for trust rules).`,
    steps
  };
}
