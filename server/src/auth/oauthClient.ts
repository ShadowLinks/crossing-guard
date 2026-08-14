import { OAuth2Client } from "google-auth-library";
import { config } from "../config";

/**
 * Shared OAuth2 client used to build the consent-screen URL and to exchange
 * the authorization code for tokens. A fresh client with the user's tokens
 * attached is created per-request in routes that need to call Google APIs
 * (see services/*) so that requests from different signed-in admins never
 * share credentials.
 */
export function createOAuthClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    redirectUri: config.oauthRedirectUri
  });
}
