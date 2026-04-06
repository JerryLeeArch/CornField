# CornField

CornField is a local-first browser video player for personal libraries.  
It keeps your real files on disk, stores app state locally, and gives you a fast browser UI for browsing, tagging, rating, and watching your own video library.

No sample media is bundled in this repository. You point CornField at your own video folder on first use.

## Requirements

- Node.js 20+ recommended
- macOS
- A local or mounted video library folder you want to index

## Launching

Double-click `openCornField.command`.

If macOS blocks the first launch, open `System Settings > Privacy & Security` and click `Open Anyway`, then launch it again.

It will:
1. Open the official Node.js download page if Node.js is missing
2. Install dependencies on first run
3. Start the local server
4. Open CornField in your browser

Make executable once if needed:

```bash
chmod +x openCornField.command
```

## First-Time Setup

1. Open `Settings`.
2. Set `Library Folder Path` to your real video folder.
3. Click `Scan Library`.

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

### Manual Launch

If you are developing locally or launching without the macOS helper:

```bash
npm install
npm run dev
```

Open: [http://127.0.0.1:4300](http://127.0.0.1:4300)

### Local Data

- Your media files stay in their original folders and are not copied by default.
- App data is stored in `data/videoplayer.db`.
- Generated or uploaded thumbnails are stored in `data/thumbnails/`.
- `data/` is gitignored so your personal library state does not get committed to GitHub.

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
