export interface MeResponse {
  signedIn: boolean;
  email?: string;
  name?: string;
  picture?: string;
  isAdmin?: boolean;
  isDelegatedAdmin?: boolean;
  hasAdminAccess?: boolean;
  liveDlpApiEnabled?: boolean;
}

export interface OrgUnitNode {
  orgUnitId: string;
  orgUnitPath: string;
  name: string;
  parentOrgUnitPath?: string;
  children: OrgUnitNode[];
}

export interface ManualSteps {
  consoleDeepLink: string;
  summary: string;
  steps: string[];
}

export interface AuditRecord {
  id: string;
  kind: "gmail-compliance" | "drive-trust";
  createdAt: string;
  createdBy: string;
  /** Not set for drive-trust records - trust rules are scoped by group/individual, not OU. */
  orgUnitPath?: string;
  summary: string;
  outcome: "created-live" | "manual-required" | "failed";
  detail?: string;
  consoleDeepLink?: string;
  livePolicyNames?: string[];
  deletedAt?: string;
  deletedBy?: string;
}

export interface RuleResult {
  outcome: "created-live" | "manual-required" | "failed";
  manual?: ManualSteps;
  policyNames?: string[];
  record: AuditRecord;
  warning?: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin"
  });
  if (!res.ok) {
    let message = `Request to ${url} failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? message;
    } catch {
      // ignore, keep default message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => request<MeResponse>("/api/me"),
  logout: () => fetch("/auth/logout", { method: "POST", credentials: "same-origin" }),
  orgUnits: () => request<OrgUnitNode>("/api/orgunits"),
  history: () => request<AuditRecord[]>("/api/rules"),
  createGmailRule: (payload: { orgUnitPath: string; fromAddress?: string; toAddress?: string; description?: string }) =>
    request<RuleResult>("/api/rules/gmail-compliance", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createTrustRule: (payload: {
    fromAddress: string;
    toAddress: string;
    bothDirections?: boolean;
    description?: string;
  }) =>
    request<RuleResult>("/api/rules/drive-trust", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteRule: (id: string) =>
    request<{ record: AuditRecord }>(`/api/rules/${encodeURIComponent(id)}`, {
      method: "DELETE"
    })
};
