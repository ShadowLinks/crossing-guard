import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { AuditRecord } from "../types";

// A minimal, dependency-free JSON-file store for the rule history/audit
// trail. This is an internal IT tool used by a handful of admins, so a
// single JSON file (with atomic-ish write-then-rename) is plenty - no need
// to pull in a database for this. Swap this module out for a real DB if
// this ever needs multi-server deployment.
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "audit-log.json");

function ensureStore(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
  }
}

function readAll(): AuditRecord[] {
  ensureStore();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw) as AuditRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: AuditRecord[]): void {
  ensureStore();
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(records, null, 2), "utf8");
  fs.renameSync(tmpFile, DATA_FILE);
}

export function appendAuditRecord(record: Omit<AuditRecord, "id" | "createdAt">): AuditRecord {
  const full: AuditRecord = {
    ...record,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  const all = readAll();
  all.unshift(full);
  writeAll(all);
  return full;
}

export function listAuditRecords(): AuditRecord[] {
  return readAll();
}
