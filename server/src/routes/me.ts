import { Router } from "express";
import { config } from "../config";

export const meRouter = Router();

meRouter.get("/", (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.json({ signedIn: false });
  }
  res.json({
    signedIn: true,
    email: user.email,
    name: user.name,
    picture: user.picture,
    isAdmin: user.isAdmin,
    isDelegatedAdmin: user.isDelegatedAdmin,
    hasAdminAccess: user.isAdmin || user.isDelegatedAdmin,
    liveDlpApiEnabled: config.enableLiveDlpApi
  });
});
