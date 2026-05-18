// app.js — IndexedDB persistence, upload UI, settings UI

const _APP_DB    = 'spotify-wrapped';
const _APP_STORE = 'data';
const _APP_KEY   = 'spotify_data';

function _appOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_APP_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(_APP_STORE);
    req.onsuccess        = e => resolve(e.target.result);
    req.onerror          = e => reject(e.target.error);
  });
}

async function _appSave(obj) {
  const db = await _appOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(_APP_STORE, 'readwrite');
    tx.objectStore(_APP_STORE).put(obj, _APP_KEY);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

async function _appLoad() {
  const db = await _appOpenDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(_APP_STORE, 'readonly');
    const req = tx.objectStore(_APP_STORE).get(_APP_KEY);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function _appClear() {
  const db = await _appOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(_APP_STORE, 'readwrite');
    tx.objectStore(_APP_STORE).delete(_APP_KEY);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

window.getSpotifyData = async function () {
  if (typeof SPOTIFY_DATA !== 'undefined' && SPOTIFY_DATA) return SPOTIFY_DATA;
  const data = await _appLoad();
  if (!data) _appShowUpload();
  return data;
};

// ── CSS ───────────────────────────────────────────────────────────────────────

(function () {
  const s = document.createElement('style');
  s.textContent = `
    #app-upload-modal {
      position: fixed; inset: 0; display: flex; align-items: flex-start; justify-content: center;
      background: rgba(0,0,0,0.92); z-index: 2000; padding: 24px; overflow-y: auto;
    }
    .app-upload-box {
      background: #282828; border-radius: 20px; padding: 48px 40px;
      max-width: 480px; width: 100%; margin: auto;
      display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center;
      transition: max-width 0.2s;
    }
    .app-upload-box.expanded { max-width: 680px; }
    .app-upload-logo { font-size: 28px; font-weight: 900; color: #1DB954; letter-spacing: -1px; }
    .app-upload-box h2 { font-size: 22px; font-weight: 800; color: #fff; }
    .app-upload-box > p { font-size: 14px; color: #b3b3b3; line-height: 1.6; }
    .app-upload-box code { background: #1a1a1a; padding: 2px 6px; border-radius: 4px; font-size: 13px; color: #1DB954; }
    .app-file-label {
      display: inline-block; background: #1DB954; color: #000; font-size: 14px; font-weight: 700;
      padding: 12px 32px; border-radius: 24px; cursor: pointer; transition: background 0.15s;
      font-family: inherit;
    }
    .app-file-label:hover { background: #1ed760; }
    .app-upload-status { font-size: 13px; color: #b3b3b3; min-height: 20px; }
    .app-upload-status.error { color: #f44336; }

    .app-howto-toggle {
      width: 100%; background: none; border: 1px solid #444; border-radius: 10px;
      color: #b3b3b3; font-size: 13px; font-weight: 700; padding: 10px 16px;
      cursor: pointer; display: flex; align-items: center; gap: 8px;
      transition: border-color 0.15s, color 0.15s; font-family: inherit; text-align: left;
    }
    .app-howto-toggle:hover { border-color: #1DB954; color: #fff; }
    .app-howto-toggle .app-toggle-arrow { font-size: 10px; transition: transform 0.2s; }
    .app-howto-toggle.open .app-toggle-arrow { transform: rotate(90deg); }

    .app-howto {
      display: none; width: 100%; text-align: left; border-top: 1px solid #333;
      padding-top: 20px; flex-direction: column; gap: 24px;
    }
    .app-howto.open { display: flex; }

    .app-step { display: flex; gap: 14px; align-items: flex-start; }
    .app-step-num {
      flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%;
      background: #1DB954; color: #000; font-size: 12px; font-weight: 800;
      display: flex; align-items: center; justify-content: center; margin-top: 1px;
    }
    .app-step-body { flex: 1; min-width: 0; }
    .app-step-title { font-size: 14px; font-weight: 800; color: #fff; margin-bottom: 6px; }
    .app-step-desc { font-size: 13px; color: #b3b3b3; line-height: 1.6; }
    .app-step-desc a { color: #1DB954; text-decoration: none; }
    .app-step-desc a:hover { text-decoration: underline; }
    .app-step-desc code { background: #1a1a1a; padding: 2px 5px; border-radius: 3px; font-size: 12px; color: #1DB954; }

    .app-cmd {
      background: #121212; border-radius: 8px; padding: 10px 14px; margin-top: 8px;
      font-family: monospace; font-size: 12px; color: #1DB954; overflow-x: auto;
      white-space: pre; border: 1px solid #333;
    }

    .app-script-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-top: 10px; margin-bottom: 6px;
    }
    .app-script-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #555; }
    .app-script-actions { display: flex; gap: 8px; }
    .app-script-btn {
      background: none; border: 1px solid #444; border-radius: 6px; color: #b3b3b3;
      font-size: 11px; font-weight: 700; padding: 4px 10px; cursor: pointer;
      transition: all 0.15s; font-family: inherit;
    }
    .app-script-btn:hover { border-color: #1DB954; color: #1DB954; }
    .app-script-pre {
      background: #121212; border: 1px solid #333; border-radius: 8px;
      padding: 14px; overflow: auto; max-height: 260px;
      font-family: monospace; font-size: 11px; line-height: 1.5;
      color: #ccc; white-space: pre; text-align: left;
    }

    #app-settings-modal {
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center; z-index: 2000;
    }
    #app-settings-modal.open { display: flex; }
    .app-settings-overlay {
      position: absolute; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);
    }
    .app-settings-box {
      position: relative; background: #282828; border-radius: 16px; padding: 32px;
      width: calc(100% - 32px); max-width: 440px;
      display: flex; flex-direction: column; gap: 20px; z-index: 1;
    }
    .app-settings-title { font-size: 18px; font-weight: 800; color: #fff; }
    .app-settings-section { display: flex; flex-direction: column; gap: 10px; }
    .app-settings-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #b3b3b3; }
    .app-settings-input {
      background: #121212; border: 1px solid #444; border-radius: 8px; color: #fff;
      padding: 10px 14px; font-size: 14px; outline: none; width: 100%; font-family: inherit;
    }
    .app-settings-input:focus { border-color: #1DB954; }
    .app-settings-hint { font-size: 12px; color: #555; line-height: 1.6; }
    .app-settings-hint code { background: #1a1a1a; padding: 1px 4px; border-radius: 3px; font-size: 11px; color: #1DB954; word-break: break-all; }
    .app-settings-divider { height: 1px; background: #333; }
    .app-settings-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .app-settings-btn {
      padding: 9px 20px; border-radius: 20px; font-size: 13px; font-weight: 700;
      cursor: pointer; border: none; transition: all 0.15s; font-family: inherit;
    }
    .app-settings-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .app-btn-save   { background: #1DB954; color: #000; }
    .app-btn-save:hover:not(:disabled) { background: #1ed760; }
    .app-btn-danger { background: transparent; border: 1px solid #f44336; color: #f44336; }
    .app-btn-danger:hover:not(:disabled) { background: #f44336; color: #fff; }
    .app-btn-close  { background: transparent; border: 1px solid #555; color: #b3b3b3; margin-left: auto; }
    .app-btn-close:hover { border-color: #fff; color: #fff; }

    .app-gear-btn {
      margin-left: auto; background: none; border: none; cursor: pointer;
      color: #b3b3b3; font-size: 18px; padding: 4px 8px; border-radius: 6px;
      transition: color 0.15s; line-height: 1; font-family: inherit;
    }
    .app-gear-btn:hover { color: #fff; }
  `;
  document.head.appendChild(s);
}());

// ── Upload modal ───────────────────────────────────────────────────────────────

function _appShowUpload() {
  if (document.getElementById('app-upload-modal')) return;
  const el = document.createElement('div');
  el.id = 'app-upload-modal';
  el.innerHTML = `
    <div class="app-upload-box" id="app-upload-box">
      <div class="app-upload-logo">Wrapped</div>
      <h2>Load your Spotify data</h2>
      <p>Run the generator script on your Spotify export, then upload the resulting <code>spotify_data.json</code> here.</p>
      <label class="app-file-label" for="app-file-input">Choose file…</label>
      <input type="file" id="app-file-input" accept=".json" style="display:none">
      <div class="app-upload-status" id="app-upload-status"></div>

      <button class="app-howto-toggle" id="app-howto-toggle">
        <span class="app-toggle-arrow">▶</span>
        Don't have a data file yet?
      </button>

      <div class="app-howto" id="app-howto">
        <div class="app-step">
          <div class="app-step-num">1</div>
          <div class="app-step-body">
            <div class="app-step-title">Request your Spotify data</div>
            <div class="app-step-desc">
              Go to <a href="https://www.spotify.com/account/privacy" target="_blank">spotify.com/account/privacy</a>,
              scroll to <strong style="color:#fff">Download your data</strong> and request your
              <strong style="color:#fff">Extended streaming history</strong>.
              Spotify will email you a download link — this can take up to 30 days.
              Unzip the archive when it arrives.
            </div>
          </div>
        </div>

        <div class="app-step">
          <div class="app-step-num">2</div>
          <div class="app-step-body">
            <div class="app-step-title">Run the generator script</div>
            <div class="app-step-desc">
              You need Python 3 (no extra packages). Download the script below, then run:
            </div>
            <div class="app-cmd">python3 generate.py "path/to/Spotify Extended Streaming History"</div>
            <div class="app-step-desc" style="margin-top:8px">
              This creates <code>spotify_data.json</code> in the same folder. That's the file to upload above.
            </div>
            <div class="app-script-header">
              <span class="app-script-label">generate.py</span>
              <div class="app-script-actions">
                <button class="app-script-btn" id="app-dl-btn">Download</button>
                <button class="app-script-btn" id="app-copy-btn">Copy</button>
              </div>
            </div>
            <pre class="app-script-pre" id="app-script-pre">Loading script…</pre>
          </div>
        </div>

        <div class="app-step">
          <div class="app-step-num">3</div>
          <div class="app-step-body">
            <div class="app-step-title">Upload the file</div>
            <div class="app-step-desc">
              Use the <strong style="color:#fff">Choose file…</strong> button above to select your
              <code>spotify_data.json</code>. Your data is stored locally in your browser — nothing is sent to any server.
            </div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);

  document.getElementById('app-file-input').addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById('app-upload-status');
    status.className = 'app-upload-status';
    status.textContent = 'Reading…';
    try {
      const text = await file.text();
      status.textContent = 'Parsing…';
      const data = JSON.parse(text);
      const required = ['summary', 'years', 'year_stats', 'top_songs_all', 'top_artists_all', 'monthly_heatmap', 'songs_per_year', 'insights'];
      if (!data || typeof data !== 'object' || !required.every(k => k in data)) {
        throw new Error('Not a valid spotify_data.json file');
      }
      status.textContent = 'Saving…';
      await _appSave(data);
      window.location.reload();
    } catch (err) {
      status.className = 'app-upload-status error';
      status.textContent = `Failed to load: ${err.message}`;
    }
  });

  let scriptLoaded = false;
  document.getElementById('app-howto-toggle').addEventListener('click', function () {
    const howto   = document.getElementById('app-howto');
    const box     = document.getElementById('app-upload-box');
    const open    = howto.classList.toggle('open');
    this.classList.toggle('open', open);
    box.classList.toggle('expanded', open);
    if (open && !scriptLoaded) {
      scriptLoaded = true;
      _appLoadScript();
    }
  });

  document.getElementById('app-copy-btn').addEventListener('click', function () {
    const text = document.getElementById('app-script-pre').textContent;
    navigator.clipboard.writeText(text).then(() => {
      this.textContent = 'Copied ✓';
      setTimeout(() => { this.textContent = 'Copy'; }, 1800);
    });
  });

  document.getElementById('app-dl-btn').addEventListener('click', function () {
    const text = document.getElementById('app-script-pre').textContent;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'generate.py';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

async function _appLoadScript() {
  const pre = document.getElementById('app-script-pre');
  if (!pre) return;
  try {
    const r = await fetch('generate.py');
    if (!r.ok) throw new Error('not found');
    pre.textContent = await r.text();
  } catch {
    pre.textContent = '# Could not load script.\n# Download from the project repository.';
  }
}

// ── Settings modal ─────────────────────────────────────────────────────────────

function _appBuildSettings() {
  if (document.getElementById('app-settings-modal')) return;
  const redirectHint = window.location.origin + '/callback.html';
  const el = document.createElement('div');
  el.id = 'app-settings-modal';
  el.innerHTML = `
    <div class="app-settings-overlay" id="app-settings-overlay"></div>
    <div class="app-settings-box">
      <div class="app-settings-title">Settings</div>
      <div class="app-settings-section">
        <div class="app-settings-label">Spotify Client ID</div>
        <input class="app-settings-input" id="app-client-id-input" type="text"
               placeholder="Paste your Spotify app Client ID…" spellcheck="false">
        <div class="app-settings-hint">
          Create a free app at <strong style="color:#fff">developer.spotify.com/dashboard</strong>
          and register <code>${redirectHint}</code> as the redirect URI.
        </div>
        <div class="app-settings-row">
          <button class="app-settings-btn app-btn-save" id="app-save-client-btn">Save</button>
        </div>
      </div>
      <div class="app-settings-divider"></div>
      <div class="app-settings-section">
        <div class="app-settings-label">Listening Data</div>
        <div class="app-settings-row">
          <button class="app-settings-btn app-btn-danger" id="app-clear-data-btn">Clear data and start over</button>
        </div>
      </div>
      <div class="app-settings-row">
        <button class="app-settings-btn app-btn-close" id="app-close-settings-btn">Close</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  document.getElementById('app-settings-overlay').onclick  = _appCloseSettings;
  document.getElementById('app-close-settings-btn').onclick = _appCloseSettings;

  document.getElementById('app-save-client-btn').onclick = () => {
    const val = document.getElementById('app-client-id-input').value.trim();
    localStorage.setItem('sp_client_id', val);
    const btn = document.getElementById('app-save-client-btn');
    btn.textContent = 'Saved ✓';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1500);
  };

  document.getElementById('app-clear-data-btn').onclick = async () => {
    if (!confirm('Clear all listening data? You will need to upload your file again.')) return;
    await _appClear();
    sessionStorage.clear();
    window.location.href = 'index.html';
  };
}

function _appOpenSettings() {
  _appBuildSettings();
  document.getElementById('app-client-id-input').value =
    localStorage.getItem('sp_client_id') || '';
  document.getElementById('app-settings-modal').classList.add('open');
}

function _appCloseSettings() {
  document.getElementById('app-settings-modal')?.classList.remove('open');
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('nav');
  if (nav && !document.getElementById('app-gear-btn')) {
    const btn    = document.createElement('button');
    btn.id       = 'app-gear-btn';
    btn.className = 'app-gear-btn';
    btn.title    = 'Settings';
    btn.textContent = '⚙';
    btn.onclick  = _appOpenSettings;
    nav.appendChild(btn);
  }
});
