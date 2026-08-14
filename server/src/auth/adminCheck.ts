import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

export interface AdminStatus {
  isAdmin: boolean;
  isDelegatedAdmin: boolean;
}

/**
 * Confirms the signed-in user actually holds a Google Workspace admin role
 * before letting them anywhere near rule creation.
 *
 * How this works: the Admin SDK Directory API can only be called
 * successfully by an account with *some* admin privilege in the first
 * place - a plain end user's call to `users.get` fails outright with a 403.
 * So a successful response here already proves the caller has an admin
 * role of some kind; we additionally surface `isAdmin` (super admin) and
 * `isDelegatedAdmin` (custom/delegated admin role) so the UI can show which
 * one applies.
 *
 * Caveat: this does NOT verify the admin's custom role specifically grants
 * "Gmail settings" or "Security settings" privileges - Google doesn't
 * expose a simple API to check privilege-level granularity by name. If a
 * delegated admin without those specific privileges reaches the point of
 * actually creating a rule, the underlying Google API call itself will
 * reject it with a 403, and the app surfaces that error rather than
 * silently pretending to succeed.
 */
export async function checkAdminStatus(oauth2Client: OAuth2Client, email: string): Promise<AdminStatus> {
  const directory = google.admin({ version: "directory_v1", auth: oauth2Client });

  try {
    const { data } = await directory.users.get({ userKey: email });
    return {
      isAdmin: Boolean(data.isAdmin),
      isDelegatedAdmin: Boolean(data.isDelegatedAdmin)
    };
  } catch (err: any) {
    const status = err?.code ?? err?.response?.status;
    if (status === 403 || status === 401) {
      // Expected path for a non-admin signing in - not a bug, just "no access".
      return { isAdmin: false, isDelegatedAdmin: false };
    }
    throw err;
  }
}
