import { config } from "../config";

/** True if the address's domain matches this Workspace's allowed domain. */
export function isInternalAddress(address: string): boolean {
  const domain = address.split("@")[1]?.toLowerCase().trim();
  return domain === config.allowedDomain;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isLikelyEmailAddress(address: string): boolean {
  return EMAIL_RE.test(address.trim());
}
