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
  enableLiveDlpApi: (process.env.ENABLE_LIVE_DLP_API ?? "false").toLowerCase() === "true",
  googleCustomerId: process.env.GOOGLE_CUSTOMER_ID ?? "my_customer",
  cookieSecure: (process.env.COOKIE_SECURE ?? "false").toLowerCase() === "true",
  get oauthRedirectUri() {
    return `${this.appBaseUrl}/auth/google/callback`;
  }
};

// Scopes requested at sign-in. Kept to the minimum needed:
//  - identify the signed-in user and their domain
//  - read the org unit tree (Directory API)
//  - read the signed-in user's own directory record, to check admin status
//  - read/write Cloud Identity policies (DLP rules) - write is only ever
//    attempted when ENABLE_LIVE_DLP_API=true, but the scope is requested
//    up front so an admin doesn't have to re-consent later to flip the flag.
export const OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/admin.directory.orgunit.readonly",
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.rolemanagement.readonly",
  "https://www.googleapis.com/auth/cloud-identity.policies"
];
