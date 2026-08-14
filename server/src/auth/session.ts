import session from "express-session";
import { config } from "../config";
import type { SessionUser } from "../types";

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    oauthState?: string;
  }
}

export const sessionMiddleware = session({
  name: "compliance_app_sid",
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8 // 8 hours
  }
});

import type { Request, Response, NextFunction } from "express";

export function requireSignedIn(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    return res.status(401).json({ error: "not_signed_in" });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.session.user;
  if (!user) {
    return res.status(401).json({ error: "not_signed_in" });
  }
  if (!user.isAdmin && !user.isDelegatedAdmin) {
    return res.status(403).json({
      error: "not_admin",
      message: "Your Google account is signed in, but it does not hold a Google Workspace admin role."
    });
  }
  next();
}
