import { Router } from "express";
import { requireAdmin } from "../auth/session";
import { getAuthedClient } from "../auth/getClient";
import { getOrgUnitTree } from "../services/directoryService";

export const orgUnitsRouter = Router();

orgUnitsRouter.get("/", requireAdmin, async (req, res) => {
  try {
    const client = getAuthedClient(req.session.user!);
    const tree = await getOrgUnitTree(client);
    res.json(tree);
  } catch (err: any) {
    console.error("Failed to load org units", err);
    res.status(502).json({
      error: "orgunit_fetch_failed",
      message:
        "Could not load your organization's OU list from Google. Make sure the signed-in account has the " +
        "Admin SDK API enabled and Organizational Units read privileges.",
      detail: err?.message
    });
  }
});
