#!/usr/bin/env python3
import json
import sys
import glob
import os
import shutil
import calendar
import argparse
from collections import defaultdict

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
TEMPLATE_FILES = ["index.html", "yearly.html", "songs.html", "stats.html", "callback.html", "app.js", "spotify.js", "export.html", "generate.py", "_headers"]

REASON_GROUPS = {
    "playbtn":  "Play button",
    "clickrow": "Play button",
    "appload":  "Play button",
    "persisted":"Play button",
    "fwdbtn":   "Skipped forward",
    "backbtn":  "Went back",
    "autoplay": "Autoplay",
    "trackdone":"Autoplay",
    "remote":   "Remote",
}


def normalize_platform(p):
    p = (p or "").lower()
    if "ios" in p or "iphone" in p or "ipad" in p: return "iOS"
    if "android" in p: return "Android"
    if "windows" in p: return "Windows"
    if ("osx" in p or "mac" in p) and "android" not in p: return "Mac"
    if "linux" in p: return "Linux"
    if "web" in p or "browser" in p: return "Web"
    if "cast" in p or "chromecast" in p or "tizen" in p: return "TV/Cast"
    return "Other"


def ts_to_epoch(ts):
    y, mo, d = int(ts[0:4]), int(ts[5:7]), int(ts[8:10])
    h, mi, s  = int(ts[11:13]), int(ts[14:16]), int(ts[17:19])
    return calendar.timegm((y, mo, d, h, mi, s, 0, 0, 0))


def compute_insights(tracks, all_data, top_artists_all_data):
    hourly       = [{"plays": 0, "ms": 0, "skips": 0} for _ in range(24)]
    daily_plays  = [0] * 7
    daily_ms     = [0] * 7
    daily_artists= [defaultdict(int) for _ in range(7)]
    country_ms   = defaultdict(int)
    country_plays= defaultdict(int)
    reasons      = defaultdict(int)
    reasons_by_year = defaultdict(lambda: defaultdict(int))
    platform_data= defaultdict(lambda: {"plays": 0, "skips": 0, "ms": 0})
    artist_ts_idx= defaultdict(list)

    for e in all_data:
        c = e.get("conn_country") or "XX"
        country_ms[c]    += e["ms_played"]
        country_plays[c] += 1

    tracks_chrono = sorted(tracks, key=lambda x: x["ts"])

    for e in tracks_chrono:
        ts    = e["ts"]
        hour  = int(ts[11:13])
        epoch = ts_to_epoch(ts)
        wday  = (epoch // 86400 + 3) % 7   # 0 = Monday, 6 = Sunday

        hourly[hour]["plays"] += 1
        hourly[hour]["ms"]    += e["ms_played"]
        if e.get("skipped"):
            hourly[hour]["skips"] += 1

        daily_plays[wday] += 1
        daily_ms[wday]    += e["ms_played"]
        daily_artists[wday][e["master_metadata_album_artist_name"]] += 1

        r     = e.get("reason_start") or "unknown"
        group = REASON_GROUPS.get(r, "Other")
        reasons[group] += 1
        reasons_by_year[ts[:4]][group] += 1

        p = normalize_platform(e.get("platform"))
        platform_data[p]["plays"] += 1
        platform_data[p]["ms"]    += e["ms_played"]
        if e.get("skipped"):
            platform_data[p]["skips"] += 1

        artist_ts_idx[e["master_metadata_album_artist_name"]].append(ts)

    hourly_out = [
        {
            "hour":      h,
            "plays":     hourly[h]["plays"],
            "hours":     round(hourly[h]["ms"] / 3_600_000, 1),
            "skips":     hourly[h]["skips"],
            "skip_rate": round(100 * hourly[h]["skips"] / hourly[h]["plays"], 1)
                         if hourly[h]["plays"] else 0,
        }
        for h in range(24)
    ]

    DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    daily_out = [
        {
            "day":         d,
            "name":        DAY_NAMES[d],
            "plays":       daily_plays[d],
            "hours":       round(daily_ms[d] / 3_600_000, 1),
            "top_artists": [a for a, _ in sorted(daily_artists[d].items(), key=lambda x: -x[1])[:5]],
        }
        for d in range(7)
    ]

    countries_out = sorted(
        [{"code": c, "plays": country_plays[c], "hours": round(country_ms[c] / 3_600_000, 1)}
         for c in country_ms if c != "XX"],
        key=lambda x: -x["hours"],
    )[:20]

    reason_start_out = {
        "totals":   dict(sorted(reasons.items(), key=lambda x: -x[1])),
        "by_year":  {y: dict(v) for y, v in sorted(reasons_by_year.items())},
    }

    skip_platform_out = sorted(
        [
            {
                "platform":  p,
                "plays":     v["plays"],
                "skips":     v["skips"],
                "hours":     round(v["ms"] / 3_600_000, 1),
                "skip_rate": round(100 * v["skips"] / v["plays"], 1) if v["plays"] else 0,
            }
            for p, v in platform_data.items()
        ],
        key=lambda x: -x["plays"],
    )

    SESSION_GAP_S = 30 * 60
    sessions_list = []

    if tracks_chrono:
        s_start = tracks_chrono[0]["ts"]
        s_ms    = tracks_chrono[0]["ms_played"]
        s_plays = 1
        prev_ep = ts_to_epoch(s_start)

        for e in tracks_chrono[1:]:
            curr_ep = ts_to_epoch(e["ts"])
            if curr_ep - prev_ep > SESSION_GAP_S:
                sessions_list.append({"start": s_start, "ms": s_ms, "plays": s_plays})
                s_start = e["ts"]
                s_ms    = e["ms_played"]
                s_plays = 1
            else:
                s_ms    += e["ms_played"]
                s_plays += 1
            prev_ep = curr_ep
        sessions_list.append({"start": s_start, "ms": s_ms, "plays": s_plays})

    total_sess = len(sessions_list)
    longest    = max(sessions_list, key=lambda s: s["ms"]) if sessions_list else None
    by_year_s  = defaultdict(lambda: {"count": 0, "total_ms": 0})
    for s in sessions_list:
        by_year_s[s["start"][:4]]["count"]    += 1
        by_year_s[s["start"][:4]]["total_ms"] += s["ms"]

    sessions_out = {
        "total":       total_sess,
        "avg_minutes": round(sum(s["ms"] for s in sessions_list) / (total_sess * 60_000), 1) if total_sess else 0,
        "avg_plays":   round(sum(s["plays"] for s in sessions_list) / total_sess, 1) if total_sess else 0,
        "longest":     {
            "date":    longest["start"][:10],
            "minutes": round(longest["ms"] / 60_000, 1),
            "plays":   longest["plays"],
        } if longest else None,
        "per_year": {
            y: {"count": v["count"], "avg_minutes": round(v["total_ms"] / (v["count"] * 60_000), 1)}
            for y, v in sorted(by_year_s.items())
        },
    }

    top_artist_names = [a["artist"] for a in top_artists_all_data[:25]]
    artist_lifecycle = []
    for name in top_artist_names:
        timestamps = sorted(artist_ts_idx.get(name, []))
        if not timestamps:
            continue
        first_month = timestamps[0][:7]
        last_month  = timestamps[-1][:7]
        by_month    = defaultdict(int)
        for ts in timestamps:
            by_month[ts[:7]] += 1
        peak_month = max(by_month.items(), key=lambda x: x[1])[0]
        artist_lifecycle.append({
            "artist":      name,
            "first":       first_month,
            "last":        last_month,
            "peak":        peak_month,
            "peak_plays":  by_month[peak_month],
            "total_plays": len(timestamps),
            "monthly":     dict(sorted(by_month.items())),
        })

    return {
        "hourly":          hourly_out,
        "daily":           daily_out,
        "countries":       countries_out,
        "reason_start":    reason_start_out,
        "skip_by_platform":skip_platform_out,
        "sessions":        sessions_out,
        "artist_lifecycle":artist_lifecycle,
    }


def process(folder, output_dir, client_id=""):
    audio_files = sorted(glob.glob(os.path.join(folder, "Streaming_History_Audio_*.json")))
    if not audio_files:
        print(f"No Streaming_History_Audio_*.json files found in: {folder}")
        sys.exit(1)

    all_data = []
    for f in audio_files:
        with open(f, encoding="utf-8") as fp:
            all_data.extend(json.load(fp))

    tracks        = [e for e in all_data if e.get("master_metadata_track_name")]
    tracks_sorted = sorted(tracks, key=lambda x: x["ts"])

    by_year = defaultdict(list)
    for e in tracks_sorted:
        by_year[e["ts"][:4]].append(e)

    active_years = sorted(by_year.keys())

    year_stats = {}
    for year in active_years:
        entries  = by_year[year]
        total_ms = sum(e["ms_played"] for e in entries)

        song_counts   = defaultdict(int)
        song_ms       = defaultdict(int)
        song_album    = {}
        artist_counts = defaultdict(int)
        artist_ms     = defaultdict(int)
        monthly       = defaultdict(int)

        for e in entries:
            key = (e["master_metadata_track_name"], e["master_metadata_album_artist_name"])
            song_counts[key]   += 1
            song_ms[key]       += e["ms_played"]
            song_album[key]     = e.get("master_metadata_album_album_name") or ""
            artist_counts[e["master_metadata_album_artist_name"]] += 1
            artist_ms[e["master_metadata_album_artist_name"]]     += e["ms_played"]
            monthly[int(e["ts"][5:7])] += e["ms_played"]

        skipped = sum(1 for e in entries if e.get("skipped"))
        first   = entries[0]

        year_stats[year] = {
            "total_plays":    len(entries),
            "total_ms":       total_ms,
            "total_hours":    round(total_ms / 3_600_000, 1),
            "unique_tracks":  len(song_counts),
            "unique_artists": len(artist_counts),
            "skipped":        skipped,
            "skip_rate":      round(100 * skipped / len(entries), 1) if entries else 0,
            "top_songs": [
                {"track": k[0], "artist": k[1], "album": song_album[k],
                 "plays": v, "hours": round(song_ms[k] / 3_600_000, 2)}
                for k, v in sorted(song_counts.items(), key=lambda x: -x[1])[:50]
            ],
            "top_artists": [
                {"artist": a, "plays": v, "hours": round(artist_ms[a] / 3_600_000, 1)}
                for a, v in sorted(artist_counts.items(), key=lambda x: -x[1])[:50]
            ],
            "monthly_hours": [round(monthly.get(m, 0) / 3_600_000, 2) for m in range(1, 13)],
            "first_song": {
                "track":  first["master_metadata_track_name"],
                "artist": first["master_metadata_album_artist_name"],
                "album":  first.get("master_metadata_album_album_name") or "",
                "ts":     first["ts"],
            },
        }

    song_counts_all  = defaultdict(int)
    song_ms_all      = defaultdict(int)
    song_album_all   = {}
    artist_counts_all= defaultdict(int)
    artist_ms_all    = defaultdict(int)
    monthly_heatmap  = defaultdict(int)

    for e in tracks:
        key = (e["master_metadata_track_name"], e["master_metadata_album_artist_name"])
        song_counts_all[key]   += 1
        song_ms_all[key]       += e["ms_played"]
        song_album_all[key]     = e.get("master_metadata_album_album_name") or ""
        artist_counts_all[e["master_metadata_album_artist_name"]] += 1
        artist_ms_all[e["master_metadata_album_artist_name"]]     += e["ms_played"]
        monthly_heatmap[e["ts"][:7]] += e["ms_played"]

    songs_per_year = {}
    for year in active_years:
        entries = by_year[year]
        sc, sm, sa = defaultdict(int), defaultdict(int), {}
        for e in entries:
            key     = (e["master_metadata_track_name"], e["master_metadata_album_artist_name"])
            sc[key] += 1
            sm[key] += e["ms_played"]
            sa[key]  = e.get("master_metadata_album_album_name") or ""
        songs_per_year[year] = [
            {"track": k[0], "artist": k[1], "album": sa[k],
             "plays": v, "hours": round(sm[k] / 3_600_000, 2)}
            for k, v in sorted(sc.items(), key=lambda x: -x[1])
        ]

    total_ms   = sum(e["ms_played"] for e in tracks)
    first_ever = tracks_sorted[0]

    top_artists_all_data = [
        {"artist": a, "plays": v, "hours": round(artist_ms_all[a] / 3_600_000, 1)}
        for a, v in sorted(artist_counts_all.items(), key=lambda x: -x[1])[:30]
    ]

    output = {
        "summary": {
            "total_plays":    len(tracks),
            "total_hours":    round(total_ms / 3_600_000, 1),
            "unique_tracks":  len(song_counts_all),
            "unique_artists": len(artist_counts_all),
            "years_active":   len(active_years),
            "podcast_plays":  sum(1 for e in all_data if e.get("episode_name")),
            "first_track": {
                "track":  first_ever["master_metadata_track_name"],
                "artist": first_ever["master_metadata_album_artist_name"],
                "ts":     first_ever["ts"],
            },
        },
        "years":      active_years,
        "year_stats": year_stats,
        "top_songs_all": [
            {"track": k[0], "artist": k[1], "album": song_album_all[k],
             "plays": v, "hours": round(song_ms_all[k] / 3_600_000, 2)}
            for k, v in sorted(song_counts_all.items(), key=lambda x: -x[1])[:30]
        ],
        "top_artists_all":  top_artists_all_data,
        "monthly_heatmap":  {k: round(v / 3_600_000, 1) for k, v in monthly_heatmap.items()},
        "songs_per_year":   songs_per_year,
        "insights":         compute_insights(tracks, all_data, top_artists_all_data),
    }

    json_path = os.path.join(output_dir, "spotify_data.json")
    os.makedirs(output_dir, exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)

    print(f"  {len(tracks):,} track plays · {output['summary']['total_hours']:,}h · "
          f"{output['summary']['unique_tracks']:,} unique tracks · "
          f"{output['summary']['unique_artists']:,} unique artists · "
          f"{len(active_years)} years ({active_years[0]}–{active_years[-1]})")

    if os.path.isdir(TEMPLATES_DIR):
        os.makedirs(os.path.join(output_dir, "data"), exist_ok=True)
        for name in TEMPLATE_FILES:
            shutil.copy(os.path.join(TEMPLATES_DIR, name), os.path.join(output_dir, name))
        js_path = os.path.join(output_dir, "data", "spotify_data.js")
        with open(js_path, "w", encoding="utf-8") as f:
            f.write("const SPOTIFY_DATA = ")
            json.dump(output, f, ensure_ascii=False)
            f.write(";")
        config_path = os.path.join(output_dir, "data", "spotify_config.js")
        with open(config_path, "w", encoding="utf-8") as f:
            f.write(f'const SPOTIFY_CLIENT_ID = "{client_id}";')
        print(f"Website written to: {os.path.abspath(output_dir)}")
        print(f"  Open {os.path.abspath(os.path.join(output_dir, 'index.html'))} in a browser")
        print(f"  To use the hosted site: upload {os.path.abspath(json_path)}")
    else:
        print(f"Output: {os.path.abspath(json_path)}")
        print(f"  Upload spotify_data.json to the hosted site")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate a Spotify Wrapped website from Extended Streaming History data."
    )
    parser.add_argument("folder", help="Path to folder containing Streaming_History_Audio_*.json files")
    parser.add_argument("output_dir", nargs="?", default=None, help="Output directory (default: current working directory)")
    parser.add_argument("--client-id", dest="client_id", default="", help="Spotify app Client ID (enables Export to Spotify feature)")
    args = parser.parse_args()
    output_dir = args.output_dir if args.output_dir is not None else os.getcwd()
    process(args.folder, output_dir, args.client_id)
