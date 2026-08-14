import "dotenv/config";

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. Copy server/.env.example to server/.env and fill it in.`
    );
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  appBaseUrl: (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  googleClientId: required("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: required("GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET),
  allowedDomain: required("ALLOWED_DOMAIN", process.env.ALLOWED_DOMAIN).toLowerCase(),
  sessionSecret: required("SESSION_SECRET", process.env.SESSION_SECRET),
  googleCustomerId: process.env.GOOGLE_CUSTOMER_ID ?? "my_customer",
  cookieSecure: (process.env.COOKIE_SECURE ?? "false").toLowerCase() === "true",
  // Opt-in: attempt to create the Gmail DLP rule live via the Cloud
  // Identity Policy API, falling back to the guided manual flow if that
  // call fails for any reason. Off by default so a fresh install always
  // works purely off the manual flow until an admin has verified the live
  // path against their own tenant. See NOTICE.md before turning this on.
  enableLiveDlpApi: (process.env.ENABLE_LIVE_DLP_API ?? "false").toLowerCase() === "true",
  get oauthRedirectUri() {
    return `${this.appBaseUrl}/auth/google/callback`;
  }
};

// Scopes requested at sign-in. Kept to the minimum needed:
//  - identify the signed-in user and their domain
//  - read the org unit tree (Directory API)
//  - read the signed-in user's own directory record, to check admin status
//  - create/read Gmail DLP rules (Cloud Identity Policy API), for the
//    opt-in live rule path (see ENABLE_LIVE_DLP_API above)
//
// Correction: an earlier version of this comment said Gmail's newer DLP
// rules can't block mail, based on an Admin console screenshot that
// happened to be missing the "Block message" option. That was wrong - a
// real rule read back from this district's tenant on 2026-08-14 confirmed
// blocking IS available via `action.gmailAction.blockContent`. See the
// comment at the top of server/src/services/policyService.ts for exactly
// what's confirmed vs. still a (safe, fail-loud) guess.
export const OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/admin.directory.orgunit.readonly",
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.rolemanagement.readonly",
  "https://www.googleapis.com/auth/cloud-identity.policies"
];
