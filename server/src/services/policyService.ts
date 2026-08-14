import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { config } from "../config";
import type { GmailRuleRequest, MailDirection } from "../types";

/**
 * Live Gmail DLP rule creation via the Cloud Identity Policy API
 * (`cloudidentity.googleapis.com`, `policies.create`).
 *
 * WHERE THIS SCHEMA CAME FROM: Google's own how-to guide confirmed the
 * envelope (`customer`, `policyQuery.orgUnit` as a string, `setting.type`).
 * The part that matters most here - how to make the rule actually BLOCK
 * mail, and how to scope that to internal/external - was not published
 * anywhere. It was confirmed on 2026-08-14 by reading back a real rule
 * (a manually-created "test" rule with a block action) from this district's
 * own tenant via `GET .../v1beta1/policies/{id}`, which returned:
 *
 *   "action": {
 *     "gmailAction": {
 *       "blockContent": {
 *         "actionParams": {
 *           "applyInternalMessages": true,
 *           "applyExternalMessages": true
 *         }
 *       }
 *     }
 *   }
 *
 * That's a real, confirmed shape - not a guess. `applyInternalMessages` /
 * `applyExternalMessages` are independent booleans, combined with the
 * trigger (send vs. receive) to express a direction:
 *   - internal -> internal : trigger = send,    apply internal only
 *   - internal -> external : trigger = send,    apply external only
 *   - external -> internal : trigger = receive, apply external only
 *
 * ONE PIECE IS STILL A BEST-EFFORT GUESS: `condition.contentCondition`.
 * The real example we read back used a content match
 * (`all_headers.contains('testemail@gmail.com')`) because that test rule
 * was about a specific address, not a direction. This app isn't doing
 * content matching at all - it wants "block every message this
 * trigger/orgUnit/action combination already selects" - so it sends the
 * CEL literal `"true"` as a permissive, no-additional-filter condition.
 * This is a syntactically-reasonable guess, and importantly a SAFE one:
 * if Google rejects unfamiliar CEL, it fails loudly with a 400 (caught
 * below and turned into a fallback to the manual flow) rather than
 * silently creating a broader rule than intended - the condition can only
 * narrow what the action+trigger+orgUnit already scope, never widen it.
 *
 * Also confirmed while investigating this: OAuth Playground's discovery
 * panel shows the same `policies.*` methods exist under the GA `v1` path,
 * not just `v1beta1`. This app calls `v1`.
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
            condition: {
              contentCondition: "true"
            },
            action: {
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
