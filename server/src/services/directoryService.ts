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
