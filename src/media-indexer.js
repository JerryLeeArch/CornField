import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import ffmpegPathStatic from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import { db, isoNow } from './db.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const thumbnailRoot = path.join(projectRoot, 'data', 'thumbnails');

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mkv',
  '.webm',
  '.mov',
  '.avi',
  '.m4v',
  '.flv',
  '.wmv',
  '.ts',
  '.m2ts'
]);

function toPosixRelative(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function qualityFromHeight(height) {
  if (height >= 2160) return '2160p+';
  if (height >= 1440) return '1440p+';
  if (height >= 1080) return '1080p+';
  if (height >= 720) return '720p+';
  if (height >= 480) return '480p+';
  if (height > 0) return 'SD';
  return 'unknown';
}

async function ensureLibraryRoot(rootDir) {
  const root = path.resolve(rootDir);
  const stat = await fs.stat(root).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Library root does not exist or is not a directory: ${root}`);
  }
  return root;
}

async function walkVideoFiles(rootDir, currentDir = rootDir, acc = []) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await walkVideoFiles(rootDir, absPath, acc);
      continue;
    }

    if (!entry.isFile()) continue;
    if (entry.name.startsWith('._')) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(ext)) continue;

    const relative = toPosixRelative(path.relative(rootDir, absPath));
    acc.push({ absPath, relative, fileName: entry.name });
  }

  return acc;
}

async function probeVideo(absPath) {
  const ffprobePath = ffprobe?.path;
  if (!ffprobePath) {
    return { width: 0, height: 0, duration: 0, qualityBucket: 'unknown' };
  }

  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-print_format',
      'json',
      absPath
    ]);

    const parsed = JSON.parse(stdout || '{}');
    const videoStream = (parsed.streams || []).find((stream) => stream.codec_type === 'video') || {};
    const width = Number(videoStream.width || 0);
    const height = Number(videoStream.height || 0);
    const duration = Number(parsed.format?.duration || 0);

    return { width, height, duration, qualityBucket: qualityFromHeight(height) };
  } catch {
    return { width: 0, height: 0, duration: 0, qualityBucket: 'unknown' };
  }
}

let ffmpegPathCache;
let quickLookPathCache;

async function resolveFfmpegPath() {
  if (ffmpegPathCache !== undefined) {
    return ffmpegPathCache;
  }

  if (ffmpegPathStatic) {
    try {
      await fs.access(ffmpegPathStatic);
      ffmpegPathCache = ffmpegPathStatic;
      return ffmpegPathCache;
    } catch {
      // continue to other candidates
    }
  }

  const ffprobePath = ffprobe?.path;
  if (ffprobePath) {
    const bundledCandidate = path.join(path.dirname(ffprobePath), process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    try {
      await fs.access(bundledCandidate);
      ffmpegPathCache = bundledCandidate;
      return ffmpegPathCache;
    } catch {
      // no bundled ffmpeg
    }
  }

  try {
    const locatorBin = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await execFileAsync(locatorBin, ['ffmpeg']);
    const firstMatch = String(stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    ffmpegPathCache = firstMatch || null;
    return ffmpegPathCache;
  } catch {
    ffmpegPathCache = null;
    return ffmpegPathCache;
  }
}

async function resolveQuickLookPath() {
  if (quickLookPathCache !== undefined) {
    return quickLookPathCache;
  }

  if (process.platform !== 'darwin') {
    quickLookPathCache = null;
    return quickLookPathCache;
  }

  const quickLookPath = '/usr/bin/qlmanage';

  try {
    await fs.access(quickLookPath);
    quickLookPathCache = quickLookPath;
    return quickLookPathCache;
  } catch {
    quickLookPathCache = null;
    return quickLookPathCache;
  }
}

const selectRelativePathsStmt = db.prepare('SELECT relative_path FROM videos');
const selectVideoByRelativePathStmt = db.prepare('SELECT id, thumbnail_path AS thumbnailPath FROM videos WHERE relative_path = ?');
const updateVideoThumbnailStmt = db.prepare('UPDATE videos SET thumbnail_path = ?, thumbnail_time = ?, updated_at = ? WHERE id = ?');

function calculateScanDiff(files) {
  const existingRows = selectRelativePathsStmt.all();
  const existingSet = new Set(existingRows.map((row) => row.relative_path));
  const currentSet = new Set(files.map((file) => file.relative));
  const addedFiles = files.filter((file) => !existingSet.has(file.relative));
  let deletedCount = 0;

  for (const row of existingRows) {
    if (!currentSet.has(row.relative_path)) {
      deletedCount += 1;
    }
  }

  return {
    addedFiles,
    addedCount: addedFiles.length,
    deletedCount
  };
}

async function captureAutoThumbnailWithFfmpeg(absPath, videoId, durationSec) {
  const ffmpegPath = await resolveFfmpegPath();
  if (!ffmpegPath) {
    return null;
  }

  const centerSec = Number.isFinite(durationSec) && durationSec > 0 ? Math.max(0, durationSec / 2) : 0;
  const outputName = `video-${videoId}-auto-${Date.now()}.jpg`;
  const outputAbsPath = path.join(thumbnailRoot, outputName);

  await fs.mkdir(thumbnailRoot, { recursive: true });

  try {
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss',
      centerSec.toFixed(3),
      '-i',
      absPath,
      '-frames:v',
      '1',
      '-q:v',
      '4',
      outputAbsPath
    ]);

    await fs.access(outputAbsPath);

    return {
      thumbnailPath: `/thumbnails/${outputName}`,
      thumbnailTime: centerSec
    };
  } catch {
    await fs.unlink(outputAbsPath).catch(() => {});
    return null;
  }
}

async function captureAutoThumbnailWithQuickLook(absPath, videoId) {
  const quickLookPath = await resolveQuickLookPath();
  if (!quickLookPath) {
    return null;
  }

  await fs.mkdir(thumbnailRoot, { recursive: true });

  const tempDir = await fs.mkdtemp(path.join(thumbnailRoot, 'ql-thumb-'));
  const outputName = `video-${videoId}-auto-${Date.now()}.png`;
  const outputAbsPath = path.join(thumbnailRoot, outputName);

  try {
    await execFileAsync(quickLookPath, ['-t', '-s', '1024', '-o', tempDir, absPath]);

    const generatedName = (await fs.readdir(tempDir)).find((fileName) => fileName.toLowerCase().endsWith('.png'));
    if (!generatedName) {
      return null;
    }

    await fs.rename(path.join(tempDir, generatedName), outputAbsPath);

    return {
      thumbnailPath: `/thumbnails/${outputName}`,
      thumbnailTime: null
    };
  } catch {
    await fs.unlink(outputAbsPath).catch(() => {});
    return null;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function captureAutoThumbnail(absPath, videoId, durationSec) {
  const ffmpegCapture = await captureAutoThumbnailWithFfmpeg(absPath, videoId, durationSec);
  if (ffmpegCapture) {
    return ffmpegCapture;
  }

  return captureAutoThumbnailWithQuickLook(absPath, videoId);
}

const upsertVideoStmt = db.prepare(`
INSERT INTO videos (
  relative_path,
  file_name,
  display_title,
  original_created_at,
  duration,
  width,
  height,
  quality_bucket,
  last_scanned_at,
  is_missing,
  created_at,
  updated_at
)
VALUES (
  @relativePath,
  @fileName,
  @displayTitle,
  @originalCreatedAt,
  @duration,
  @width,
  @height,
  @qualityBucket,
  @scannedAt,
  0,
  @now,
  @now
)
ON CONFLICT(relative_path) DO UPDATE SET
  file_name = excluded.file_name,
  original_created_at = excluded.original_created_at,
  duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE videos.duration END,
  width = CASE WHEN excluded.width > 0 THEN excluded.width ELSE videos.width END,
  height = CASE WHEN excluded.height > 0 THEN excluded.height ELSE videos.height END,
  quality_bucket = CASE WHEN excluded.height > 0 THEN excluded.quality_bucket ELSE videos.quality_bucket END,
  last_scanned_at = excluded.last_scanned_at,
  is_missing = 0,
  updated_at = excluded.updated_at
`);

export async function previewLibraryScan(libraryRoot) {
  const root = await ensureLibraryRoot(libraryRoot);
  const files = await walkVideoFiles(root);
  const diff = calculateScanDiff(files);

  return {
    scannedCount: files.length,
    addedCount: diff.addedCount,
    deletedCount: diff.deletedCount,
    scannedAt: isoNow()
  };
}

export async function scanLibrary(libraryRoot) {
  const root = await ensureLibraryRoot(libraryRoot);
  const startAt = isoNow();
  const files = await walkVideoFiles(root);
  const diff = calculateScanDiff(files);
  const newFileSet = new Set(diff.addedFiles.map((file) => file.relative));
  let autoThumbnailsCreated = 0;

  for (const file of files) {
    const fileStat = await fs.stat(file.absPath);
    const probed = await probeVideo(file.absPath);
    const displayTitle = path.parse(file.fileName).name;
    const now = isoNow();

    upsertVideoStmt.run({
      relativePath: file.relative,
      fileName: file.fileName,
      displayTitle,
      originalCreatedAt: fileStat.birthtime?.toISOString?.() || fileStat.mtime.toISOString(),
      duration: probed.duration,
      width: probed.width,
      height: probed.height,
      qualityBucket: probed.qualityBucket,
      scannedAt: startAt,
      now
    });

    if (!newFileSet.has(file.relative)) {
      continue;
    }

    const row = selectVideoByRelativePathStmt.get(file.relative);
    if (!row?.id || row.thumbnailPath) {
      continue;
    }

    const captured = await captureAutoThumbnail(file.absPath, row.id, probed.duration);
    if (!captured) {
      continue;
    }

    updateVideoThumbnailStmt.run(captured.thumbnailPath, captured.thumbnailTime, isoNow(), row.id);
    autoThumbnailsCreated += 1;
  }

  db.prepare('DELETE FROM videos WHERE last_scanned_at IS NULL OR last_scanned_at < ?').run(startAt);
  db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM video_tags)').run();
  db.prepare('DELETE FROM starrings WHERE id NOT IN (SELECT DISTINCT starring_id FROM video_starrings)').run();

  return {
    scannedCount: files.length,
    addedCount: diff.addedCount,
    deletedCount: diff.deletedCount,
    autoThumbnailsCreated,
    scannedAt: startAt
  };
}

export function resolveAbsolutePath(libraryRoot, relativePath) {
  return path.resolve(libraryRoot, relativePath);
}
