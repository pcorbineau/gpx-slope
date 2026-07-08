# GPX-Web Rewrite — Design

**Date:** 2026-07-08
**Goal:** Replace the laggy/buggy Plotly + Python-stdlib app with a modern, fast,
maintainable full-TypeScript stack, preserving every current feature.

## Why it's laggy/buggy today

- Charting via **Plotly 2.35 (CDN)** builds one scatter trace per color run and
  re-lays out on every hover → jank on large tracks.
- Backend is a hand-rolled `http.server` with **O(n²) smoothing** loops and
  **HTTP polling** for progress (fragile, races on reload).
- Two separate HTML pages with duplicated JS; no build step; no types.

## Target stack

| Layer      | Choice                                   | Reason |
|------------|------------------------------------------|--------|
| Runtime    | **Bun**                                  | Fast, TS-native, simple `Bun.serve`. |
| Backend    | **Elysia**                               | Tiny, fast, typed HTTP + WebSocket. |
| Analysis   | Pure TS reimplementation of `analyzer.py`| Port the algorithm; vectorize smoothing with typed arrays. |
| Frontend   | **React + Vite**                         | Component structure, routing, state. |
| Charts     | **uPlot**                                | Canvas, handles 10k+ points at 60fps; fixes lag. |
| Styling    | Plain CSS modules / CSS variables (dark theme) | Modern look, no heavy dep. |
| Comms      | **WebSocket** for progress; REST for data| Replaces polling. |

## Architecture

```
gpx-web/
  server/                 # Elysia + Bun backend (TypeScript)
    index.ts              # Elysia app: routes + websocket
    analyze.ts            # GPX parse + slope + sections (ported from analyzer.py)
    cache.ts              # disk cache (last.gpx, data.json, config.json) via Bun.file
    ws.ts                 # progress channel
  web/                    # React + Vite frontend (TypeScript)
    src/
      main.tsx
      App.tsx             # router (full profile / section/:n)
      components/
        ProfileChart.tsx  # uPlot wrapper + crosshair/hover label
        SectionsTable.tsx # hover highlight, link to section
        SettingsModal.tsx
        UploadBar.tsx
        Spinner.tsx
      lib/
        api.ts            # fetch wrapper
        ws.ts             # websocket progress client
        colors.ts         # slope color scale (shared)
      pages/
        ProfilePage.tsx
        SectionPage.tsx
  uploads/                # runtime cache (git-ignored)
  package.json            # workspace scripts
  README.md
```

## Data flow

1. User selects `.gpx` → `UploadBar` POSTs file to `POST /api/upload?min_dist&min_deniv`.
2. Server opens a WebSocket (client connects on load) and streams `progress`
   messages (`queued` → `parsing` → `smoothing` → `slope` → `sections` → `done`/`error`).
3. Analysis runs in an async task (non-blocking). Result written to `uploads/data.json`
   and GPX copied to `uploads/last.gpx`.
4. On `done`, client fetches `GET /api/data` and renders.
5. Settings → `POST /api/recompute` re-runs with new thresholds (same WS progress).
6. Reload → `GET /api/data` returns cached result; `GET /api/config` restores thresholds.
   If busy on load, client attaches to WS and waits.

## Algorithm (ported faithfully from analyzer.py)

- Parse `<trkpt>` with `lat/lon/ele` (ns-aware), skip points without elevation.
- Haversine cumulative distance `xs`.
- Elevation smoothing: **40 m moving window** — reimplemented with a sliding-window
  running sum over sorted distances (O(n) instead of O(n²)).
- Slope: **60 m window linear regression** (least squares) per point.
- Steps grouped by direction with ±2% hysteresis; segments filtered by
  `min_dist_m` / `min_deniv_m`.
- Output JSON identical in shape to current `course`/`sections` so the frontend
  maps 1:1.

## Chart & interactions (uPlot)

- `ProfileChart`: one filled area for elevation, colored slope bands drawn as
  overlaid series or a custom `draw` hook (per-segment color). uPlot handles
  zoom (wheel/drag) and the range slider natively and smoothly.
- **Custom crosshair**: uPlot `cursor` + `legend` disabled; a `draw` hook paints a
  vertical line and a pinned HTML label (km / altitude / slope %) following the
  cursor — replaces the fragile Plotly relayout approach.
- `SectionsTable` hover → highlight band via uPlot `setCursor`/overlay rect.
- Per-section page scales y-axis to the section.

## Error handling

- Malformed/empty GPX → server returns 400 with message; client shows inline error
  (no alert spam). WS `error` message shows in spinner overlay.
- Upload cancelled/replaced mid-flight → latest request wins; cache only written on success.

## Testing

- `analyze.test.ts`: compare ported output against a known fixture GPX (assert
  section counts / distances match current `analyzer.py` within tolerance).
- `server` smoke test: upload fixture → assert `/api/data` shape + cache files exist.
- Frontend: render `ProfileChart` with synthetic data; assert crosshair label updates.
- Manual: load a large real GPX, verify smooth zoom + hover.

## Out of scope (YAGNI)

- No map, no multi-course compare, no auth, no DB. Pure file cache.

## Migration

- Delete `index.html`, `section.html`, `server.py`, `analyzer.py` after port verified.
- Keep `README.md` updated with new run instructions (`bun install`, `bun run dev`).
