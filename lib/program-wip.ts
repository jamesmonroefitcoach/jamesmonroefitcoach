// Programs-rework WIP localStorage helpers.
//
// The rework builder saves its draft per-client in localStorage. The lobby
// used to call removeItem when starting a new program — but that meant a
// misclick destroyed the draft. This module replaces destructive deletes
// with an archive-rename pattern so previous drafts stay recoverable:
//
//   monroe-programs-rework-{clientId}                    ← active WIP
//   monroe-programs-rework-backup-{clientId}-{ts}        ← archived drafts
//
// Browser-side only (no Supabase, no Next imports) so it's safe in any
// client component.

const ACTIVE_PREFIX = "monroe-programs-rework-";
const BACKUP_PREFIX = "monroe-programs-rework-backup-";
const MAX_BACKUPS_PER_CLIENT = 20;

function activeKey(clientId: string): string {
  return `${ACTIVE_PREFIX}${clientId || "noclient"}`;
}

export type WipBackup = {
  key: string;
  clientId: string;
  timestamp: number;
  json: string;
};

/** Archive the active WIP for a client (if any) to a timestamped backup
 *  key, then remove the active key. Returns the backup key it wrote to,
 *  or null if there was nothing to archive. */
export function archiveActiveWip(clientId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const k = activeKey(clientId);
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const ts = Date.now();
    const backupKey = `${BACKUP_PREFIX}${clientId || "noclient"}-${ts}`;
    localStorage.setItem(backupKey, raw);
    localStorage.removeItem(k);
    pruneOldBackups(clientId);
    return backupKey;
  } catch {
    return null;
  }
}

/** List all backup drafts for a client, newest first. */
export function listWipBackups(clientId: string): WipBackup[] {
  if (typeof window === "undefined") return [];
  const out: WipBackup[] = [];
  const targetPrefix = `${BACKUP_PREFIX}${clientId || "noclient"}-`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(targetPrefix)) continue;
      const tsStr = k.slice(targetPrefix.length);
      const ts = Number(tsStr);
      if (!Number.isFinite(ts)) continue;
      const v = localStorage.getItem(k) ?? "";
      out.push({ key: k, clientId, timestamp: ts, json: v });
    }
  } catch {}
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out;
}

/** Restore a backup to the active WIP slot. Returns true if it worked. */
export function restoreWipBackup(backupKey: string, clientId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(backupKey);
    if (!raw) return false;
    // If there's a current active WIP, archive it first so restoring doesn't
    // silently overwrite the latest in-progress draft.
    archiveActiveWip(clientId);
    localStorage.setItem(activeKey(clientId), raw);
    return true;
  } catch {
    return false;
  }
}

/** Delete a single backup. */
export function deleteWipBackup(backupKey: string): boolean {
  if (typeof window === "undefined") return false;
  try { localStorage.removeItem(backupKey); return true; }
  catch { return false; }
}

/** Cap backups per client at MAX_BACKUPS_PER_CLIENT, dropping oldest first. */
function pruneOldBackups(clientId: string): void {
  const backups = listWipBackups(clientId);
  if (backups.length <= MAX_BACKUPS_PER_CLIENT) return;
  for (const b of backups.slice(MAX_BACKUPS_PER_CLIENT)) {
    try { localStorage.removeItem(b.key); } catch {}
  }
}
