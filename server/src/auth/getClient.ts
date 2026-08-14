import { createOAuthClient } from "./oauthClient";
import type { SessionUser } from "../types";

/**
 * Builds an OAuth2Client pre-loaded with the signed-in admin's tokens, for
 * use in a single request. google-auth-library refreshes the access token
 * automatically (using the stored refresh_token) when it has expired, so
 * callers can just use the returned client directly.
 */
export function getAuthedClient(user: SessionUser) {
  const client = createOAuthClient();
  client.setCredentials({
    access_token: user.tokens.access_token,
    refresh_token: user.tokens.refresh_token,
    expiry_date: user.tokens.expiry_date
  });
  return client;
}
