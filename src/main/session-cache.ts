import { existsSync, readFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { HERMES_HOME } from "./installer";
import { safeWriteFile } from "./utils";
import Database from "better-sqlite3";
import { t } from "../shared/i18n";
import { getAppLocale } from "./locale";

function getProfileDbPath(profile?: string): string {
  if (profile && profile !== "default") {
    return join(HERMES_HOME, "profiles", profile, "state.db");
  }
  return join(HERMES_HOME, "state.db");
}

function getProfileCacheDir(profile?: string): string {
  if (profile && profile !== "default") {
    const dir = join(HERMES_HOME, "profiles", profile, "desktop");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
  const cacheDir = join(HERMES_HOME, "desktop");
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

function getCacheFile(profile?: string): string {
  return join(getProfileCacheDir(profile), "sessions.json");
}

export interface CachedSession {
  id: string;
  title: string;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
}

interface CacheData {
  sessions: CachedSession[];
  lastSync: number;
}

// Generate a short, readable title from the first user message (like ChatGPT/Claude)
function generateTitle(message: string): string {
  if (!message || !message.trim())
    return t("sessions.newConversation", getAppLocale());

  // Clean up the message
  let text = message.trim();

  // Remove markdown formatting
  text = text.replace(/[#*_`~\[\]()]/g, "");
  // Remove URLs
  text = text.replace(/https?:\/\/\S+/g, "");
  // Remove extra whitespace
  text = text.replace(/\s+/g, " ").trim();

  if (!text) return t("sessions.newConversation", getAppLocale());

  // If short enough, use as-is
  if (text.length <= 50) return text;

  // Take first meaningful chunk — aim for ~40-50 chars at word boundary
  const words = text.split(" ");
  let title = "";
  for (const word of words) {
    if ((title + " " + word).trim().length > 45) break;
    title = (title + " " + word).trim();
  }

  return title || text.slice(0, 45) + "...";
}

function readCache(profile?: string): CacheData {
  const cacheFile = getCacheFile(profile);
  try {
    if (!existsSync(cacheFile)) return { sessions: [], lastSync: 0 };
    return JSON.parse(readFileSync(cacheFile, "utf-8"));
  } catch {
    return { sessions: [], lastSync: 0 };
  }
}

function writeCache(data: CacheData, profile?: string): void {
  const cacheFile = getCacheFile(profile);
  try {
    safeWriteFile(cacheFile, JSON.stringify(data));
  } catch {
    // non-fatal
  }
}

function getDb(profile?: string): Database.Database | null {
  const dbPath = getProfileDbPath(profile);
  if (!existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly: true });
}

function getAllProfileDbs(): Array<{path: string, profile: string}> {
  const dbs: Array<{path: string, profile: string}> = [];
  
  // Default profile
  const defaultDb = join(HERMES_HOME, "state.db");
  if (existsSync(defaultDb)) {
    dbs.push({ path: defaultDb, profile: "default" });
  }
  
  // Profile-specific databases
  const profilesDir = join(HERMES_HOME, "profiles");
  if (existsSync(profilesDir)) {
    try {
      const profiles = readdirSync(profilesDir);
      for (const profile of profiles) {
        if (profile.startsWith(".")) continue;
        const dbPath = join(profilesDir, profile, "state.db");
        if (existsSync(dbPath)) {
          dbs.push({ path: dbPath, profile });
        }
      }
    } catch {
      // ignore
    }
  }
  
  return dbs;
}

// Get JSONL sessions directory for a profile
function getJsonlSessionsDir(profile?: string): string {
  if (profile && profile !== "default") {
    return join(HERMES_HOME, "profiles", profile, "sessions");
  }
  return join(HERMES_HOME, "sessions");
}

// Read sessions from JSONL format (sessions.json)
// Hermes Agent newer versions store sessions here instead of SQLite
interface JsonlSessionMeta {
  session_key: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  display_name: string | null;
  platform: string;
  message_count: number;
}

function readJsonlSessions(dir: string): CachedSession[] {
  const sessionsFile = join(dir, "sessions.json");
  if (!existsSync(sessionsFile)) return [];

  try {
    const content = readFileSync(sessionsFile, "utf-8");
    const data = JSON.parse(content) as Record<string, JsonlSessionMeta>;
    const sessions: CachedSession[] = [];

    for (const meta of Object.values(data)) {
      // Parse ISO date string to Unix timestamp
      const startedAt = Math.floor(new Date(meta.created_at).getTime() / 1000);
      sessions.push({
        id: meta.session_id,
        title: meta.display_name || meta.session_id,
        startedAt,
        source: meta.platform || "cli",
        messageCount: meta.message_count || 0,
        model: "",
      });
    }

    return sessions;
  } catch {
    return [];
  }
}


// Sync from hermes DB to local cache — only fetches new/updated sessions
export function syncSessionCache(profile?: string): CachedSession[] {
  // When no profile specified, scan all profiles and merge results
  if (!profile) {
    const seen = new Set<string>();
    const allDbs = getAllProfileDbs();
    let allSessions: CachedSession[] = [];
    
    for (const { path } of allDbs) {
      try {
        const db = new Database(path, { readonly: true });
        const rows = db
          .prepare(
            `SELECT s.id, s.started_at, s.source, s.message_count, s.model, s.title
             FROM sessions s
             ORDER BY s.started_at DESC
             LIMIT 100`,
          )
          .all() as Array<{
          id: string;
          started_at: number;
          source: string;
          message_count: number;
          model: string;
          title: string | null;
        }>;
        
        for (const row of rows) {
          allSessions.push({
            id: row.id,
            title: row.title || t("sessions.newConversation", getAppLocale()),
            startedAt: row.started_at,
            source: row.source,
            messageCount: row.message_count,
            model: row.model || "",
          });
        }
        
        db.close();
      } catch {
        // skip this db
      }
    }

    // Also read sessions from JSONL format (Hermes Agent newer versions)
    const allProfileDbs = getAllProfileDbs();
    for (const { profile: p } of allProfileDbs) {
      const jsonlDir = getJsonlSessionsDir(p === "default" ? undefined : p);
      const jsonlSessions = readJsonlSessions(jsonlDir);
      for (const s of jsonlSessions) {
        if (!seen.has(s.id)) {
          allSessions.push(s);
          seen.add(s.id);
        }
      }
    }

    // Sort all sessions by startedAt descending and deduplicate by id
    allSessions.sort((a, b) => b.startedAt - a.startedAt);
    allSessions = allSessions.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    
    // Save to default cache
    const cacheData: CacheData = {
      sessions: allSessions,
      lastSync: Math.floor(Date.now() / 1000),
    };
    writeCache(cacheData);
    
    return allSessions;
  }
  
  const cache = readCache(profile);
  const db = getDb(profile);
  if (!db) return cache.sessions;

  try {
    // Fetch sessions newer than last sync, or all if first sync
    const rows = db
      .prepare(
        `SELECT s.id, s.started_at, s.source, s.message_count, s.model, s.title
         FROM sessions s
         WHERE s.started_at > ?
         ORDER BY s.started_at DESC`,
      )
      .all(cache.lastSync > 0 ? cache.lastSync - 300 : 0) as Array<{
      id: string;
      started_at: number;
      source: string;
      message_count: number;
      model: string;
      title: string | null;
    }>;

    // Index existing sessions by id once so the per-row update below is
    // O(1) instead of O(N). Without this, syncing N existing sessions
    // against N new rows is O(N²) and visibly slows app startup once a
    // user has accumulated thousands of sessions (issue #16).
    const existingById = new Map<string, CachedSession>();
    for (const s of cache.sessions) existingById.set(s.id, s);
    const newSessions: CachedSession[] = [];

    const refreshedIds = new Set<string>();
    for (const row of rows) {
      refreshedIds.add(row.id);
      const existing = existingById.get(row.id);
      if (existing) {
        // Update existing entry (message count may have changed)
        existing.messageCount = row.message_count;
        continue;
      }

      // Generate title from first user message
      let title = row.title || "";
      if (!title) {
        try {
          const msg = db
            .prepare(
              `SELECT content FROM messages
               WHERE session_id = ? AND role = 'user' AND content IS NOT NULL
               ORDER BY timestamp, id LIMIT 1`,
            )
            .get(row.id) as { content: string } | undefined;
          title = msg
            ? generateTitle(msg.content)
            : t("sessions.newConversation", getAppLocale());
        } catch {
          title = t("sessions.newConversation", getAppLocale());
        }
      }

      newSessions.push({
        id: row.id,
        title,
        startedAt: row.started_at,
        source: row.source,
        messageCount: row.message_count,
        model: row.model || "",
      });
    }

    // Phase 2: refresh message_count for cached sessions that weren't
    // returned by the lastSync-windowed query above. Without this, an
    // old session that's still accumulating messages keeps the stale
    // count it had at first sync — the renderer reads from the cache,
    // so the UI reports e.g. 15 messages when the conversation actually
    // has 200+. Issue #226. Cheap (single column, no joins, batched IN
    // clause), and skipped entirely on a first sync since cache.sessions
    // is empty.
    const staleIds = cache.sessions
      .map((s) => s.id)
      .filter((id) => !refreshedIds.has(id));
    if (staleIds.length > 0) {
      // SQLite caps prepared-statement parameters; chunk well under
      // SQLITE_MAX_VARIABLE_NUMBER (default 999 on older builds) for
      // portability across the better-sqlite3 versions hermes ships.
      const CHUNK = 500;
      const countsById = new Map<string, number>();
      for (let i = 0; i < staleIds.length; i += CHUNK) {
        const chunk = staleIds.slice(i, i + CHUNK);
        const placeholders = chunk.map(() => "?").join(", ");
        const refreshed = db
          .prepare(
            `SELECT id, message_count FROM sessions WHERE id IN (${placeholders})`,
          )
          .all(...chunk) as Array<{ id: string; message_count: number }>;
        for (const r of refreshed) countsById.set(r.id, r.message_count);
      }
      for (const s of cache.sessions) {
        const fresh = countsById.get(s.id);
        if (fresh !== undefined && fresh !== s.messageCount) {
          s.messageCount = fresh;
        }
      }
    }

    // Merge: new sessions first (most recent), then existing, then JSONL sessions
    const jsonlSessions = readJsonlSessions(getJsonlSessionsDir(profile));
    const allSessions = [...newSessions, ...cache.sessions, ...jsonlSessions];
    // Sort by startedAt descending
    allSessions.sort((a, b) => b.startedAt - a.startedAt);

    const updated: CacheData = {
      sessions: allSessions,
      lastSync: Math.floor(Date.now() / 1000),
    };
    writeCache(updated, profile);
    return updated.sessions;
  } catch {
    // Reset lastSync to 0 so next sync does a full resync instead of
    // permanently filtering out sessions newer than the failed sync time
    writeCache({ sessions: cache.sessions, lastSync: 0 }, profile);
    return cache.sessions;
  } finally {
    db.close();
  }
}

// Fast read from cache only (no DB access)
export function listCachedSessions(
  limit = 50,
  offset = 0,
  profile?: string,
): CachedSession[] {
  const cache = readCache(profile);
  return cache.sessions.slice(offset, offset + limit);
}

// Update title for a specific session
export function updateSessionTitle(
  sessionId: string,
  title: string,
  profile?: string,
): void {
  const cache = readCache(profile);
  const idx = cache.sessions.findIndex((s) => s.id === sessionId);
  if (idx >= 0) {
    cache.sessions[idx].title = title;
    writeCache(cache, profile);
  }
}
