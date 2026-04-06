# CornField

CornField is a local-first browser video player for personal libraries.  
It keeps your real files on disk, stores app state locally, and gives you a fast browser UI for browsing, tagging, rating, and watching your own video library.

No sample media is bundled in this repository. You point CornField at your own video folder on first use.

## First-Time Setup

1. Install Node.js 20+.
2. Run `npm install` once, or on macOS just double-click `openCornField.command`.
3. Open `Settings` in the app.
4. Set `Library Folder Path` to your real video folder.
5. Click `Scan Library`, review the preview, then continue.
6. Go back to `Home` and start browsing.

## UI Quick Guide

- `Home`: search, sort, quality filters, tags, and starring filters for your library.
- `Video cards`: open the video page, jump through tags/starring, and see average rating at a glance.
- `Video page`: player controls, theater/fullscreen, related videos, timeline notes, and comments.
- `Comments`: leave text only, rating only, or both.
- `Settings`: choose the library folder and run scans when your library changes.

## Requirements

- Node.js 20+ recommended
- macOS, Linux, or Windows with a local browser
- A local or mounted video library folder you want to index
- `ffmpeg` is optional for thumbnail capture; on macOS CornField can also fall back to Quick Look thumbnail generation

## Launching

### macOS

Double-click `openCornField.command`.

It will:
1. Install dependencies on first run
2. Start the local server
3. Open CornField in your browser

If macOS blocks the first launch, open `System Settings > Privacy & Security` and click `Open Anyway`.

Make executable once if needed:

```bash
chmod +x openCornField.command
```

### Terminal

```bash
npm install
npm run dev
```

Open: [http://127.0.0.1:4300](http://127.0.0.1:4300)

## What Stays Local

- Your media files stay in their original folders and are not copied by default.
- App data is stored in `data/videoplayer.db`.
- Generated or uploaded thumbnails are stored in `data/thumbnails/`.
- `data/` is gitignored so your personal library state does not get committed to GitHub.

## Scan Behavior

- New files are added to DB with detected resolution/quality
- Missing files are removed from DB on scan
- Unused tags and starring entries are cleaned up automatically
- Files starting with `._` are ignored during scan/listing
- For newly added videos without a thumbnail, CornField tries to capture a frame near the middle of the video

## Features

- Scan a local folder or mounted NAS path and index videos automatically
- Edit metadata per video: title, description, upload date, category, tags, starring, and view count
- Keep file names as-is by default, with optional real file rename
- Detect quality from resolution (`720p+`, `1080p+`, `1440p+`, etc.)
- Search across title, file name, category, quality, tags, and starring
- Browse related videos based on shared tags, starring, and category
- Leave comments, ratings, and timeline notes
- Upload, capture, or auto-generate thumbnails
- Use keyboard shortcuts and persistent player preferences

## Technical Notes

### Tech Stack

- Backend: Node.js + Fastify
- Database: SQLite (`better-sqlite3`)
- Frontend: Vanilla HTML/CSS/JavaScript
- Media probing: `ffprobe-static`
- Thumbnail extraction for auto-capture: `ffmpeg` when available

### Project Structure

- `src/server.js`: Fastify API, streaming, file operations
- `src/db.js`: SQLite schema, settings, relation helpers
- `src/media-indexer.js`: folder scan, probe, sync, auto-thumbnail logic
- `openCornField.command`: macOS launcher
- `public/index.html`: app shell
- `public/app.js`: UI behavior and API integration
- `public/styles.css`: dark theme styling

### API Overview

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
