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
 * A DLP rule scoped to an OU with a "match everything on this route" style
 * detector and a block action gets you the same practical outcome as a
 * classic content-compliance block rule, but it is a different Google
 * feature living in the Admin console under Security > Data protection
 * rather than Apps > Gmail > Compliance.
 *
 * Because this endpoint is weeks old at the time this app was written, the
 * exact request schema below should be treated as a best-effort
 * implementation, not a guarantee. Before relying on this in production:
 *   1. Set ENABLE_LIVE_DLP_API=true in your .env for a test OU only.
 *   2. Try creating one rule from the app and IMMEDIATELY verify it in the
 *      Admin console under Security > Data protection > Rules.
 *   3. Cross-check the request/response against Google's live reference at
 *      https://cloud.google.com/identity/docs/reference/rest/v1beta1/policies
 *      and adjust the payload in this file if Google's schema has moved.
 *
 * Until you've done that verification, leave ENABLE_LIVE_DLP_API=false -
 * the app will use the guided manual/deep-link flow instead, which always
 * works because it doesn't depend on a beta API surface.
 */

const POLICIES_ENDPOINT = "https://cloudidentity.googleapis.com/v1beta1/policies";

export class LiveDlpApiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "LiveDlpApiError";
  }
}

export async function createLiveGmailDlpRule(
  oauth2Client: OAuth2Client,
  orgUnitId: string,
  req: GmailRuleRequest
): Promise<{ policyName: string }> {
  if (!config.enableLiveDlpApi) {
    throw new LiveDlpApiError("Live DLP API creation is disabled (ENABLE_LIVE_DLP_API=false).");
  }

  const DIRECTION_META: Record<GmailRuleRequest["direction"], { label: string; triggerType: string }> = {
    "internal-internal": { label: "Internal to internal", triggerType: "INTERNAL_RECEIVING" },
    "internal-external": { label: "Internal to external", triggerType: "OUTBOUND" },
    "external-internal": { label: "External to internal", triggerType: "INBOUND" }
  };
  const { label: directionLabel, triggerType } = DIRECTION_META[req.direction];

  // Best-effort payload shape per Google's documented Policy resource
  // (policyQuery scoped to an OrgUnit + a named setting/value pair). See
  // the module-level comment above - verify this against the live API
  // reference before trusting it unattended.
  const body = {
    policyQuery: {
      orgUnit: { orgUnitId }
    },
    setting: {
      type: "settings/gmail.dlp_rules",
      value: {
        dlpRules: [
          {
            displayName: `${directionLabel} block - ${req.orgUnitPath}`.slice(0, 100),
            description: req.description ?? `Created by Compliance Rule Manager for ${req.orgUnitPath}`,
            enabled: true,
            trigger: {
              triggerType
            },
            action: {
              actionType: "REJECT_MESSAGE"
            }
          }
        ]
      }
    }
  };

  let responseData: any;
  try {
    const response = await oauth2Client.request<any>({
      url: POLICIES_ENDPOINT,
      method: "POST",
      data: body
    });
    responseData = response.data;
  } catch (err) {
    throw new LiveDlpApiError(describeGoogleApiError(err), err);
  }

  const policyName = responseData?.name ?? responseData?.response?.name ?? "unknown (check Admin console to confirm)";
  return { policyName };
}

/**
 * Pulls the actual status/message Google sent back out of a failed Gaxios
 * request, instead of a generic "it failed" string. Google's error body on
 * a 400/403/404 here almost always says exactly what's wrong (bad field
 * name, missing privilege, wrong URL) - surfacing it is what lets you
 * (or whoever's debugging this) fix the request schema in this file
 * instead of guessing. This message is shown in the app's UI banner, saved
 * to the audit log, and printed to the server log (see routes/rules.ts).
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
