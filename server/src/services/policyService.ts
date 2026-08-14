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

  const directionLabel = req.direction === "internal-internal" ? "Internal to internal" : "Internal to external";

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
              triggerType: req.direction === "internal-internal" ? "INTERNAL_RECEIVING" : "OUTBOUND"
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
    throw new LiveDlpApiError(
      "The live Policy API call failed. This is expected if Google's beta schema has changed since this app " +
        "was written, or if this account lacks the cloud-identity.policies scope/privilege. Falling back to the " +
        "guided manual steps is recommended.",
      err
    );
  }

  const policyName = responseData?.name ?? responseData?.response?.name ?? "unknown (check Admin console to confirm)";
  return { policyName };
}
