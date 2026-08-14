export interface SessionUser {
  email: string;
  name: string;
  picture?: string;
  domain: string;
  isAdmin: boolean;
  isDelegatedAdmin: boolean;
  /** Access token is kept server-side only, never sent to the browser. */
  tokens: {
    access_token: string;
    refresh_token?: string;
    expiry_date?: number;
  };
}

export interface OrgUnitNode {
  orgUnitId: string;
  orgUnitPath: string;
  name: string;
  parentOrgUnitPath?: string;
  children: OrgUnitNode[];
}

export interface GmailRuleRequest {
  orgUnitPath: string;
  /** At least one of fromAddress/toAddress must be set. */
  fromAddress?: string;
  toAddress?: string;
  description?: string;
}

// Drive trust rules have no way to scope their "Scope" (sender) side to a
// single named individual - only an org unit or group. The only way to
// target two SPECIFIC people is the group workaround: put the sender in a
// throwaway group, then use the rule's "Condition" side (which CAN name an
// individual) to target the recipient. See buildTrustRuleManualSteps for
// the full walkthrough this generates.
export interface TrustRuleRequest {
  /** The person whose sharing is being restricted (goes in the throwaway group). */
  fromAddress: string;
  /** The specific person they should be blocked from sharing with. */
  toAddress: string;
  /** Also generate the mirrored steps to block the reverse direction. */
  bothDirections?: boolean;
  description?: string;
}

export type RuleKind = "gmail-compliance" | "drive-trust";
export type RuleOutcome = "created-live" | "manual-required" | "failed";

export interface AuditRecord {
  id: string;
  kind: RuleKind;
  createdAt: string;
  createdBy: string;
  /** Not set for drive-trust records - trust rules are scoped by group/individual, not OU. */
  orgUnitPath?: string;
  summary: string;
  outcome: RuleOutcome;
  detail?: string;
  consoleDeepLink?: string;
  /** Real Cloud Identity Policy resource name(s), set only for outcome "created-live". */
  livePolicyNames?: string[];
  /** Set once the live policy/policies above have been deleted through this app. */
  deletedAt?: string;
  deletedBy?: string;
}
