// spotify.js — PKCE auth + playlist export
// Requires: app.js loaded before this file (provides localStorage-based Client ID)

const _SP_SCOPES      = 'playlist-modify-private playlist-modify-public user-read-private';
const _SP_REDIRECT    = window.location.origin + '/callback.html';
const _SP_API         = 'https://api.spotify.com/v1';

// ── Inject shared CSS ─────────────────────────────────────────────────────────

(function () {
  const s = document.createElement('style');
  s.textContent = `
    .nav-spotify-btn {
      background: #1DB954; border: none; border-radius: 20px;
      color: #000; font-size: 13px; font-weight: 700; padding: 7px 18px;
      cursor: pointer; transition: background 0.15s; white-space: nowrap; font-family: inherit;
    }
    .nav-spotify-btn:hover { background: #1ed760; }
    .nav-spotify-btn.sp-connected { background: #282828; color: #1DB954; border: 1px solid #1DB954; }

    .export-btn {
      display: inline-flex; align-items: center; gap: 6px; margin-top: 14px;
      background: none; border: 1px solid #1DB954; color: #1DB954;
      padding: 8px 18px; border-radius: 20px; font-size: 13px; font-weight: 700;
      cursor: pointer; transition: all 0.15s; font-family: inherit;
    }
    .export-btn:hover { background: #1DB954; color: #000; }

    #sp-modal {
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center; z-index: 1000;
    }
    #sp-modal.sp-open { display: flex; }
    .sp-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); }
    .sp-box {
      position: relative; background: #282828; border-radius: 16px; padding: 32px;
      width: calc(100% - 32px); max-width: 480px; max-height: 85vh;
      display: flex; flex-direction: column; gap: 14px; z-index: 1;
    }
    .sp-header { display: flex; align-items: center; justify-content: space-between; }
    .sp-title { font-size: 20px; font-weight: 800; color: #fff; }
    .sp-close {
      background: none; border: none; color: #b3b3b3; font-size: 18px;
      cursor: pointer; padding: 4px 8px; border-radius: 4px; line-height: 1;
    }
    .sp-close:hover { color: #fff; background: #333; }
    .sp-close:disabled { opacity: 0.3; cursor: not-allowed; }
    .sp-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #b3b3b3; }
    .sp-input {
      background: #121212; border: 1px solid #444; border-radius: 8px; color: #fff;
      padding: 10px 14px; font-size: 15px; font-weight: 700; outline: none;
      width: 100%; font-family: inherit;
    }
    .sp-input:focus { border-color: #1DB954; }
    .sp-song-list {
      overflow-y: auto; flex: 1; min-height: 100px; max-height: 300px;
      border: 1px solid #333; border-radius: 8px;
    }
    .sp-song-row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 14px; border-bottom: 1px solid #222;
    }
    .sp-song-row:last-child { border: none; }
    .sp-song-num { width: 24px; text-align: right; color: #555; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    .sp-song-info { flex: 1; min-width: 0; }
    .sp-song-name { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; }
    .sp-song-artist { font-size: 11px; color: #b3b3b3; }
    .sp-song-plays { font-size: 11px; color: #1DB954; flex-shrink: 0; font-weight: 700; }
    .sp-status { font-size: 13px; color: #b3b3b3; min-height: 18px; line-height: 1.4; }
    .sp-footer { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
    .sp-btn {
      padding: 10px 24px; border-radius: 24px; font-size: 14px; font-weight: 700;
      cursor: pointer; border: none; transition: all 0.15s; font-family: inherit;
    }
    .sp-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .sp-btn-cancel { background: transparent; border: 1px solid #555; color: #b3b3b3; }
    .sp-btn-cancel:hover:not(:disabled) { border-color: #fff; color: #fff; }
    .sp-btn-export { background: #1DB954; color: #000; }
    .sp-btn-export:hover:not(:disabled) { background: #1ed760; }
  `;
  document.head.appendChild(s);
}());

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function _spVerifier() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const buf   = new Uint8Array(64);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => chars[b % chars.length]).join('');
}

async function _spChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Token ─────────────────────────────────────────────────────────────────────

function spGetToken() {
  const t = sessionStorage.getItem('sp_token');
  const e = parseInt(sessionStorage.getItem('sp_expiry') || '0');
  return t && Date.now() < e ? t : null;
}

async function spLogin() {
  const clientId = localStorage.getItem('sp_client_id');
  if (!clientId) {
    alert('No Spotify Client ID set.\nClick the ⚙ settings icon in the navigation bar to add one.');
    return;
  }
  sessionStorage.setItem('sp_return', window.location.href);
  const v     = _spVerifier();
  const state = _spVerifier();
  sessionStorage.setItem('sp_verifier', v);
  sessionStorage.setItem('sp_state', state);
  const params = new URLSearchParams({
    client_id:             clientId,
    response_type:         'code',
    redirect_uri:          _SP_REDIRECT,
    scope:                 _SP_SCOPES,
    code_challenge:        await _spChallenge(v),
    code_challenge_method: 'S256',
    state,
  });
  window.location.href = 'https://accounts.spotify.com/authorize?' + params;
}

function spLogout() {
  sessionStorage.removeItem('sp_token');
  sessionStorage.removeItem('sp_expiry');
  sessionStorage.removeItem('sp_state');
  _spRefreshNavBtn();
}

// ── Nav button ────────────────────────────────────────────────────────────────

function _spRefreshNavBtn() {
  const btn = document.getElementById('sp-nav-btn');
  if (!btn) return;
  const token = spGetToken();
  if (token) {
    fetch(_SP_API + '/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(me => {
        if (!me) { _spNavReset(btn); return; }
        btn.textContent = me.display_name || 'Connected';
        btn.title       = 'Click to disconnect';
        btn.className   = 'nav-spotify-btn sp-connected';
        btn.onclick     = spLogout;
      })
      .catch(() => _spNavReset(btn));
  } else {
    _spNavReset(btn);
  }
}

function _spNavReset(btn) {
  btn.textContent = 'Connect Spotify';
  btn.title       = '';
  btn.className   = 'nav-spotify-btn';
  btn.onclick     = spLogin;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function _spFetch(path, opts = {}) {
  const token = spGetToken();
  if (!token) throw new Error('Not authenticated — connect Spotify first');
  const url         = path.startsWith('http') ? path : _SP_API + path;
  const MAX_RETRIES = 3;
  const MAX_WAIT    = 30_000;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const r = await fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    if (r.status === 429 && attempt < MAX_RETRIES) {
      const wait = Math.min((parseInt(r.headers.get('Retry-After') || '2') + 1) * 1000, MAX_WAIT);
      await new Promise(res => setTimeout(res, wait));
      continue;
    }
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(`Spotify ${r.status}: ${body?.error?.message || r.statusText}`);
    }
    return r;
  }
  throw new Error('Spotify rate limit exceeded, please try again later');
}

async function _spSearchURI(track, artist) {
  const q = `track:${track} artist:${artist}`;
  try {
    const r    = await _spFetch('/search?' + new URLSearchParams({ q, type: 'track', limit: 1 }));
    const data = await r.json();
    return data.tracks?.items?.[0]?.uri ?? null;
  } catch { return null; }
}

async function _spCreatePlaylist(name) {
  const r    = await _spFetch('/me/playlists', {
    method: 'POST',
    body:   JSON.stringify({ name, public: false, description: 'Created by Spotify Wrapped' }),
  });
  const data = await r.json();
  if (!data.id) throw new Error(data.error?.message || 'Failed to create playlist');
  return data.id;
}

async function _spAddTracks(playlistId, uris) {
  for (let i = 0; i < uris.length; i += 100) {
    await _spFetch(`/playlists/${playlistId}/items`, {
      method: 'POST',
      body:   JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function _spEsc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _spBuildModal() {
  if (document.getElementById('sp-modal')) return;
  const el = document.createElement('div');
  el.id    = 'sp-modal';
  el.innerHTML = `
    <div class="sp-overlay" id="sp-overlay"></div>
    <div class="sp-box">
      <div class="sp-header">
        <div class="sp-title">Export to Spotify</div>
        <button class="sp-close" id="sp-close-btn">✕</button>
      </div>
      <div class="sp-label">Playlist name</div>
      <input class="sp-input" id="sp-playlist-name" type="text" />
      <div class="sp-label" id="sp-count-label"></div>
      <div class="sp-song-list" id="sp-song-list"></div>
      <div class="sp-status" id="sp-status"></div>
      <div class="sp-footer">
        <button class="sp-btn sp-btn-cancel" id="sp-cancel-btn">Cancel</button>
        <button class="sp-btn sp-btn-export" id="sp-export-btn">Export →</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  document.getElementById('sp-close-btn').onclick  = spCloseModal;
  document.getElementById('sp-cancel-btn').onclick  = spCloseModal;
  document.getElementById('sp-overlay').onclick     = spCloseModal;
}

function spCloseModal() {
  document.getElementById('sp-modal')?.classList.remove('sp-open');
}

async function spOpenExportModal(songs, defaultName) {
  if (!spGetToken()) { await spLogin(); return; }
  _spBuildModal();

  document.getElementById('sp-playlist-name').value   = defaultName || 'My Playlist';
  document.getElementById('sp-count-label').textContent = `${songs.length} song${songs.length !== 1 ? 's' : ''} to add`;
  document.getElementById('sp-song-list').innerHTML    = songs.map((s, i) => `
    <div class="sp-song-row">
      <span class="sp-song-num">${i + 1}</span>
      <div class="sp-song-info">
        <div class="sp-song-name">${_spEsc(s.track)}</div>
        <div class="sp-song-artist">${_spEsc(s.artist)}</div>
      </div>
      <span class="sp-song-plays">${s.plays}×</span>
    </div>`).join('');
  document.getElementById('sp-status').innerHTML      = '';
  document.getElementById('sp-export-btn').disabled   = false;
  document.getElementById('sp-export-btn').textContent = 'Export →';
  document.getElementById('sp-close-btn').disabled    = false;
  document.getElementById('sp-cancel-btn').disabled   = false;
  document.getElementById('sp-cancel-btn').textContent = 'Cancel';
  document.getElementById('sp-modal').classList.add('sp-open');

  document.getElementById('sp-export-btn').onclick = () => {
    const name = document.getElementById('sp-playlist-name').value.trim() || defaultName || 'My Playlist';
    _spDoExport(songs, name);
  };
}

async function _spDoExport(songs, playlistName) {
  const exportBtn = document.getElementById('sp-export-btn');
  const closeBtn  = document.getElementById('sp-close-btn');
  const cancelBtn = document.getElementById('sp-cancel-btn');
  const statusEl  = document.getElementById('sp-status');

  exportBtn.disabled = true;
  closeBtn.disabled  = true;
  cancelBtn.disabled = true;

  try {
    const uris  = new Array(songs.length).fill(null);
    const BATCH = 5;
    for (let i = 0; i < songs.length; i += BATCH) {
      const results = await Promise.all(
        songs.slice(i, i + BATCH).map(s => _spSearchURI(s.track, s.artist))
      );
      results.forEach((uri, j) => { uris[i + j] = uri; });
      statusEl.textContent = `Searching Spotify… ${Math.min(i + BATCH, songs.length)} / ${songs.length}`;
    }

    const found   = uris.filter(Boolean);
    const missing = songs.length - found.length;
    statusEl.textContent = `Found ${found.length} / ${songs.length}. Creating playlist…`;

    const id = await _spCreatePlaylist(playlistName);
    statusEl.textContent = 'Adding tracks…';
    await _spAddTracks(id, found);

    const note = missing > 0 ? ` (${missing} not found on Spotify)` : '';
    const link = document.createElement('a');
    link.href             = `https://open.spotify.com/playlist/${encodeURIComponent(id)}`;
    link.target           = '_blank';
    link.rel              = 'noopener noreferrer';
    link.style.cssText    = 'color:#1DB954;font-weight:700;text-decoration:none';
    link.textContent      = 'Open playlist →';
    statusEl.textContent  = '';
    statusEl.appendChild(document.createTextNode(`✓ Done${note} — `));
    statusEl.appendChild(link);
    exportBtn.textContent = 'Done ✓';
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    exportBtn.disabled   = false;
  } finally {
    closeBtn.disabled    = false;
    cancelBtn.disabled   = false;
    cancelBtn.textContent = 'Close';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('nav');
  if (nav && !document.getElementById('sp-nav-btn')) {
    const btn    = document.createElement('button');
    btn.id       = 'sp-nav-btn';
    btn.className = 'nav-spotify-btn';
    nav.appendChild(btn);
  }
  _spRefreshNavBtn();
});
