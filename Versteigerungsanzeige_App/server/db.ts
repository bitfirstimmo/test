import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { config } from './config.js';

const dbDir = path.dirname(config.databasePath);
fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  session_key TEXT NOT NULL,
  session_key_hash TEXT NOT NULL,
  admin_token_hash TEXT,
  amtsgericht TEXT,
  sitzungsbezeichnung TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  highest_bid_cents INTEGER,
  highest_bidder_name TEXT,
  base_duration_minutes INTEGER NOT NULL DEFAULT 30,
  prepared_duration_minutes INTEGER NOT NULL DEFAULT 30,
  timer_status TEXT NOT NULL DEFAULT 'not_started',
  started_at TEXT,
  end_at TEXT,
  expires_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  license_confirmed_at TEXT,
  license_version TEXT,
  last_saved_at TEXT,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_bidders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, name),
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
`;

db.exec(schema);

const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
if (!sessionColumns.some((column) => column.name === 'highest_bidder_name')) {
  db.exec('ALTER TABLE sessions ADD COLUMN highest_bidder_name TEXT');
}

export function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createSessionRecord(input: {
  amtsgericht?: string | null;
  title?: string | null;
  licenseVersion: string;
  licenseConfirmedAt: string;
  sessionKey: string;
  adminToken: string;
}) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + config.sessionLifetimeHours * 60 * 60 * 1000).toISOString();
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO sessions (
      id, created_at, updated_at, session_key, session_key_hash, admin_token_hash,
      amtsgericht, sitzungsbezeichnung, status, highest_bid_cents,
      base_duration_minutes, prepared_duration_minutes, timer_status,
      started_at, end_at, expires_at, version, license_confirmed_at,
      license_version, last_saved_at
    ) VALUES (
      @id, @created_at, @updated_at, @session_key, @session_key_hash, @admin_token_hash,
      @amtsgericht, @sitzungsbezeichnung, @status, @highest_bid_cents,
      @base_duration_minutes, @prepared_duration_minutes, @timer_status,
      @started_at, @end_at, @expires_at, @version, @license_confirmed_at,
      @license_version, @last_saved_at
    )
  `);
  stmt.run({
    id,
    created_at: now,
    updated_at: now,
    session_key: input.sessionKey,
    session_key_hash: hashValue(input.sessionKey),
    admin_token_hash: hashValue(input.adminToken),
    amtsgericht: input.amtsgericht ?? null,
    sitzungsbezeichnung: input.title ?? null,
    status: 'active',
    highest_bid_cents: null,
    base_duration_minutes: config.defaultSessionMinutes,
    prepared_duration_minutes: config.defaultSessionMinutes,
    timer_status: 'not_started',
    started_at: null,
    end_at: null,
    expires_at: expiresAt,
    version: 1,
    license_confirmed_at: input.licenseConfirmedAt,
    license_version: input.licenseVersion,
    last_saved_at: now,
  });
  return findSessionById(id);
}

export function findSessionById(id: string) {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, any> | undefined;
  return row ?? null;
}

export function findSessionByKey(sessionKey: string) {
  const normalized = sessionKey.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const row = db.prepare(`
    SELECT * FROM sessions
    WHERE session_key = ? OR REPLACE(session_key, '-', '') = ?
    LIMIT 1
  `).get(sessionKey.toUpperCase(), normalized) as Record<string, any> | undefined;
  if (!row) return null;
  return row;
}

export function findSessionByAdminToken(token: string) {
  const hash = hashValue(token);
  const row = db.prepare('SELECT * FROM sessions WHERE admin_token_hash = ?').get(hash) as Record<string, any> | undefined;
  return row ?? null;
}

export function findSessionByKeyHash(sessionKey: string) {
  const hash = hashValue(sessionKey);
  return db.prepare('SELECT * FROM sessions WHERE session_key_hash = ?').get(hash) as Record<string, any> | undefined;
}

export function updateSession(sessionId: string, patch: Record<string, any>) {
  const now = new Date().toISOString();
  const keys = Object.keys(patch);
  if (!keys.length) return findSessionById(sessionId);
  const assignments = keys.map((key) => `${key} = @${key}`).join(', ');
  const params: Record<string, any> = { ...patch, updated_at: now, last_saved_at: now, id: sessionId };
  db.prepare(`UPDATE sessions SET ${assignments}, updated_at = @updated_at, last_saved_at = @last_saved_at WHERE id = @id`).run(params);
  return findSessionById(sessionId);
}

export function saveEvent(sessionId: string, eventType: string, payload: Record<string, any>) {
  db.prepare('INSERT INTO session_events (session_id, event_type, created_at, payload) VALUES (?, ?, ?, ?)')
    .run(sessionId, eventType, new Date().toISOString(), JSON.stringify(payload));
}

export function listSessionBidders(sessionId: string) {
  return db.prepare('SELECT name FROM session_bidders WHERE session_id = ? ORDER BY name COLLATE NOCASE ASC').all(sessionId) as Array<{ name: string }>;
}

export function addSessionBidder(sessionId: string, name: string) {
  db.prepare('INSERT OR IGNORE INTO session_bidders (session_id, name, created_at) VALUES (?, ?, ?)')
    .run(sessionId, name, new Date().toISOString());
  return listSessionBidders(sessionId);
}

export function getSessionEvents(sessionId: string) {
  return db.prepare('SELECT * FROM session_events WHERE session_id = ? ORDER BY id ASC').all(sessionId) as Record<string, any>[];
}

export function listSessions() {
  return db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all() as Record<string, any>[];
}

export function cleanupExpiredSessions() {
  const now = new Date().toISOString();
  db.prepare('DELETE FROM session_events WHERE session_id IN (SELECT id FROM sessions WHERE status != ? AND expires_at < ? OR ended_at IS NOT NULL AND ended_at < ? )')
    .run('active', now, now);
  db.prepare('DELETE FROM sessions WHERE status != ? AND expires_at < ? OR ended_at IS NOT NULL AND ended_at < ?')
    .run('active', now, now);
}

export function getDb() {
  return db;
}
