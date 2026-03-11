# CornField

CornField is a local-first browser video player for personal libraries.  
It keeps your real files on disk, stores metadata in SQLite, and lets you browse/play videos with a modern dark UI.

## Features

- Scan a local folder (or mounted NAS path) and index videos automatically
- Metadata editing per video:
  display title, description, upload date, category, tags, starring, view count
- Keep file name as-is by default, with optional real file rename
- Quality detection from resolution (`720p+`, `1080p+`, `1440p+`, etc.)
- Search across title, file name, category, quality, tags, and starring
- Filter by quality and tags, plus sort options (default: Random)
- Clickable video cards, tag chips, starring pages, and a Video DB admin page
- Related videos based on shared tags/starring/category (plus quality/view tie-breakers)
- Comments (create/edit/delete) with timestamps
- Timeline notes (create/edit/delete) at specific playback times
- Thumbnails:
  upload image, capture current frame, or auto-generate for newly scanned videos
- Player controls:
  play/pause, theater mode, fullscreen, mute/unmute, volume slider
- Persistent player preferences (volume/mute) across videos
- Keyboard shortcuts:
  `ArrowLeft/ArrowRight` (skip), `Space` (play/pause), `F` (fullscreen), `T` (theater)
- Auto-hide playbar with configurable delay
- Scan preview flow with change summary (`n added / n deleted`) and Proceed/Cancel

## Tech Stack

- Backend: Node.js + Fastify
- Database: SQLite (`better-sqlite3`)
- Frontend: Vanilla HTML/CSS/JavaScript
- Media probing: `ffprobe-static`
- Thumbnail extraction for auto-capture: `ffmpeg` (system or bundled binary when available)

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Open: [http://127.0.0.1:4300](http://127.0.0.1:4300)

## Run Without Terminal (macOS)

Double-click `scripts/start-player.command`.

It will:
1. Install dependencies on first run
2. Start the server
3. Open the app in your browser

Make executable once:

```bash
chmod +x scripts/start-player.command
```

## First-Time Setup

1. Open `Settings` (top-right)
2. Set `Library Folder Path` to an absolute path (for example `/Users/you/Videos` or `/Volumes/YourNAS/Media`)
3. Run `Scan Library` (preview changes, then proceed)
4. Browse and play from `Library`

## Scan Behavior

- New files are added to DB with detected resolution/quality
- Missing files are removed from DB on scan
- Unused tags and starring entries are cleaned up automatically
- Files starting with `._` are ignored during scan/listing
- For newly added videos without a thumbnail, CornField tries to capture a frame near the middle of the video

## Project Structure

- `src/server.js`: Fastify API, streaming, file operations
- `src/db.js`: SQLite schema, settings, relation helpers
- `src/media-indexer.js`: folder scan, probe, sync, auto-thumbnail logic
- `public/index.html`: app shell
- `public/app.js`: UI behavior and API integration
- `public/styles.css`: dark theme styling

## API Overview

- `GET /api/settings`, `PUT /api/settings`
- `POST /api/library/scan/preview`, `POST /api/library/scan`
- `GET /api/videos`, `GET /api/videos/admin`, `GET /api/videos/:id`
- `PUT /api/videos/:id/metadata`
- `POST /api/videos/:id/rename`
- `DELETE /api/videos/:id`
- `POST /api/videos/:id/view`
- `GET|POST /api/videos/:id/comments`, `PUT|DELETE /api/comments/:id`
- `GET|POST /api/videos/:id/notes`, `PUT|DELETE /api/notes/:id`
- `POST /api/videos/:id/thumbnail/upload`
- `POST /api/videos/:id/thumbnail/capture`
- `GET /api/videos/:id/related`
- `GET /api/tags`, `GET /api/starrings`
- `GET /media/*` (video streaming)

## Local Data

- DB file: `data/videoplayer.db`
- Thumbnails: `data/thumbnails/`
- Your media folder is not moved or copied by default
