import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { config } from "../config";
import type { GmailRuleRequest, MailDirection } from "../types";

/**
 * Live Gmail DLP rule creation via the Cloud Identity Policy API
 * (`cloudidentity.googleapis.com`, `policies.create`, `v1`).
 *
 * EVERY FIELD BELOW IS CONFIRMED, NOT GUESSED. This was reverse-engineered
 * on 2026-08-14 by creating and reading back real test rules against this
 * district's own tenant via OAuth Playground (using the app's own
 * `cloud-identity.policies` scope), one field at a time:
 *
 *   - `customer` / `policyQuery.orgUnit` (string, `orgUnits/{id}`) /
 *     `setting.type` ("settings/rule.dlp") - from Google's public how-to
 *     guide, confirmed working.
 *   - `action.gmailAction.blockContent.actionParams.applyInternalMessages` /
 *     `applyExternalMessages` (independent booleans) - confirmed by reading
 *     back a real block rule created via the Admin console UI. Combined
 *     with the trigger (send vs. receive), these express a direction:
 *       internal -> internal : trigger = send,    apply internal only
 *       internal -> external : trigger = send,    apply external only
 *       external -> internal : trigger = receive, apply external only
 *   - `ruleTypeMetadata.dlpRuleMetadata.alertSeverity` and
 *     `action.alertCenterAction: {}` - REQUIRED, not optional console
 *     defaults as first assumed. Omitting them produces a generic
 *     `INVALID_ARGUMENT` with no field-level detail at all - confirmed by
 *     testing with and without them, all other fields held constant.
 *   - `condition.contentCondition` - this API rejects a tautological/empty
 *     condition outright (`"true"`, `all_headers.matches('.*')`, and
 *     `all_headers.contains('')` were all tried and rejected - the first
 *     two fail to parse as unrecognized syntax, the third parses but is
 *     rejected as an invalid empty match). It only accepts a genuine,
 *     non-empty content match. Since this app blocks by direction, not by
 *     content, it uses `all_headers.contains('@')` - every real email's
 *     headers include a From/To address, and every address contains `@`,
 *     so this matches virtually all real mail while still being the kind
 *     of real, non-empty condition the API requires. Confirmed working
 *     end-to-end (create + read-back) against this tenant.
 *
 * `policies.create` returns a long-running Operation, not the Policy
 * directly - in every real test here it came back with `done: true` and
 * the created Policy under `response` immediately (see the handling
 * below), which is why this treats immediate completion as the norm.
 *
 * OPERATIONAL NOTE, also confirmed by testing: this API has no built-in
 * duplicate protection. Sending the exact same create request twice
 * creates two separate, independently-active policies, not an error or a
 * no-op. The "Create rule" button already disables itself while a request
 * is in flight (see GmailRuleWizard.tsx), which covers an accidental
 * double-click, but there's still no server-side guard against a genuine
 * repeat submission (e.g. the admin re-clicking after a slow response, or
 * resubmitting the form later for a route that was already created). If
 * that turns out to matter in practice, check the audit log for a recent
 * identical request before calling this, rather than relying on Google to
 * reject it.
 */

const POLICY_API_VERSION = "v1";

interface DirectionMapping {
  trigger: string;
  applyInternalMessages: boolean;
  applyExternalMessages: boolean;
}

// Trigger strings per Google's public Cloud Identity Policy API guide.
const TRIGGER_SEND = "google.workspace.gmail.email.v1.send";
const TRIGGER_RECEIVE = "google.workspace.gmail.email.v1.receive";

const DIRECTION_TO_POLICY: Record<MailDirection, DirectionMapping> = {
  "internal-internal": {
    trigger: TRIGGER_SEND,
    applyInternalMessages: true,
    applyExternalMessages: false
  },
  "internal-external": {
    trigger: TRIGGER_SEND,
    applyInternalMessages: false,
    applyExternalMessages: true
  },
  "external-internal": {
    trigger: TRIGGER_RECEIVE,
    applyInternalMessages: false,
    applyExternalMessages: true
  }
};

export class LiveDlpApiError extends Error {
  detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = "LiveDlpApiError";
    this.detail = detail;
  }
}

function describeGoogleApiError(err: any): string | undefined {
  const status = err?.code ?? err?.response?.status;
  const message = err?.response?.data?.error?.message ?? err?.errors?.[0]?.message ?? err?.message;
  if (!message) return undefined;
  return status ? `Google API error ${status}: ${message}` : String(message);
}

export interface LiveDlpResult {
  policyName: string;
  pending: boolean;
}

export async function createLiveGmailDlpRule(
  oauth2Client: OAuth2Client,
  req: GmailRuleRequest,
  orgUnitId: string
): Promise<LiveDlpResult> {
  const mapping = DIRECTION_TO_POLICY[req.direction];
  const cloudidentity = google.cloudidentity({ version: POLICY_API_VERSION, auth: oauth2Client });

  const displayName = `Block ${req.direction} mail - ${req.orgUnitPath}`.slice(0, 100);

  let data;
  try {
    ({ data } = await cloudidentity.policies.create({
      requestBody: {
        customer: `customers/${config.googleCustomerId}`,
        policyQuery: {
          orgUnit: `orgUnits/${orgUnitId}`
        },
        setting: {
          type: "settings/rule.dlp",
          value: {
            displayName,
            state: "ACTIVE",
            triggers: [mapping.trigger],
            ruleTypeMetadata: {
              dlpRuleMetadata: {
                alertSeverity: "LOW"
              }
            },
            condition: {
              contentCondition: "all_headers.contains('@')"
            },
            action: {
              alertCenterAction: {},
              gmailAction: {
                blockContent: {
                  actionParams: {
                    applyInternalMessages: mapping.applyInternalMessages,
                    applyExternalMessages: mapping.applyExternalMessages
                  }
                }
              }
            }
          }
        }
      }
    }));
  } catch (err: any) {
    throw new LiveDlpApiError("Google rejected the live DLP rule request.", describeGoogleApiError(err));
  }

  // policies.create returns a long-running Operation, not the Policy
  // itself. In practice this API appears to complete synchronously
  // (done: true) for a simple rule like this, but there's no `operations`
  // resource exposed on this API to poll if it doesn't - so if it comes
  // back not-done, we say so honestly rather than pretending it's live.
  if (data.done && data.response?.name) {
    return { policyName: String(data.response.name), pending: false };
  }
  if (data.done === false) {
    return { policyName: String(data.name ?? "(pending)"), pending: true };
  }
  // Some responses may omit `done` on immediate success - treat a response
  // with no error and a name as a completed create.
  const name = data.response?.name ?? data.name;
  if (name) {
    return { policyName: String(name), pending: false };
  }
  throw new LiveDlpApiError("Google accepted the request but returned no policy or operation name.");
}
