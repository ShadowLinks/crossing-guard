import { Router } from "express";
import crypto from "node:crypto";
import { createOAuthClient } from "../auth/oauthClient";
import { checkAdminStatus } from "../auth/adminCheck";
import { config, OAUTH_SCOPES } from "../config";

export const authRouter = Router();

authRouter.get("/google", (req, res) => {
  const oauth2Client = createOAuthClient();
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // ensures a refresh_token is issued even on repeat sign-ins
    scope: OAUTH_SCOPES,
    hd: config.allowedDomain, // hints Google to only show accounts on this domain
    state
  });

  res.redirect(url);
});

authRouter.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(error)}`);
  }
  if (!code || !state || state !== req.session.oauthState) {
    return res.redirect("/?error=invalid_oauth_state");
  }
  req.session.oauthState = undefined;

  try {
    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: config.googleClientId
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.redirect("/?error=no_profile");
    }

    const domain = payload.hd ?? payload.email.split("@")[1]?.toLowerCase();
    if (domain !== config.allowedDomain) {
      return res.redirect("/?error=wrong_domain");
    }

    const adminStatus = await checkAdminStatus(oauth2Client, payload.email);

    req.session.user = {
      email: payload.email,
      name: payload.name ?? payload.email,
      picture: payload.picture,
      domain,
      isAdmin: adminStatus.isAdmin,
      isDelegatedAdmin: adminStatus.isDelegatedAdmin,
      tokens: {
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined
      }
    };

    res.redirect("/");
  } catch (err) {
    console.error("OAuth callback failed", err);
    res.redirect("/?error=oauth_failed");
  }
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(204).end();
  });
});
