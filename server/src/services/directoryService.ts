import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { config } from "../config";
import type { OrgUnitNode } from "../types";

/**
 * Fetches the full org unit list for the domain and assembles it into a
 * tree, rooted at "/". This is a fully-supported, stable Directory API
 * call (unlike the compliance/trust rule APIs) - no caveats here.
 */
export async function getOrgUnitTree(oauth2Client: OAuth2Client): Promise<OrgUnitNode> {
  const directory = google.admin({ version: "directory_v1", auth: oauth2Client });

  const { data } = await directory.orgunits.list({
    customerId: config.googleCustomerId,
    type: "all"
  });

  const units = data.organizationUnits ?? [];

  const root: OrgUnitNode = {
    orgUnitId: "root",
    orgUnitPath: "/",
    name: "Entire organization",
    children: []
  };

  const byPath = new Map<string, OrgUnitNode>();
  byPath.set("/", root);

  // Org units can come back in any order, and a child can appear before its
  // parent - do two passes so nesting always works regardless of order.
  for (const unit of units) {
    if (!unit.orgUnitPath || !unit.orgUnitId || !unit.name) continue;
    byPath.set(unit.orgUnitPath, {
      orgUnitId: unit.orgUnitId,
      orgUnitPath: unit.orgUnitPath,
      name: unit.name,
      parentOrgUnitPath: unit.parentOrgUnitPath ?? "/",
      children: []
    });
  }

  for (const unit of units) {
    if (!unit.orgUnitPath) continue;
    const node = byPath.get(unit.orgUnitPath);
    if (!node) continue;
    const parentPath = unit.parentOrgUnitPath ?? "/";
    const parent = byPath.get(parentPath) ?? root;
    parent.children.push(node);
  }

  const sortTree = (node: OrgUnitNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sortTree);
  };
  sortTree(root);

  return root;
}

/**
 * Resolves an org unit path (e.g. "/Kiosks/CO Sped Inventory") to its
 * Google-assigned orgUnitId, which is what the Cloud Identity Policy API
 * needs (as `orgUnits/{id}`) rather than the human-readable path.
 *
 * Throws a plain Error with a message safe to show the admin if the path
 * doesn't resolve to a real org unit, or is the synthetic "/" root this
 * app uses to mean "entire organization" (the Directory API has no single
 * org unit representing that - it's a customer-wide concept, not an OU).
 *
 * CONFIRMED GOTCHA (found 2026-08-14 via a real failed live rule create):
 * the Directory API's `orgUnitId` field value comes back with a literal
 * `id:` prefix baked in (e.g. `"id:02icddew0k08mor"`), but the Policy API's
 * `policyQuery.orgUnit` field wants the bare token (`orgUnits/02icddew0k08mor`
 * - no `id:`). Every Playground test that worked used a bare ID pulled from
 * a policy's own `policyQuery.orgUnit`, never from this Directory API field
 * directly, so this mismatch was never exercised until a real rule create
 * through the app failed with a generic 400. Strip the prefix here so every
 * caller of this function gets an ID that's actually usable with the Policy
 * API, rather than making every caller remember to do it themselves.
 */
export async function getOrgUnitByPath(
  oauth2Client: OAuth2Client,
  orgUnitPath: string
): Promise<{ orgUnitId: string; name: string }> {
  if (orgUnitPath === "/" || orgUnitPath.trim() === "") {
    throw new Error(
      'Live rule creation needs one specific org unit, not "Entire organization". Pick a specific OU, or use the manual steps below for a domain-wide rule.'
    );
  }

  const directory = google.admin({ version: "directory_v1", auth: oauth2Client });
  const { data } = await directory.orgunits.get({
    customerId: config.googleCustomerId,
    // The Directory API wants the path without its leading slash.
    orgUnitPath: orgUnitPath.replace(/^\/+/, "")
  });

  if (!data.orgUnitId || !data.name) {
    throw new Error(`Google didn't return a usable org unit for "${orgUnitPath}".`);
  }

  return { orgUnitId: data.orgUnitId.replace(/^id:/, ""), name: data.name };
}
