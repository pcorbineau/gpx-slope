# GPX Slope

Interactive web app to visualize a GPX track as an altimetric profile colored by
slope, with automatic detection of climbs and descents (sections).

## Stack

- **Backend:** Bun + Elysia + TypeScript
- **Frontend:** React + Vite + uPlot
- **Cache:** Local disk (uploads/)

## Run

```bash
# Install deps
bun install
cd web && bun install && cd ..

# Start backend (port 8765)
bun run server/index.ts &

# Start frontend dev server (port 5173, proxies API)
cd web && bun run dev

# Open http://localhost:5173
```

## Features

Same as before: slope-colored profile, custom crosshair, sections table with
hover highlight, per-section detail page, upload, configurable thresholds,
disk cache.
