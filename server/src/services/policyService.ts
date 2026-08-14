import { OAuth2Client } from "google-auth-library";
import { config } from "../config";
import type { GmailRuleRequest } from "../types";

/**
 * EXPERIMENTAL / BETA - read this before flipping ENABLE_LIVE_DLP_API=true.
 *
 * Google's classic Gmail "Content compliance" rules have no write API at
 * all (confirmed against Google's own settings reference - those settings
 * are marked read-only). The one real write path Google has opened up is
 * the Cloud Identity Policy API's mutate endpoints for DLP (Data Loss
 * Prevention) rules, which shipped in June 2026 and is very new.
 *
 * CONFIRMED against Google's own how-to guide
 * (https://cloud.google.com/identity/docs/how-to/create-patch-delete-policies)
 * and settings reference as of this writing:
 *   - Policy needs a top-level `customer: "customers/<id>"` field (this app's
 *     first attempt omitted it entirely).
 *   - `policyQuery.orgUnit` is a STRING in the form `"orgUnits/<orgUnitId>"`,
 *     not a nested object (this app's first attempt sent `{ orgUnitId }`,
 *     which is what produced the "Starting an object on a scalar field"
 *     error - fixed below).
 *   - The setting type for this feature is `settings/rule.dlp` (a single
 *     type shared across Gmail/Drive/Chat/Chrome, not a Gmail-specific
 *     type - this app's first attempt guessed `settings/gmail.dlp_rules`,
 *     which doesn't exist).
 *   - The setting value's shape is `{ displayName, description, triggers:
 *     string[], condition: { contentCondition: "<CEL expression>" }, action,
 *     state: "ACTIVE" | "INACTIVE" }` - a single object, not an array
 *     wrapped in a `dlpRules` key like this app's first attempt had.
 *   - Confirmed Gmail trigger strings: `google.workspace.gmail.email.v1.send`
 *     and `google.workspace.gmail.email.v1.receive`.
 *
 * STILL UNCONFIRMED, and why the live path stops short of actually sending
 * a request for now:
 *   - Every published example of the `condition` field (Google has only
 *     published a Drive one) uses a DLP content-detector match, e.g.
 *     `all_content.matches_dlp_detector('US_SOCIAL_SECURITY_NUMBER', ...)`.
 *     There is no published syntax for a sender/recipient-domain condition
 *     (i.e. "recipient is outside the organization"), which is exactly what
 *     distinguishing internal-internal / internal-external / external-internal
 *     requires. The `send` and `receive` triggers alone can't do this split
 *     either - `send` fires for every message an internal user sends,
 *     external recipient or not.
 *   - There's no published `gmailAction` schema (Google's only example is
 *     `driveAction: { warnUser: {} }` for Drive).
 *
 * Guessing here is not like guessing the envelope fields above: an envelope
 * guess either matches or Google's API rejects it with a clear 400 (safe -
 * nothing gets created). A guessed *condition* that happens to be
 * syntactically valid CEL (e.g. the literal `true`) could be silently
 * ACCEPTED by Google while not actually meaning "only when the recipient is
 * external" - it would just match every message on that trigger. For a
 * school district compliance tool, that's a real failure mode: selecting
 * "internal to external" could silently create a rule that blocks ALL mail
 * sent by that OU, internal included. That's worse than the API call simply
 * failing, so this function refuses to send a request until that's verified
 * against real Google behavior, rather than risk creating an over-broad
 * live rule that looks like it worked.
 *
 * How to actually finish this: open Admin console -> Security -> Data
 * protection -> Rules -> Add rule -> Gmail, build one rule by hand with a
 * sender/recipient-domain condition, and capture the network request the
 * Admin console UI itself sends (browser DevTools -> Network tab, filter
 * for `cloudidentity` or `policies`). That gives the real `condition`/
 * `action` JSON Google's own frontend uses, which can then replace the
 * TODOs below. Until then, leave ENABLE_LIVE_DLP_API=false - the guided
 * manual/deep-link flow is precise today and doesn't depend on any of this.
 */

// Reserved for reuse once the `condition`/`action` schema below is confirmed
// and the real POST call is restored in createLiveGmailDlpRule().
const POLICIES_ENDPOINT = "https://cloudidentity.googleapis.com/v1beta1/policies";

export class LiveDlpApiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "LiveDlpApiError";
  }
}

const DIRECTION_META: Record<GmailRuleRequest["direction"], { label: string; triggerEvent: string }> = {
  "internal-internal": { label: "Internal to internal", triggerEvent: "google.workspace.gmail.email.v1.send" },
  "internal-external": { label: "Internal to external", triggerEvent: "google.workspace.gmail.email.v1.send" },
  "external-internal": { label: "External to internal", triggerEvent: "google.workspace.gmail.email.v1.receive" }
};

export async function createLiveGmailDlpRule(
  oauth2Client: OAuth2Client,
  orgUnitId: string,
  req: GmailRuleRequest
): Promise<{ policyName: string }> {
  if (!config.enableLiveDlpApi) {
    throw new LiveDlpApiError("Live DLP API creation is disabled (ENABLE_LIVE_DLP_API=false).");
  }

  const { label: directionLabel, triggerEvent } = DIRECTION_META[req.direction];

  // See the big comment above: the envelope fields below (customer,
  // policyQuery.orgUnit, setting.type, triggers, state) are confirmed
  // against Google's own documentation. `condition` and `action` are the
  // two fields with no confirmed schema for Gmail - rather than guess a
  // condition that could be silently accepted while meaning something
  // different than "block this specific direction," this function throws
  // before constructing or sending that part of the request.
  throw new LiveDlpApiError(
    `Not sending the live request for "${directionLabel}" (OU ${req.orgUnitPath}, trigger ${triggerEvent}): ` +
      "Google hasn't published how to express a sender/recipient-domain condition or a Gmail block action for " +
      "this endpoint, and guessing one risks creating a rule that's broader than intended (e.g. blocking ALL " +
      "mail on this trigger instead of just this direction) rather than just failing safely. See the comment at " +
      "the top of server/src/services/policyService.ts for exactly what's confirmed vs. still needed, and how " +
      "to capture the real schema from the Admin console's own network requests. Falling back to the guided " +
      "manual steps below, which are accurate today."
  );
}

/**
 * Reserved for reuse once the real POST call is restored (see the
 * module-level comment). Pulls the actual status/message Google sent back
 * out of a failed Gaxios request, instead of a generic "it failed" string -
 * Google's error body on a 400/403/404 here almost always says exactly
 * what's wrong (bad field name, missing privilege, wrong URL), which is how
 * the `customer`/`orgUnit`/`setting.type` bugs above got found and fixed.
 */
function describeGoogleApiError(err: unknown): string {
  const anyErr = err as any;
  const status = anyErr?.response?.status ?? anyErr?.code;
  const googleMessage =
    anyErr?.response?.data?.error?.message ??
    anyErr?.response?.data?.error ??
    anyErr?.response?.statusText ??
    anyErr?.message ??
    "no further detail returned";

  const hint =
    status === 403
      ? " (403 usually means the signed-in admin's role doesn't have the Cloud Identity policy management " +
        "privilege, or the Cloud Identity API hasn't been enabled in your Google Cloud project - see README.md.)"
      : status === 400
        ? " (400 usually means the request body's field names/values don't match what Google currently expects - " +
          "this endpoint is new and its schema in this file, server/src/services/policyService.ts, is a best-effort " +
          "guess that needs correcting against Google's live reference.)"
        : status === 404
          ? " (404 usually means the endpoint URL or API version in this file is wrong or has moved.)"
          : "";

  return `Google rejected the live DLP rule request${status ? ` (HTTP ${status})` : ""}: ${googleMessage}.${hint} ` +
    "Falling back to the guided manual steps below.";
}
