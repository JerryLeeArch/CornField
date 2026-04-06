import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
export const dataDir = path.join(projectRoot, 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'videoplayer.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relative_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  display_title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  upload_date TEXT,
  original_created_at TEXT,
  duration REAL NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  quality_bucket TEXT NOT NULL DEFAULT 'unknown',
  category TEXT NOT NULL DEFAULT '',
  view_count INTEGER NOT NULL DEFAULT 0,
  thumbnail_path TEXT,
  thumbnail_time REAL,
  is_missing INTEGER NOT NULL DEFAULT 0,
  last_scanned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_videos_search ON videos(display_title, file_name, category);
CREATE INDEX IF NOT EXISTS idx_videos_height ON videos(height);
CREATE INDEX IF NOT EXISTS idx_videos_upload_date ON videos(upload_date);
CREATE INDEX IF NOT EXISTS idx_videos_view_count ON videos(view_count);
CREATE INDEX IF NOT EXISTS idx_videos_is_missing ON videos(is_missing);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS video_tags (
  video_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY(video_id, tag_id),
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE,
  FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS starrings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS video_starrings (
  video_id INTEGER NOT NULL,
  starring_id INTEGER NOT NULL,
  PRIMARY KEY(video_id, starring_id),
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE,
  FOREIGN KEY(starring_id) REFERENCES starrings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 0,
  rated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS timeline_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  timestamp_sec REAL NOT NULL,
  memo TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

function nowIso() {
  return new Date().toISOString();
}

const setSettingStmt = db.prepare(`
  INSERT INTO settings (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');

export function getSetting(key, fallback = null) {
  const row = getSettingStmt.get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  setSettingStmt.run(key, String(value));
}

export function getSettingsObject() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

export function ensureDefaultSettings() {
  if (getSetting('skipSeconds') === null) setSetting('skipSeconds', '10');
  if (getSetting('libraryRows') === null) setSetting('libraryRows', '3');
  if (getSetting('controlsHideMs') === null) setSetting('controlsHideMs', '2500');
}

const insertTagStmt = db.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)');
const selectTagStmt = db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');
const insertVideoTagStmt = db.prepare('INSERT OR IGNORE INTO video_tags(video_id, tag_id) VALUES (?, ?)');

const insertStarringStmt = db.prepare('INSERT OR IGNORE INTO starrings(name) VALUES (?)');
const selectStarringStmt = db.prepare('SELECT id FROM starrings WHERE name = ?');
const insertVideoStarringStmt = db.prepare('INSERT OR IGNORE INTO video_starrings(video_id, starring_id) VALUES (?, ?)');

const deleteVideoTagsStmt = db.prepare('DELETE FROM video_tags WHERE video_id = ?');
const deleteVideoStarringsStmt = db.prepare('DELETE FROM video_starrings WHERE video_id = ?');
const updateVideoTagToPrimaryStmt = db.prepare('UPDATE OR IGNORE video_tags SET tag_id = ? WHERE tag_id = ?');
const deleteTagStmt = db.prepare('DELETE FROM tags WHERE id = ?');
const updateTagNameStmt = db.prepare('UPDATE tags SET name = ? WHERE id = ?');
const selectTagIdByExactNameStmt = db.prepare('SELECT id FROM tags WHERE name = ?');
const deleteSystemShadowVideosStmt = db.prepare("DELETE FROM videos WHERE file_name LIKE '._%' OR relative_path LIKE '%/._%'");
const deleteOrphanTagsStmt = db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM video_tags)');
const deleteOrphanStarringsStmt = db.prepare('DELETE FROM starrings WHERE id NOT IN (SELECT DISTINCT starring_id FROM video_starrings)');

function normalizeEntityName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u02BC\uFF07\u2032]/g, "'")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[\p{Cf}\p{Cc}]/gu, '')
    .replace(/\s*-\s*/g, '-')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizedTagKey(value) {
  return normalizeEntityName(value).toLowerCase();
}

function toTitleCaseWords(value) {
  return normalizeEntityName(value)
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) => {
          if (!part) return part;
          if (/^[A-Z0-9]+$/.test(part) && part.length <= 4) return part;
          return `${part.charAt(0).toLocaleUpperCase()}${part.slice(1).toLocaleLowerCase()}`;
        })
        .join('-')
    )
    .join(' ');
}

function mergeDuplicateTags() {
  const rows = db.prepare('SELECT id, name FROM tags ORDER BY id ASC').all();
  const primaryByKey = new Map();

  for (const row of rows) {
    const key = normalizedTagKey(row.name);
    if (!key) {
      deleteTagStmt.run(row.id);
      continue;
    }

    if (!primaryByKey.has(key)) {
      primaryByKey.set(key, row.id);
      const canonicalName = toTitleCaseWords(row.name);
      if (canonicalName && canonicalName !== row.name) {
        const sameNameRow = selectTagIdByExactNameStmt.get(canonicalName);
        if (!sameNameRow || sameNameRow.id === row.id) {
          updateTagNameStmt.run(canonicalName, row.id);
        }
      }
      continue;
    }

    const primaryId = primaryByKey.get(key);
    updateVideoTagToPrimaryStmt.run(primaryId, row.id);
    deleteTagStmt.run(row.id);
  }
}

export const replaceVideoTags = db.transaction((videoId, rawTags) => {
  deleteVideoTagsStmt.run(videoId);
  const deduped = [];
  const seen = new Set();

  for (const rawTag of rawTags) {
    const normalized = normalizeEntityName(rawTag);
    if (!normalized) continue;
    const key = normalizedTagKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(toTitleCaseWords(normalized));
  }

  for (const tag of deduped) {
    let row = selectTagStmt.get(tag);
    if (!row) {
      insertTagStmt.run(tag);
      row = selectTagStmt.get(tag);
    }
    if (row) {
      insertVideoTagStmt.run(videoId, row.id);
    }
  }
});

export const replaceVideoStarrings = db.transaction((videoId, rawStarrings) => {
  deleteVideoStarringsStmt.run(videoId);
  const starrings = [...new Set(rawStarrings.map((s) => s.trim()).filter(Boolean))];

  for (const starring of starrings) {
    insertStarringStmt.run(starring);
    const row = selectStarringStmt.get(starring);
    if (row) {
      insertVideoStarringStmt.run(videoId, row.id);
    }
  }
});

export function touchVideo(videoId) {
  db.prepare('UPDATE videos SET updated_at = ? WHERE id = ?').run(nowIso(), videoId);
}

export function isoNow() {
  return nowIso();
}

function cleanupSystemShadowVideos() {
  deleteSystemShadowVideosStmt.run();
  deleteOrphanTagsStmt.run();
  deleteOrphanStarringsStmt.run();
}

function ensureCommentRatingColumns() {
  const columns = new Set(db.prepare('PRAGMA table_info(comments)').all().map((row) => row.name));

  if (!columns.has('rating')) {
    db.exec('ALTER TABLE comments ADD COLUMN rating INTEGER NOT NULL DEFAULT 0');
  }

  if (!columns.has('rated_at')) {
    db.exec('ALTER TABLE comments ADD COLUMN rated_at TEXT');
  }
}

ensureDefaultSettings();
ensureCommentRatingColumns();
cleanupSystemShadowVideos();
mergeDuplicateTags();
