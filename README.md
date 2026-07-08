# GPX Slope

Interactive web app to visualize a GPX track as an altimetric profile colored by
slope, with automatic detection of climbs and descents (sections).

## Features

- **Full-course profile** with zoom (mouse wheel = vertical, Shift+wheel = horizontal, double-click = reset) and a range slider.
- **Slope coloring** using a Tour-de-France-like scale:

  | Color | Slope |
  |-------|-------|
  | green | < 3 % |
  | blue | 3–10 % |
  | yellow | 10–15 % |
  | orange | 15–20 % |
  | red | 20–25 % |
  | black | ≥ 25 % |

- **Custom crosshair**: invisible cursor, a vertical line that follows the mouse, and a label pinned above the graph showing km / altitude / slope %.
- **Sections table**: each detected climb/descent is listed with distance, elevation gain, and average slope. Hovering a row highlights the section on the main graph. Click a row to open its dedicated page.
- **Upload any GPX** — the analysis runs in the background (spinner while processing).
- **Adjustable thresholds**: set the minimum distance and minimum elevation for a section via the ⚙ Settings button, then re-run the analysis.
- **Persistence**: the last uploaded GPX, the config, and the computed result are cached on disk, so restarting the server still shows the last course.
- **Per-section pages** scale the altitude axis to the section (not from 0), using all available vertical space.

## How it works

The slope at each point is computed with a **linear regression over a 60 m moving
window** on a **distance-smoothed elevation** (40 m window). Sections are built by
grouping consecutive points with the same direction (climb/descent) using a small
hysteresis threshold, then filtered by the minimum distance / elevation settings.

## Run

```bash
cd gpx-web
python server.py
# open http://localhost:8765/
```

Requirements: Python 3 (uses only the standard library + `numpy`). `matplotlib`
is not needed for the web app.

Upload a `.gpx` file (or keep the cached course), tweak the section thresholds in
⚙ Settings, and explore the profile and individual sections.

## Files

- `server.py` — HTTP server + API (`/api/data`, `/api/status`, `/api/config`, `/api/upload`, `/api/recompute`).
- `analyzer.py` — GPX parsing, slope computation, and section detection.
- `index.html` — main profile page.
- `section.html` — per-section detail page.
- `uploads/` — local cache (last GPX, `data.json`, `config.json`); git-ignored.
