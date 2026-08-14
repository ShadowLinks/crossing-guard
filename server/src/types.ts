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

export type TrustRuleScope = "block-all-external" | "allow-only-trusted-domains";

export interface TrustRuleRequest {
  orgUnitPath: string;
  scope: TrustRuleScope;
  trustedDomains?: string[];
  description?: string;
}

export type RuleKind = "gmail-compliance" | "drive-trust";
export type RuleOutcome = "created-live" | "manual-required" | "failed";

export interface AuditRecord {
  id: string;
  kind: RuleKind;
  createdAt: string;
  createdBy: string;
  orgUnitPath: string;
  summary: string;
  outcome: RuleOutcome;
  detail?: string;
  consoleDeepLink?: string;
}
