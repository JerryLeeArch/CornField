const mainEl = document.getElementById('main');
const settingsDialog = document.getElementById('settingsDialog');
const settingsForm = document.getElementById('settingsForm');
const libraryRootInput = document.getElementById('libraryRootInput');
const skipSecondsInput = document.getElementById('skipSecondsInput');
const pageSizeInput = document.getElementById('pageSizeInput');
const controlsHideMsInput = document.getElementById('controlsHideMsInput');
const relatedLimitInput = document.getElementById('relatedLimitInput');
const scanNowBtn = document.getElementById('scanNowBtn');
const scanProceedBtn = document.getElementById('scanProceedBtn');
const scanCancelBtn = document.getElementById('scanCancelBtn');
const scanPreviewBox = document.getElementById('scanPreviewBox');
const scanPreviewText = document.getElementById('scanPreviewText');
const closeSettingsBtn = document.getElementById('closeSettings');

const savedVolume = Number(localStorage.getItem('playerVolume'));
const savedMuted = localStorage.getItem('playerMuted');

const initialVolume = Number.isFinite(savedVolume) ? Math.max(0, Math.min(1, savedVolume)) : 1;
const initialMuted = savedMuted === '1';

const state = {
  settings: null,
  route: { name: 'library' },
  filters: {
    q: '',
    qualityMin: '',
    sort: 'random',
    tag: '',
    starring: ''
  },
  page: 1,
  dbFilters: {
    q: '',
    page: 1
  },
  playerPrefs: {
    volume: initialVolume,
    muted: initialMuted
  },
  pendingScanRoot: ''
};

let currentRenderToken = 0;
let cleanups = [];

function cleanupActiveView() {
  for (const fn of cleanups) {
    try {
      fn();
    } catch {
      // ignore cleanup failure
    }
  }
  cleanups = [];
}

function savePlayerPrefs() {
  localStorage.setItem('playerVolume', String(state.playerPrefs.volume));
  localStorage.setItem('playerMuted', state.playerPrefs.muted ? '1' : '0');
}

function addCleanup(fn) {
  cleanups.push(fn);
}

function setHash(hash) {
  if (window.location.hash === hash) {
    renderRoute();
    return;
  }
  window.location.hash = hash;
}

function parseHash() {
  const hash = window.location.hash.replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean);

  if (parts[0] === 'video' && parts[1]) {
    return { name: 'video', id: Number(parts[1]) };
  }

  if (parts[0] === 'tag' && parts[1]) {
    return { name: 'tag', value: decodeURIComponent(parts.slice(1).join('/')) };
  }

  if (parts[0] === 'starring' && parts[1]) {
    return { name: 'starring', value: decodeURIComponent(parts.slice(1).join('/')) };
  }

  if (parts[0] === 'starrings') {
    return { name: 'starrings' };
  }

  if (parts[0] === 'database') {
    return { name: 'database' };
  }

  return { name: 'library' };
}

async function api(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  const hasExplicitBody = Object.prototype.hasOwnProperty.call(options, 'body');
  const body = options.body;
  const isFormDataBody = typeof FormData !== 'undefined' && body instanceof FormData;
  const hasContentTypeHeader = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');

  if (hasExplicitBody && body !== undefined && body !== null && !isFormDataBody && !hasContentTypeHeader) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    headers,
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload.error || 'Request failed';
    throw new Error(message);
  }

  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString();
}

function formatDate(iso) {
  if (!iso) return '-';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString();
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';

  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function firstAvailableDate(video) {
  return video.uploadDate || video.originalCreatedAt;
}

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = isError ? 'warning error' : 'warning';
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.right = '14px';
  toast.style.bottom = '14px';
  toast.style.zIndex = '3000';
  toast.style.maxWidth = '420px';
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2300);
}

async function loadSettings() {
  state.settings = await api('/api/settings');
}

function updateSettingsDialogInputs() {
  libraryRootInput.value = state.settings?.libraryRoot || '';
  skipSecondsInput.value = String(state.settings?.skipSeconds || 10);
  pageSizeInput.value = String(state.settings?.pageSize || 24);
  const controlsHideValue = String(state.settings?.controlsHideMs ?? 2500);
  controlsHideMsInput.value = controlsHideMsInput.querySelector(`option[value="${controlsHideValue}"]`) ? controlsHideValue : '2500';
  relatedLimitInput.value = String(state.settings?.relatedLimit || 12);
  hideScanPreview();
}

async function saveSettingsFromDialog() {
  const payload = {
    libraryRoot: libraryRootInput.value.trim(),
    skipSeconds: Number(skipSecondsInput.value),
    pageSize: Number(pageSizeInput.value),
    controlsHideMs: Number(controlsHideMsInput.value),
    relatedLimit: Number(relatedLimitInput.value)
  };

  const result = await api('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

  state.settings = result.settings;
  showToast('Settings saved');
}

function hideScanPreview() {
  state.pendingScanRoot = '';
  scanPreviewText.textContent = '';
  scanPreviewBox.hidden = true;
}

function showScanPreview(addedCount, deletedCount, rootPath) {
  state.pendingScanRoot = rootPath;
  scanPreviewText.textContent = `${addedCount} videos added / ${deletedCount} videos deleted`;
  scanPreviewBox.hidden = false;
}

function openVideoFromSource(videoId, source) {
  if (!Number.isInteger(videoId) || videoId <= 0) return;
  const shouldIncrementView = source === 'library' || source === 'related';

  if (shouldIncrementView) {
    api(`/api/videos/${videoId}/view`, { method: 'POST' }).catch(() => {
      // ignore view increment failure on navigation click
    });
  }

  setHash(`#/video/${videoId}`);
}

function renderNoLibraryConfigured() {
  mainEl.innerHTML = `
    <div class="warning">
      Library folder is not configured. Open Settings (⚙), set <strong>Library Folder Path</strong>, then run
      <strong>Scan Library</strong>.
    </div>
  `;
}

function createVideoCard(video) {
  const card = document.createElement('article');
  card.className = 'video-card clickable-card';
  card.tabIndex = 0;

  const thumb = video.thumbnailPath
    ? `<img class="thumb" src="${escapeHtml(video.thumbnailPath)}" alt="thumbnail" loading="lazy" />`
    : '<div class="thumb-placeholder"></div>';

  const tags = (video.tags || [])
    .slice(0, 5)
    .map((tag) => `<button class="chip" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`)
    .join('');

  const starrings = (video.starrings || [])
    .slice(0, 3)
    .map((name) => `<button class="chip" data-starring="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
    .join('');

  card.innerHTML = `
    ${thumb}
    <div class="content">
      <h3>${escapeHtml(video.displayTitle || video.fileName)}</h3>
      <div class="meta-row">
        <span>${escapeHtml(video.qualityBucket || 'unknown')}</span>
        <span>${formatDuration(Number(video.duration))}</span>
      </div>
      <div class="meta-row">
        <span>${formatDate(firstAvailableDate(video))}</span>
        <span>Views ${Number(video.viewCount || 0)}</span>
      </div>
      ${video.category ? `<div class="muted">Category: ${escapeHtml(video.category)}</div>` : ''}
      <div class="chips">${tags}</div>
      <div class="chips">${starrings}</div>
    </div>
  `;

  const openCard = () => openVideoFromSource(video.id, 'library');

  card.addEventListener('click', openCard);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openCard();
    }
  });

  card.querySelectorAll('[data-tag]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      const value = event.currentTarget.getAttribute('data-tag');
      setHash(`#/tag/${encodeURIComponent(value)}`);
    });
  });

  card.querySelectorAll('[data-starring]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      const value = event.currentTarget.getAttribute('data-starring');
      setHash(`#/starring/${encodeURIComponent(value)}`);
    });
  });

  return card;
}

function buildLibraryQuery() {
  const q = new URLSearchParams();
  q.set('page', String(state.page));
  q.set('pageSize', String(state.settings?.pageSize || 24));

  if (state.filters.q) q.set('q', state.filters.q);
  if (state.filters.qualityMin) q.set('qualityMin', state.filters.qualityMin);
  if (state.filters.sort) q.set('sort', state.filters.sort);
  if (state.filters.tag) q.set('tag', state.filters.tag);
  if (state.filters.starring) q.set('starring', state.filters.starring);

  return q.toString();
}

async function renderLibraryView(options = {}) {
  const token = currentRenderToken;
  const template = document.getElementById('libraryViewTemplate');
  mainEl.innerHTML = '';
  mainEl.appendChild(template.content.cloneNode(true));

  const searchInput = document.getElementById('searchInput');
  const qualityFilter = document.getElementById('qualityFilter');
  const sortSelect = document.getElementById('sortSelect');
  const applyFiltersBtn = document.getElementById('applyFiltersBtn');
  const tagScroller = document.getElementById('tagScroller');
  const libraryStatus = document.getElementById('libraryStatus');
  const videoGrid = document.getElementById('videoGrid');
  const pager = document.getElementById('pager');

  if (options.lockTag) {
    state.filters.tag = options.lockTag;
    state.filters.starring = '';
  }
  if (options.lockStarring) {
    state.filters.starring = options.lockStarring;
    state.filters.tag = '';
  }

  searchInput.value = state.filters.q;
  qualityFilter.value = state.filters.qualityMin;
  sortSelect.value = state.filters.sort;

  const applyFilters = () => {
    state.page = 1;
    const scopedTag = options.lockTag || state.filters.tag || '';
    const scopedStarring = options.lockStarring || state.filters.starring || '';
    state.filters = {
      q: searchInput.value.trim(),
      qualityMin: qualityFilter.value,
      sort: sortSelect.value,
      tag: scopedTag,
      starring: scopedStarring
    };
    renderRoute();
  };

  applyFiltersBtn.addEventListener('click', applyFilters);

  [searchInput, qualityFilter, sortSelect].forEach((el) => {
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') applyFilters();
    });
  });

  tagScroller.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        tagScroller.scrollLeft += event.deltaY;
      }
    },
    { passive: false }
  );

  libraryStatus.textContent = 'Loading videos...';

  try {
    const queryString = buildLibraryQuery();
    const [data, tagsData] = await Promise.all([api(`/api/videos?${queryString}`), api('/api/tags')]);
    if (token !== currentRenderToken) return;

    const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
    state.page = Math.min(data.page, totalPages);

    tagScroller.innerHTML = '';
    const allTagBtn = document.createElement('button');
    allTagBtn.className = `tag-filter-btn ${!state.filters.tag ? 'is-active' : ''}`;
    allTagBtn.textContent = 'All Tags';
    allTagBtn.addEventListener('click', () => {
      state.page = 1;
      state.filters.tag = '';
      renderRoute();
    });
    tagScroller.appendChild(allTagBtn);

    (tagsData.items || []).forEach((tagItem) => {
      const btn = document.createElement('button');
      btn.className = `tag-filter-btn ${state.filters.tag === tagItem.name ? 'is-active' : ''}`;
      btn.textContent = `${tagItem.name} (${tagItem.videoCount})`;
      btn.addEventListener('click', () => {
        state.page = 1;
        state.filters.tag = tagItem.name;
        renderRoute();
      });
      tagScroller.appendChild(btn);
    });

    const hints = [];
    if (state.filters.tag) hints.push(`Tag: ${state.filters.tag}`);
    if (state.filters.starring) hints.push(`Starring: ${state.filters.starring}`);
    const routeHint = hints.join(' | ');

    libraryStatus.textContent = `${data.total} videos | page ${state.page}/${totalPages}${routeHint ? ` | ${routeHint}` : ''}`;

    if (data.items.length === 0) {
      videoGrid.innerHTML = '<div class="warning">No videos matched your filters.</div>';
    } else {
      videoGrid.innerHTML = '';
      data.items.forEach((video, index) => {
        const card = createVideoCard(video);
        card.style.setProperty('--stagger', String(index));
        videoGrid.appendChild(card);
      });
    }

    pager.innerHTML = '';
    const prevBtn = document.createElement('button');
    prevBtn.textContent = 'Prev';
    prevBtn.disabled = state.page <= 1;
    prevBtn.addEventListener('click', () => {
      state.page -= 1;
      renderRoute();
    });

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
    nextBtn.disabled = state.page >= totalPages;
    nextBtn.addEventListener('click', () => {
      state.page += 1;
      renderRoute();
    });

    const pageLabel = document.createElement('span');
    pageLabel.textContent = `Page ${state.page} / ${totalPages}`;

    pager.append(prevBtn, pageLabel, nextBtn);
  } catch (error) {
    libraryStatus.innerHTML = `<span class="error">${escapeHtml(error.message)}</span>`;
  }
}

function createRelatedCard(video) {
  const wrapper = document.createElement('article');
  wrapper.className = 'video-card clickable-card';
  wrapper.tabIndex = 0;
  wrapper.innerHTML = `
    ${
      video.thumbnailPath
        ? `<img class="thumb" src="${escapeHtml(video.thumbnailPath)}" alt="thumbnail" loading="lazy" />`
        : '<div class="thumb-placeholder"></div>'
    }
    <div class="content">
      <h3>${escapeHtml(video.displayTitle || video.fileName)}</h3>
      <div class="muted">${escapeHtml(video.qualityBucket || 'unknown')} · Views ${Number(video.viewCount || 0)}</div>
    </div>
  `;
  const openCard = () => {
    openVideoFromSource(video.id, 'related');
  };
  wrapper.addEventListener('click', openCard);
  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openCard();
    }
  });
  return wrapper;
}

async function renderVideoView(videoId) {
  const token = currentRenderToken;
  mainEl.innerHTML = '<div class="status">Loading video...</div>';

  try {
    const relatedLimit = Number(state.settings?.relatedLimit || 12);
    const relatedLimitSafe = Number.isInteger(relatedLimit) ? Math.max(1, Math.min(48, relatedLimit)) : 12;

    const [videoRes, commentsRes, notesRes, relatedRes] = await Promise.all([
      api(`/api/videos/${videoId}`),
      api(`/api/videos/${videoId}/comments`),
      api(`/api/videos/${videoId}/notes`),
      api(`/api/videos/${videoId}/related?limit=${relatedLimitSafe}`)
    ]);

    if (token !== currentRenderToken) return;

    const video = videoRes.video;
    const comments = commentsRes.items || [];
    const notes = notesRes.items || [];
    const related = relatedRes.items || [];

    const tagsHtml = (video.tags || [])
      .map((tag) => `<button class="chip" data-video-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`)
      .join('');

    const starringsHtml = (video.starrings || [])
      .map((name) => `<button class="chip" data-video-starring="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
      .join('');

    const commentsHtml = comments
      .map(
        (comment) => `
        <div class="comment-item" data-comment-id="${comment.id}">
          <div>${escapeHtml(comment.content)}</div>
          <div class="muted">${formatDateTime(comment.createdAt)}</div>
          <div class="row-actions">
            <button data-comment-edit="${comment.id}">Edit</button>
            <button data-comment-delete="${comment.id}">Delete</button>
          </div>
        </div>
      `
      )
      .join('');

    const notesHtml = notes
      .map(
        (note) => `
        <div class="note-item" data-note-id="${note.id}">
          <div><strong>${formatDuration(note.timestampSec)}</strong> - ${escapeHtml(note.memo)}</div>
          <div class="muted">${formatDateTime(note.createdAt)}</div>
          <div class="row-actions">
            <button data-note-jump="${note.id}">Jump</button>
            <button data-note-edit="${note.id}">Edit</button>
            <button data-note-delete="${note.id}">Delete</button>
          </div>
        </div>
      `
      )
      .join('');

    mainEl.innerHTML = `
      <section class="player-panel">
        <div class="player-shell" id="playerShell">
          <video id="videoEl" src="${escapeHtml(video.mediaUrl)}" preload="metadata"></video>
          <div class="player-controls" id="playerControls">
            <div class="progress-wrap">
              <input id="progressRange" class="progress" type="range" min="0" max="1000" value="0" step="1" />
              <div id="noteMarkerLayer" class="note-marker-layer"></div>
            </div>
            <div class="control-row">
              <button id="playPauseBtn">Play</button>
              <button id="theaterBtn">Theater</button>
              <button id="fullscreenBtn">Fullscreen</button>
              <button id="muteBtn">Mute</button>
              <input id="volumeRange" class="volume-slider" type="range" min="0" max="1" step="0.01" value="1" />
              <span id="timeLabel" class="time-label">00:00 / --:--</span>
            </div>
          </div>
        </div>
        <div class="panel-body">
          <h2 class="section-title">${escapeHtml(video.displayTitle || video.fileName)}</h2>
          <div class="muted">${escapeHtml(video.fileName)}</div>
          <div class="meta-row" style="margin-top: .55rem;">
            <span>${escapeHtml(video.qualityBucket || 'unknown')} (${video.width || 0}x${video.height || 0})</span>
            <span>Views ${video.viewCount || 0}</span>
            <span>Upload ${formatDate(firstAvailableDate(video))}</span>
          </div>
          <div class="chips" style="margin-top: .6rem;">${tagsHtml}</div>
          <div class="chips" style="margin-top: .35rem;">${starringsHtml}</div>
        </div>
      </section>

      <section class="section-panel" style="margin-top: 1rem;">
        <div class="panel-body">
          <h3 class="section-title">Related Videos</h3>
          <div id="relatedGrid" class="video-grid compact-grid" style="margin-top: .75rem;"></div>
        </div>
      </section>

      <section class="section-panel" style="margin-top: 1rem;">
        <div class="panel-body">
          <h3 class="section-title">Comments</h3>
          <form id="commentForm" class="form-grid comments-editor" style="margin-top: .7rem;">
            <textarea id="commentInput" class="wide-comment-input" placeholder="Write a comment"></textarea>
            <button type="submit" class="primary">Add Comment</button>
          </form>
          <div class="list-block" id="commentsList">${commentsHtml || '<div class="muted">No comments yet.</div>'}</div>
        </div>
      </section>

      <section class="section-panel" style="margin-top: 1rem;">
        <div class="panel-body">
          <h3 class="section-title">Video Metadata</h3>
          <button id="metaToggleBtn" class="subtle-btn" type="button">Edit Video Data</button>

          <div id="metaEditor" class="collapsible">
            <form id="metaForm" class="form-grid meta-editor-form">
              <label>View Count <input id="metaViewCount" type="number" min="0" value="${Number(video.viewCount || 0)}" /></label>
              <label>Tags (comma separated) <input id="metaTags" value="${escapeHtml((video.tags || []).join(', '))}" /></label>
              <label>Category <input id="metaCategory" value="${escapeHtml(video.category || '')}" /></label>
              <label>Starring (comma separated) <input id="metaStarrings" value="${escapeHtml((video.starrings || []).join(', '))}" /></label>
              <label>Upload Date <input id="metaUploadDate" type="date" value="${escapeHtml((video.uploadDate || '').slice(0, 10))}" /></label>
              <label>Display Title <input id="metaTitle" value="${escapeHtml(video.displayTitle || '')}" required /></label>
              <label>Description <textarea id="metaDescription">${escapeHtml(video.description || '')}</textarea></label>
              <button type="submit" class="primary">Save Metadata</button>
            </form>

            <hr />

            <form id="renameForm" class="form-grid meta-editor-form">
              <label>Rename Real File
                <input id="renameInput" value="${escapeHtml(video.fileName)}" />
              </label>
              <button type="submit">Rename File</button>
            </form>

            <hr />

            <div class="form-grid meta-editor-form">
              <label>Upload Thumbnail
                <input id="thumbnailUploadInput" type="file" accept="image/png,image/jpeg,image/webp" />
              </label>
              <button id="captureThumbnailBtn">Use Current Frame as Thumbnail</button>
            </div>
          </div>
        </div>
      </section>

      <section class="section-panel" style="margin-top: 1rem;">
        <div class="panel-body">
          <h3 class="section-title">Timeline Notes</h3>
          <button id="noteToggleBtn" class="subtle-btn" type="button">Add Timeline Note</button>
          <div id="noteFormWrap" class="collapsible">
            <form id="noteForm" class="form-grid">
              <label>Timestamp (seconds)
                <input id="noteTimestampInput" type="number" min="0" step="0.1" placeholder="You can fill this with current playback time" />
              </label>
              <textarea id="noteMemoInput" placeholder="Memo for this timestamp"></textarea>
              <div class="row-actions">
                <button type="button" id="fillCurrentTimeBtn">Use Current Time</button>
                <button type="submit" class="primary">Add Note</button>
              </div>
            </form>
          </div>
          <div class="list-block" id="notesList">${notesHtml || '<div class="muted">No timeline notes yet.</div>'}</div>
        </div>
      </section>
    `;

    const relatedGrid = document.getElementById('relatedGrid');
    if (related.length === 0) {
      relatedGrid.innerHTML = '<div class="muted">No related videos found.</div>';
    } else {
      related.forEach((rv, index) => {
        const card = createRelatedCard(rv);
        card.style.setProperty('--stagger', String(index));
        relatedGrid.appendChild(card);
      });
    }

    const videoEl = document.getElementById('videoEl');
    const playerShell = document.getElementById('playerShell');
    const playerControls = document.getElementById('playerControls');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const theaterBtn = document.getElementById('theaterBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const muteBtn = document.getElementById('muteBtn');
    const volumeRange = document.getElementById('volumeRange');
    const progressRange = document.getElementById('progressRange');
    const noteMarkerLayer = document.getElementById('noteMarkerLayer');
    const timeLabel = document.getElementById('timeLabel');

    let hideTimer = null;
    const controlsHideMsRaw = Number(state.settings?.controlsHideMs ?? 2500);
    const controlsHideMs = Number.isFinite(controlsHideMsRaw) ? controlsHideMsRaw : 2500;

    function showControls() {
      playerControls.classList.remove('hidden');
      if (hideTimer) clearTimeout(hideTimer);
      if (!videoEl.paused && controlsHideMs !== 0) {
        hideTimer = setTimeout(() => {
          playerControls.classList.add('hidden');
        }, controlsHideMs);
      }
    }

    function updateTimeLabel() {
      timeLabel.textContent = `${formatDuration(videoEl.currentTime)} / ${formatDuration(videoEl.duration)}`;
    }

    function updateMuteButtonLabel() {
      muteBtn.textContent = videoEl.muted || videoEl.volume === 0 ? 'Unmute' : 'Mute';
    }

    function syncProgressFromVideo() {
      if (!Number.isFinite(videoEl.duration) || videoEl.duration <= 0) {
        progressRange.value = '0';
      } else {
        progressRange.value = String(Math.round((videoEl.currentTime / videoEl.duration) * 1000));
      }
      updateTimeLabel();
    }

    function renderNoteMarkers() {
      noteMarkerLayer.innerHTML = '';
      if (!Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return;

      notes.forEach((note) => {
        const pos = (note.timestampSec / videoEl.duration) * 100;
        if (!Number.isFinite(pos)) return;
        const marker = document.createElement('span');
        marker.className = 'note-marker';
        marker.style.left = `${Math.max(0, Math.min(100, pos))}%`;
        marker.title = `${formatDuration(note.timestampSec)} - ${note.memo}`;
        noteMarkerLayer.appendChild(marker);
      });
    }

    function skipBy(delta) {
      if (!Number.isFinite(videoEl.duration)) return;
      const next = Math.max(0, Math.min(videoEl.duration, videoEl.currentTime + delta));
      videoEl.currentTime = next;
      syncProgressFromVideo();
    }

    function toggleTheaterMode() {
      playerShell.classList.toggle('theater');
    }

    function requestPlay() {
      videoEl.play().catch((error) => {
        if (error?.name === 'NotSupportedError') {
          showToast('Unsupported source. Try Scan Library to refresh stale entries.', true);
        } else {
          showToast(error?.message || 'Failed to play this video.', true);
        }
      });
    }

    videoEl.volume = state.playerPrefs.volume;
    videoEl.muted = state.playerPrefs.muted;
    volumeRange.value = String(state.playerPrefs.volume);
    updateMuteButtonLabel();

    showControls();

    videoEl.addEventListener('loadedmetadata', () => {
      syncProgressFromVideo();
      renderNoteMarkers();
      volumeRange.value = String(videoEl.volume);
      updateMuteButtonLabel();
    });

    videoEl.addEventListener('timeupdate', syncProgressFromVideo);
    videoEl.addEventListener('play', () => {
      playPauseBtn.textContent = 'Pause';
      showControls();
    });

    videoEl.addEventListener('pause', () => {
      playPauseBtn.textContent = 'Play';
      showControls();
    });

    playPauseBtn.addEventListener('click', () => {
      if (videoEl.paused) {
        requestPlay();
      } else {
        videoEl.pause();
      }
    });

    progressRange.addEventListener('input', () => {
      if (!Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return;
      const next = (Number(progressRange.value) / 1000) * videoEl.duration;
      videoEl.currentTime = next;
      syncProgressFromVideo();
    });

    theaterBtn.addEventListener('click', toggleTheaterMode);

    fullscreenBtn.addEventListener('click', async () => {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerShell.requestFullscreen();
      }
    });

    volumeRange.addEventListener('input', () => {
      const nextVolume = Number(volumeRange.value);
      videoEl.volume = Math.max(0, Math.min(1, nextVolume));
      if (videoEl.volume > 0 && videoEl.muted) {
        videoEl.muted = false;
      }
      state.playerPrefs.volume = videoEl.volume;
      state.playerPrefs.muted = videoEl.muted;
      savePlayerPrefs();
      updateMuteButtonLabel();
    });

    muteBtn.addEventListener('click', () => {
      videoEl.muted = !videoEl.muted;
      state.playerPrefs.muted = videoEl.muted;
      savePlayerPrefs();
      updateMuteButtonLabel();
    });

    videoEl.addEventListener('volumechange', () => {
      if (!videoEl.muted) {
        volumeRange.value = String(videoEl.volume);
      }
      state.playerPrefs.volume = videoEl.volume;
      state.playerPrefs.muted = videoEl.muted;
      savePlayerPrefs();
      updateMuteButtonLabel();
    });

    playerShell.addEventListener('mousemove', showControls);
    playerShell.addEventListener('mouseenter', showControls);

    const keyboardHandler = (event) => {
      const targetTag = (event.target?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select', 'button'].includes(targetTag)) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        skipBy(-state.settings.skipSeconds);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        skipBy(state.settings.skipSeconds);
      } else if (event.key === ' ') {
        event.preventDefault();
        if (videoEl.paused) requestPlay();
        else videoEl.pause();
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          playerShell.requestFullscreen();
        }
      } else if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        toggleTheaterMode();
      }
    };

    window.addEventListener('keydown', keyboardHandler);
    addCleanup(() => window.removeEventListener('keydown', keyboardHandler));

    const metaToggleBtn = document.getElementById('metaToggleBtn');
    const metaEditor = document.getElementById('metaEditor');
    metaToggleBtn.addEventListener('click', () => {
      const open = metaEditor.classList.toggle('open');
      metaToggleBtn.textContent = open ? 'Close Video Data Editor' : 'Edit Video Data';
    });

    const metaForm = document.getElementById('metaForm');
    metaForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api(`/api/videos/${videoId}/metadata`, {
          method: 'PUT',
          body: JSON.stringify({
            displayTitle: document.getElementById('metaTitle').value.trim(),
            description: document.getElementById('metaDescription').value.trim(),
            uploadDate: document.getElementById('metaUploadDate').value,
            category: document.getElementById('metaCategory').value.trim(),
            viewCount: Number(document.getElementById('metaViewCount').value || 0),
            tags: document.getElementById('metaTags').value
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean),
            starrings: document.getElementById('metaStarrings').value
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
          })
        });
        showToast('Metadata saved');
        renderRoute();
      } catch (error) {
        showToast(error.message, true);
      }
    });

    const renameForm = document.getElementById('renameForm');
    renameForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api(`/api/videos/${videoId}/rename`, {
          method: 'POST',
          body: JSON.stringify({
            newFileName: document.getElementById('renameInput').value.trim()
          })
        });
        showToast('File renamed');
        renderRoute();
      } catch (error) {
        showToast(error.message, true);
      }
    });

    const thumbnailUploadInput = document.getElementById('thumbnailUploadInput');
    thumbnailUploadInput.addEventListener('change', async () => {
      const file = thumbnailUploadInput.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`/api/videos/${videoId}/thumbnail/upload`, {
          method: 'POST',
          body: formData
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Thumbnail upload failed');

        showToast('Thumbnail uploaded');
        renderRoute();
      } catch (error) {
        showToast(error.message, true);
      }
    });

    const captureBtn = document.getElementById('captureThumbnailBtn');
    captureBtn.addEventListener('click', async () => {
      if (!videoEl.videoWidth || !videoEl.videoHeight) {
        showToast('Load video metadata first.', true);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

      try {
        await api(`/api/videos/${videoId}/thumbnail/capture`, {
          method: 'POST',
          body: JSON.stringify({
            dataUrl,
            timestampSec: videoEl.currentTime
          })
        });

        showToast('Thumbnail captured');
        renderRoute();
      } catch (error) {
        showToast(error.message, true);
      }
    });

    const commentForm = document.getElementById('commentForm');
    commentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.getElementById('commentInput');
      const content = input.value.trim();
      if (!content) return;

      try {
        await api(`/api/videos/${videoId}/comments`, {
          method: 'POST',
          body: JSON.stringify({ content })
        });
        showToast('Comment added');
        renderRoute();
      } catch (error) {
        showToast(error.message, true);
      }
    });

    document.querySelectorAll('[data-comment-edit]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const id = Number(event.currentTarget.getAttribute('data-comment-edit'));
        const current = comments.find((item) => item.id === id);
        const next = prompt('Edit comment', current?.content || '');
        if (next === null) return;

        try {
          await api(`/api/comments/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ content: next })
          });
          showToast('Comment updated');
          renderRoute();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    document.querySelectorAll('[data-comment-delete]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const id = Number(event.currentTarget.getAttribute('data-comment-delete'));
        if (!confirm('Delete this comment?')) return;

        try {
          await api(`/api/comments/${id}`, { method: 'DELETE' });
          showToast('Comment deleted');
          renderRoute();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    const noteTimestampInput = document.getElementById('noteTimestampInput');
    const noteMemoInput = document.getElementById('noteMemoInput');
    const fillCurrentTimeBtn = document.getElementById('fillCurrentTimeBtn');
    const noteToggleBtn = document.getElementById('noteToggleBtn');
    const noteFormWrap = document.getElementById('noteFormWrap');

    noteToggleBtn.addEventListener('click', () => {
      const open = noteFormWrap.classList.toggle('open');
      noteToggleBtn.textContent = open ? 'Close Timeline Note Editor' : 'Add Timeline Note';
    });

    fillCurrentTimeBtn.addEventListener('click', () => {
      noteTimestampInput.value = videoEl.currentTime.toFixed(1);
    });

    document.getElementById('noteForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const timestampSec = Number(noteTimestampInput.value || videoEl.currentTime || 0);
      const memo = noteMemoInput.value.trim();
      if (!memo) {
        showToast('Enter note content.', true);
        return;
      }

      try {
        await api(`/api/videos/${videoId}/notes`, {
          method: 'POST',
          body: JSON.stringify({ timestampSec, memo })
        });
        showToast('Note added');
        renderRoute();
      } catch (error) {
        showToast(error.message, true);
      }
    });

    document.querySelectorAll('[data-note-jump]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const id = Number(event.currentTarget.getAttribute('data-note-jump'));
        const note = notes.find((item) => item.id === id);
        if (!note) return;
        videoEl.currentTime = Number(note.timestampSec || 0);
        requestPlay();
      });
    });

    document.querySelectorAll('[data-note-edit]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const id = Number(event.currentTarget.getAttribute('data-note-edit'));
        const current = notes.find((item) => item.id === id);
        if (!current) return;

        const timestampRaw = prompt('Timestamp (seconds)', String(current.timestampSec));
        if (timestampRaw === null) return;
        const memo = prompt('Memo', current.memo || '');
        if (memo === null) return;

        try {
          await api(`/api/notes/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              timestampSec: Number(timestampRaw),
              memo
            })
          });
          showToast('Note updated');
          renderRoute();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    document.querySelectorAll('[data-note-delete]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const id = Number(event.currentTarget.getAttribute('data-note-delete'));
        if (!confirm('Delete this note?')) return;

        try {
          await api(`/api/notes/${id}`, { method: 'DELETE' });
          showToast('Note deleted');
          renderRoute();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    document.querySelectorAll('[data-video-tag]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const tag = event.currentTarget.getAttribute('data-video-tag');
        setHash(`#/tag/${encodeURIComponent(tag)}`);
      });
    });

    document.querySelectorAll('[data-video-starring]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const name = event.currentTarget.getAttribute('data-video-starring');
        setHash(`#/starring/${encodeURIComponent(name)}`);
      });
    });

    addCleanup(() => {
      if (hideTimer) clearTimeout(hideTimer);
      videoEl.pause();
    });
  } catch (error) {
    if (token !== currentRenderToken) return;
    mainEl.innerHTML = `<div class="warning error">${escapeHtml(error.message)}</div>`;
  }
}

async function renderStarringsView() {
  mainEl.innerHTML = '<div class="status">Loading starrings...</div>';

  try {
    const data = await api('/api/starrings');

    const itemsHtml = (data.items || [])
      .map(
        (item) => `
          <div class="starring-item">
            <div><strong>${escapeHtml(item.name)}</strong></div>
            <div class="muted">${item.videoCount} videos</div>
            <button data-open-starring="${escapeHtml(item.name)}" style="margin-top: .45rem;">Open</button>
          </div>
        `
      )
      .join('');

    mainEl.innerHTML = `
      <section class="section-panel">
        <div class="panel-body">
          <h2 class="section-title">Starring</h2>
          <div class="starring-list" style="margin-top: .9rem;">
            ${itemsHtml || '<div class="muted">No starring data yet.</div>'}
          </div>
        </div>
      </section>
    `;

    document.querySelectorAll('[data-open-starring]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const value = event.currentTarget.getAttribute('data-open-starring');
        setHash(`#/starring/${encodeURIComponent(value)}`);
      });
    });
  } catch (error) {
    mainEl.innerHTML = `<div class="warning error">${escapeHtml(error.message)}</div>`;
  }
}

async function renderDatabaseView() {
  const token = currentRenderToken;
  mainEl.innerHTML = '<div class="status">Loading video database...</div>';

  try {
    const query = new URLSearchParams();
    query.set('page', String(state.dbFilters.page || 1));
    query.set('pageSize', '120');
    if (state.dbFilters.q) {
      query.set('q', state.dbFilters.q);
    }

    const data = await api(`/api/videos/admin?${query.toString()}`);
    if (token !== currentRenderToken) return;

    const totalPages = Math.max(1, Math.ceil((data.total || 0) / data.pageSize));
    state.dbFilters.page = Math.min(state.dbFilters.page, totalPages);

    const rowsHtml = (data.items || [])
      .map(
        (item) => `
          <tr data-video-id="${item.id}">
            <td>${item.id}</td>
            <td><input data-db-title value="${escapeHtml(item.displayTitle || '')}" /></td>
            <td>${escapeHtml(item.fileName || '')}</td>
            <td><input data-db-category value="${escapeHtml(item.category || '')}" /></td>
            <td>${escapeHtml(item.qualityBucket || 'unknown')}</td>
            <td><input data-db-views type="number" min="0" value="${Number(item.viewCount || 0)}" /></td>
            <td>${formatDate(item.uploadDate || item.originalCreatedAt)}</td>
            <td class="db-actions">
              <button data-db-save>Save</button>
              <button data-db-open>Open</button>
              <button class="danger-btn" data-db-delete>Delete</button>
            </td>
          </tr>
        `
      )
      .join('');

    mainEl.innerHTML = `
      <section class="section-panel">
        <div class="panel-body">
          <h2 class="section-title">Video DB</h2>
          <div class="db-toolbar">
            <input id="dbSearchInput" type="search" placeholder="Search title, file, category, tag, starring..." value="${escapeHtml(state.dbFilters.q || '')}" />
            <button id="dbApplyBtn" class="primary">Search</button>
            <button id="dbRefreshBtn">Refresh</button>
          </div>
          <div class="status">${data.total} rows | page ${state.dbFilters.page}/${totalPages}</div>
          <div class="table-scroll">
            <table class="db-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Display Title</th>
                  <th>File Name</th>
                  <th>Category</th>
                  <th>Quality</th>
                  <th>Views</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="8" class="muted">No videos found.</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="pager">
            <button id="dbPrevBtn" ${state.dbFilters.page <= 1 ? 'disabled' : ''}>Prev</button>
            <span>Page ${state.dbFilters.page} / ${totalPages}</span>
            <button id="dbNextBtn" ${state.dbFilters.page >= totalPages ? 'disabled' : ''}>Next</button>
          </div>
        </div>
      </section>
    `;

    const dbSearchInput = document.getElementById('dbSearchInput');
    const applySearch = () => {
      state.dbFilters.q = dbSearchInput.value.trim();
      state.dbFilters.page = 1;
      renderRoute();
    };

    document.getElementById('dbApplyBtn').addEventListener('click', applySearch);
    document.getElementById('dbRefreshBtn').addEventListener('click', () => renderRoute());
    dbSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') applySearch();
    });

    document.getElementById('dbPrevBtn').addEventListener('click', () => {
      state.dbFilters.page = Math.max(1, state.dbFilters.page - 1);
      renderRoute();
    });
    document.getElementById('dbNextBtn').addEventListener('click', () => {
      state.dbFilters.page = Math.min(totalPages, state.dbFilters.page + 1);
      renderRoute();
    });

    document.querySelectorAll('[data-db-open]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const tr = event.currentTarget.closest('tr');
        const videoId = Number(tr?.dataset.videoId || 0);
        if (videoId > 0) setHash(`#/video/${videoId}`);
      });
    });

    document.querySelectorAll('[data-db-save]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const tr = event.currentTarget.closest('tr');
        const videoId = Number(tr?.dataset.videoId || 0);
        const displayTitle = tr.querySelector('[data-db-title]')?.value?.trim() || '';
        const category = tr.querySelector('[data-db-category]')?.value?.trim() || '';
        const viewCount = Number(tr.querySelector('[data-db-views]')?.value || 0);

        if (!videoId || !displayTitle) {
          showToast('Display title is required.', true);
          return;
        }

        try {
          await api(`/api/videos/${videoId}/metadata`, {
            method: 'PUT',
            body: JSON.stringify({ displayTitle, category, viewCount })
          });
          showToast('Row updated');
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    document.querySelectorAll('[data-db-delete]').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const tr = event.currentTarget.closest('tr');
        const videoId = Number(tr?.dataset.videoId || 0);
        if (!videoId) return;

        if (!confirm('Delete this video file and DB row?')) return;

        try {
          await api(`/api/videos/${videoId}`, {
            method: 'DELETE',
            body: JSON.stringify({ deleteFile: true })
          });
          showToast('Video deleted');
          renderRoute();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });
  } catch (error) {
    if (token !== currentRenderToken) return;
    mainEl.innerHTML = `<div class="warning error">${escapeHtml(error.message)}</div>`;
  }
}

async function renderRoute() {
  currentRenderToken += 1;
  cleanupActiveView();
  state.route = parseHash();

  if (!state.settings) {
    try {
      await loadSettings();
    } catch (error) {
      mainEl.innerHTML = `<div class="warning error">${escapeHtml(error.message)}</div>`;
      return;
    }
  }

  if (!state.settings.libraryRoot && !['starrings', 'database'].includes(state.route.name)) {
    renderNoLibraryConfigured();
    return;
  }

  if (state.route.name === 'video') {
    if (!Number.isInteger(state.route.id) || state.route.id <= 0) {
      mainEl.innerHTML = '<div class="warning error">Invalid video id.</div>';
      return;
    }

    await renderVideoView(state.route.id);
    return;
  }

  if (state.route.name === 'starrings') {
    await renderStarringsView();
    return;
  }

  if (state.route.name === 'database') {
    await renderDatabaseView();
    return;
  }

  if (state.route.name === 'tag') {
    state.page = 1;
    await renderLibraryView({ lockTag: state.route.value });
    return;
  }

  if (state.route.name === 'starring') {
    state.page = 1;
    await renderLibraryView({ lockStarring: state.route.value });
    return;
  }

  state.filters.starring = '';
  await renderLibraryView();
}

function setupGlobalEvents() {
  const goLibraryHome = () => {
    state.page = 1;
    state.filters.q = '';
    state.filters.tag = '';
    state.filters.starring = '';
    setHash('#/library');
  };

  document.getElementById('goLibrary').addEventListener('click', goLibraryHome);
  document.getElementById('navLibrary').addEventListener('click', goLibraryHome);
  document.getElementById('navStarrings').addEventListener('click', () => setHash('#/starrings'));
  document.getElementById('navDatabase').addEventListener('click', () => setHash('#/database'));

  document.getElementById('openSettings').addEventListener('click', async () => {
    if (!state.settings) {
      await loadSettings();
    }
    updateSettingsDialogInputs();
    settingsDialog.showModal();
  });

  closeSettingsBtn.addEventListener('click', () => {
    hideScanPreview();
    settingsDialog.close();
  });

  settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      await saveSettingsFromDialog();
      hideScanPreview();
      settingsDialog.close();
      state.page = 1;
      renderRoute();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  const runLibraryScan = async (root) => {
    const finalRoot = String(root || '').trim();
    if (!finalRoot) {
      showToast('Please enter Library Folder Path.', true);
      return;
    }

    try {
      scanNowBtn.disabled = true;
      scanProceedBtn.disabled = true;
      scanCancelBtn.disabled = true;
      scanNowBtn.textContent = 'Scanning...';
      const scanResult = await api('/api/library/scan', {
        method: 'POST',
        body: JSON.stringify({ libraryRoot: finalRoot })
      });
      await loadSettings();
      updateSettingsDialogInputs();
      hideScanPreview();
      showToast(
        `Library scan complete (${Number(scanResult.addedCount || 0)} added / ${Number(scanResult.deletedCount || 0)} deleted)`
      );
      renderRoute();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      scanNowBtn.disabled = false;
      scanProceedBtn.disabled = false;
      scanCancelBtn.disabled = false;
      scanNowBtn.textContent = 'Scan Library';
    }
  };

  scanNowBtn.addEventListener('click', async () => {
    const root = libraryRootInput.value.trim();
    if (!root) {
      showToast('Please enter Library Folder Path.', true);
      return;
    }

    try {
      scanNowBtn.disabled = true;
      scanNowBtn.textContent = 'Checking...';
      const preview = await api('/api/library/scan/preview', {
        method: 'POST',
        body: JSON.stringify({ libraryRoot: root })
      });

      const addedCount = Number(preview.addedCount || 0);
      const deletedCount = Number(preview.deletedCount || 0);

      if (addedCount === 0 && deletedCount === 0) {
        hideScanPreview();
        showToast('No library changes detected');
        return;
      }

      showScanPreview(addedCount, deletedCount, root);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      scanNowBtn.disabled = false;
      scanNowBtn.textContent = 'Scan Library';
    }
  });

  scanProceedBtn.addEventListener('click', async () => {
    await runLibraryScan(state.pendingScanRoot || libraryRootInput.value.trim());
  });

  scanCancelBtn.addEventListener('click', () => {
    hideScanPreview();
  });

  window.addEventListener('hashchange', () => {
    renderRoute();
  });
}

async function boot() {
  setupGlobalEvents();
  await loadSettings();

  if (!window.location.hash) {
    window.location.hash = '#/library';
  }

  await renderRoute();
}

boot().catch((error) => {
  mainEl.innerHTML = `<div class="warning error">${escapeHtml(error.message)}</div>`;
});
