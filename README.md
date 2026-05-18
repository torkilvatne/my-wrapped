# Spotify Wrapped

Visualize your full Spotify streaming history — top songs and artists per year, listening heatmaps, play counts, and more.

## Requirements

- Python 3 (standard library only)
- Your Spotify Extended Streaming History data
- A web browser
- A Spotify app Client ID (only required for the Export to Spotify feature)

## Getting your Spotify data

1. Go to [spotify.com/account/privacy](https://www.spotify.com/account/privacy)
2. Under **Download your data**, request your **Extended streaming history**
3. Spotify will email you a download link (takes up to 30 days)
4. Unzip the archive — you want the folder called `Spotify Extended Streaming History`

## Usage

```bash
python3 pre_processing/generate.py "<path to Spotify Extended Streaming History>" [output-dir] [--client-id YOUR_CLIENT_ID]
```

This generates a self-contained website folder at `output-dir`. If no output directory is given, it writes to the current working directory.

### Examples

```bash
# Output to current directory (no export feature)
python3 pre_processing/generate.py ~/Downloads/my_spotify_data/Spotify\ Extended\ Streaming\ History

# Output to a specific folder
python3 pre_processing/generate.py ~/Downloads/my_spotify_data/Spotify\ Extended\ Streaming\ History ~/Desktop/my-wrapped

# With Spotify export enabled
python3 pre_processing/generate.py ~/Downloads/my_spotify_data/Spotify\ Extended\ Streaming\ History ~/Desktop/my-wrapped --client-id abc123def456
```

### Serving the website

To use the Export feature, serve the site over HTTP (OAuth redirects require a real URL), then enter your Client ID via the **⚙** settings icon in the nav:

```bash
python3 -m http.server 8765 -d ~/Desktop/my-wrapped
```

Then open [http://127.0.0.1:8765](http://127.0.0.1:8765), click **⚙** → paste your Client ID → **Save**, then **Connect Spotify**.

Without the Export feature, you can open `index.html` directly in a browser — no server needed.

## Hosted site

You can deploy this as a public site on Cloudflare Pages so anyone can use it — no Python or local server required on their end.

### Deploying to Cloudflare Pages

```bash
# One-time setup (install Wrangler if you haven't)
npm install -g wrangler
wrangler login

# Deploy
npx wrangler pages deploy pre_processing/templates --project-name spotify-wrapped
```

Or connect your GitHub repo in the Cloudflare Pages dashboard: set the root directory to `pre_processing/templates`, leave the build command empty.

### User flow on the hosted site

1. Run `generate.py` locally to produce `spotify_data.json` in the output folder
2. Visit your hosted URL and upload `spotify_data.json` when prompted
3. The site stores your data in the browser's IndexedDB — it persists across page navigations and browser restarts
4. To use playlist export: click the **⚙** icon in the nav → paste your Spotify Client ID → Save
5. Click **Connect Spotify** to authorise

Each user needs their own Spotify app. The redirect URI to register is `https://your-site.pages.dev/callback.html`.

To clear your data and upload a new file, click **⚙ → Clear data and start over**.

---

## Spotify Export Setup

To enable the **Export to Spotify** buttons:

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and log in
2. Click **Create app**
3. Fill in any name; set **Redirect URI** to `http://127.0.0.1:8765/callback.html` (for local use) or your hosted site URL (e.g. `https://your-site.pages.dev/callback.html`)
4. Save, then open app settings and copy the **Client ID**
5. On the site, click the **⚙** icon in the nav → paste the Client ID → **Save**
6. Click **Connect Spotify** and authorise

The Client ID is stored in your browser's `localStorage` — you only need to enter it once per browser.

## Output

The script produces:

```
<output-dir>/
├── index.html          # Overview — all-time stats, top artists, heatmap
├── yearly.html         # Per-year breakdown — top songs, first track, monthly hours
├── songs.html          # Full play count table per year, searchable and sortable
├── stats.html          # Insights — hour-of-day, day-of-week, sessions, countries, and more
├── callback.html       # OAuth callback handler (required for Spotify export)
├── app.js              # Data persistence and settings UI
├── spotify.js          # Spotify auth and playlist export logic
├── spotify_data.json   # Upload this to the hosted site
└── data/
    ├── spotify_data.js     # Processed data for local use — do not edit manually
    └── spotify_config.js   # Legacy local config — do not edit manually
```

## Repository structure

```
├── pre_processing/
│   ├── generate.py       # The script
│   └── templates/        # HTML/JS source files copied into each output
└── README.md
```

## Pages

- **Overview** — total hours, unique tracks and artists, yearly listening bar chart, monthly heatmap, all-time top artists and songs
- **By Year** — click any year to see its top songs, top artists, first track of the year, and monthly breakdown
- **Song Counts** — every song you played in a given year with its play count; searchable and sortable
- **Insights** — hour-of-day heatmap, day-of-week breakdown, discovery methods, skip rates by platform, listening sessions, countries, and artist lifetime Gantt chart