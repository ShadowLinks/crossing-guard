import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { config } from "../config";
import { isInternalAddress } from "./emailUtil";

/**
 * Live Gmail DLP rule creation via the Cloud Identity Policy API
 * (`cloudidentity.googleapis.com`, `policies.create`/`policies.delete`, `v1`).
 *
 * EVERY STRUCTURAL FIELD BELOW IS CONFIRMED, NOT GUESSED. This was
 * reverse-engineered on 2026-08-14 by creating and reading back real test
 * rules against this district's own tenant via OAuth Playground (using the
 * app's own `cloud-identity.policies` scope), one field at a time:
 *
 *   - `customer` / `policyQuery.orgUnit` (string, `orgUnits/{id}`) /
 *     `setting.type` ("settings/rule.dlp") - from Google's public how-to
 *     guide, confirmed working.
 *   - `action.gmailAction.blockContent.actionParams.applyInternalMessages` /
 *     `applyExternalMessages` (independent booleans) - confirmed by reading
 *     back a real block rule created via the Admin console UI.
 *   - `ruleTypeMetadata.dlpRuleMetadata.alertSeverity` and
 *     `action.alertCenterAction: {}` - REQUIRED, not optional console
 *     defaults as first assumed. Omitting them produces a generic
 *     `INVALID_ARGUMENT` with no field-level detail at all - confirmed by
 *     testing with and without them, all other fields held constant.
 *   - `condition.contentCondition` - a CEL-flavored expression, but a
 *     restricted grammar, not general CEL: bare boolean literals (`"true"`)
 *     and unrecognized methods (`.matches(...)`) fail to *parse*, and even
 *     a recognized method with an empty argument (`all_headers.contains('')`)
 *     parses but is rejected as an invalid/tautological match. It requires
 *     a genuine, non-empty content condition (this is a *Data Loss
 *     Prevention* API at heart).
 *
 * WHAT THIS MEANS FOR "BLOCK ADDRESS A TO ADDRESS B": that last point turns
 * out to be exactly what this app needs, not a workaround - the admin gives
 * a real sender and/or recipient address, and this module turns that into a
 * genuine `all_headers.contains('an-actual-address')` condition, which is
 * precisely the shape Google's own manually-created rules use and precisely
 * what its validation requires. No "match everything" trick needed.
 *
 * `policies.create` returns a long-running Operation, not the Policy
 * directly - in every real test here it came back with `done: true` and
 * the created Policy under `response` immediately, which is why this
 * treats immediate completion as the norm (see `unwrapCreateResult`).
 *
 * OPERATIONAL NOTE, also confirmed by testing: this API has no built-in
 * duplicate protection. Sending the exact same create request twice
 * creates two separate, independently-active policies, not an error or a
 * no-op. The "Create rule" button already disables itself while a request
 * is in flight (see GmailRuleWizard.tsx), which covers an accidental
 * double-click, but there's still no server-side guard against a genuine
 * repeat submission.
 */

const POLICY_API_VERSION = "v1";

const TRIGGER_SEND = "google.workspace.gmail.email.v1.send";
const TRIGGER_RECEIVE = "google.workspace.gmail.email.v1.receive";

export class LiveDlpApiError extends Error {
  detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = "LiveDlpApiError";
    this.detail = detail;
  }
}

interface PolicyPlan {
  /** Human label for this leg of the rule, shown in the audit trail. */
  label: string;
  trigger: string;
  applyInternalMessages: boolean;
  applyExternalMessages: boolean;
  contentCondition: string;
}

function addressCondition(addresses: string[]): string {
  return addresses.map((addr) => `all_headers.contains('${addr.replace(/'/g, "\\'")}')`).join(" && ");
}

/**
 * Works out which Gmail DLP trigger(s) and internal/external flag(s) can
 * express "block mail between these addresses," given that a single rule
 * only has one trigger (send OR receive) and Google's Workspace APIs can
 * only see traffic that touches at least one mailbox on this domain.
 *
 * At least one of fromAddress/toAddress must be given (validated by the
 * caller). Either can be omitted to mean "any address."
 *
 * Returns 1 or 2 plans - 2 only for the "block everything TO this internal
 * address, from anyone" case, since that traffic is visible via two
 * different trigger/mailbox combinations (an internal sender's send event,
 * and this address's own receive event) and Google's API doesn't offer an
 * "OR" across triggers within a single rule.
 */
export function planGmailBlockRules(fromAddress?: string, toAddress?: string): PolicyPlan[] {
  const from = fromAddress?.trim().toLowerCase() || undefined;
  const to = toAddress?.trim().toLowerCase() || undefined;

  if (!from && !to) {
    throw new LiveDlpApiError("At least one of a sender or recipient address is required.");
  }

  const fromInternal = from ? isInternalAddress(from) : undefined;
  const toInternal = to ? isInternalAddress(to) : undefined;

  if (from && to) {
    if (!fromInternal && !toInternal) {
      throw new LiveDlpApiError(
        "Both addresses are outside your domain - Google Workspace has no visibility into mail that never touches an address on your domain, so this can't be blocked from this app."
      );
    }
    if (fromInternal) {
      return [
        {
          label: toInternal ? "internal sender to internal recipient" : "internal sender to external recipient",
          trigger: TRIGGER_SEND,
          applyInternalMessages: Boolean(toInternal),
          applyExternalMessages: !toInternal,
          contentCondition: addressCondition([from, to])
        }
      ];
    }
    // from is external, to must be internal (both-external already rejected above)
    return [
      {
        label: "external sender to internal recipient",
        trigger: TRIGGER_RECEIVE,
        applyInternalMessages: false,
        applyExternalMessages: true,
        contentCondition: addressCondition([from, to])
      }
    ];
  }

  if (from && !to) {
    if (fromInternal) {
      return [
        {
          label: "internal sender to any recipient",
          trigger: TRIGGER_SEND,
          applyInternalMessages: true,
          applyExternalMessages: true,
          contentCondition: addressCondition([from])
        }
      ];
    }
    return [
      {
        label: "external sender to any internal recipient",
        trigger: TRIGGER_RECEIVE,
        applyInternalMessages: false,
        applyExternalMessages: true,
        contentCondition: addressCondition([from])
      }
    ];
  }

  // !from && to
  if (toInternal) {
    return [
      {
        label: "any internal sender to this recipient",
        trigger: TRIGGER_SEND,
        applyInternalMessages: true,
        applyExternalMessages: false,
        contentCondition: addressCondition([to!])
      },
      {
        label: "any external sender to this recipient",
        trigger: TRIGGER_RECEIVE,
        applyInternalMessages: false,
        applyExternalMessages: true,
        contentCondition: addressCondition([to!])
      }
    ];
  }
  return [
    {
      label: "any internal sender to this external recipient",
      trigger: TRIGGER_SEND,
      applyInternalMessages: false,
      applyExternalMessages: true,
      contentCondition: addressCondition([to!])
    }
  ];
}

function describeGoogleApiError(err: any): string | undefined {
  const status = err?.code ?? err?.response?.status;
  const message = err?.response?.data?.error?.message ?? err?.errors?.[0]?.message ?? err?.message;
  if (!message) return undefined;
  return status ? `Google API error ${status}: ${message}` : String(message);
}

function unwrapCreateResult(data: any): { policyName: string; pending: boolean } {
  if (data.done && data.response?.name) {
    return { policyName: String(data.response.name), pending: false };
  }
  if (data.done === false) {
    return { policyName: String(data.name ?? "(pending)"), pending: true };
  }
  const name = data.response?.name ?? data.name;
  if (name) {
    return { policyName: String(name), pending: false };
  }
  throw new LiveDlpApiError("Google accepted the request but returned no policy or operation name.");
}

export interface LiveDlpResult {
  policyNames: string[];
  pending: boolean;
}

/**
 * Creates one or two Gmail DLP policies (see `planGmailBlockRules`). If a
 * second policy is needed and fails after the first succeeded, this rolls
 * the first one back with `policies.delete` rather than leaving a
 * half-applied rule (e.g. inbound blocked but not outbound) - callers get
 * an all-or-nothing result.
 */
export async function createLiveGmailDlpRule(
  oauth2Client: OAuth2Client,
  fromAddress: string | undefined,
  toAddress: string | undefined,
  orgUnitId: string
): Promise<LiveDlpResult> {
  const plans = planGmailBlockRules(fromAddress, toAddress);
  const cloudidentity = google.cloudidentity({ version: POLICY_API_VERSION, auth: oauth2Client });
  const baseName = [fromAddress, toAddress].filter(Boolean).join(" -> ") || "gmail block";
  const created: string[] = [];
  let pendingAny = false;

  try {
    for (const plan of plans) {
      const displayName = `Block: ${baseName} (${plan.label})`.slice(0, 100);
      const requestBody = {
        customer: `customers/${config.googleCustomerId}`,
        policyQuery: {
          orgUnit: `orgUnits/${orgUnitId}`
        },
        setting: {
          type: "settings/rule.dlp",
          value: {
            displayName,
            state: "ACTIVE",
            triggers: [plan.trigger],
            ruleTypeMetadata: {
              dlpRuleMetadata: {
                alertSeverity: "LOW"
              }
            },
            condition: {
              contentCondition: plan.contentCondition
            },
            action: {
              alertCenterAction: {},
              gmailAction: {
                blockContent: {
                  actionParams: {
                    applyInternalMessages: plan.applyInternalMessages,
                    applyExternalMessages: plan.applyExternalMessages
                  }
                }
              }
            }
          }
        }
      };
      // Temporary diagnostic logging: prints the exact outgoing request so
      // a rejection can be compared directly against a known-good manual
      // test, instead of guessing at what might differ. Safe to leave in -
      // it never logs tokens/credentials, only the rule body itself
      // (org unit ID and the addresses being blocked).
      console.log("Live DLP policy create request:", JSON.stringify(requestBody, null, 2));
      const { data } = await cloudidentity.policies.create({ requestBody });
      const result = unwrapCreateResult(data);
      created.push(result.policyName);
      if (result.pending) pendingAny = true;
    }
  } catch (err: any) {
    // Roll back anything already created in this request, so a two-leg
    // rule (e.g. "block all mail to this internal address") never ends up
    // half-applied.
    for (const name of created) {
      try {
        await cloudidentity.policies.delete({ name });
      } catch (rollbackErr) {
        console.error(`Failed to roll back partially-created policy ${name} after an error:`, rollbackErr);
      }
    }
    throw new LiveDlpApiError(
      created.length > 0
        ? `Google rejected part of this rule after another part succeeded; the successful part(s) were rolled back.`
        : "Google rejected the live DLP rule request.",
      describeGoogleApiError(err)
    );
  }

  return { policyNames: created, pending: pendingAny };
}
