# GPX Slope

Interactive web app to visualize a GPX track as an altimetric profile colored by
slope, with automatic detection of climbs and descents (sections).

## Stack

- **Backend:** Bun + Elysia (TypeScript)
- **Frontend:** React + Vite + uPlot (canvas chart, 60fps on large tracks)
- **Cache:** Local disk (`uploads/`)
- **Real-time:** WebSocket for analysis progress

## Run

```bash
# Install dependencies
bun install
cd web && bun install && cd ..

# Start backend (port 8765)
bun run dev:server

# In another terminal — start frontend (port 5173, proxies API)
cd web && bun run dev

# Open http://localhost:5173
```

## Production build

```bash
cd web && bun run build
# Output in web/dist/ — serve static files + proxy /api to backend
```

## Features

- **Full-course profile** with zoom (mouse wheel, drag, double-click reset) and range slider
- **Slope coloring** with Tour-de-France scale (green / blue / yellow / orange / red / black)
- **Custom crosshair** — label (km, altitude, slope %) snapped to the elevation line on both the full profile and per-section pages
- **Sections table** — detected climbs and descents with distance, elevation gain, average/min/max slope, and table-wide sorting by any column
- **Upload any GPX** — analysis runs in background, progress via WebSocket
- **Adjustable thresholds** — minimum distance and elevation for section detection
- **Persistence** — last GPX, config, and computed result cached on disk

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/data` | GET | Cached analysis result (course + sections) |
| `/api/config` | GET | Current thresholds |
| `/api/status` | GET | Server status (busy / progress / error) |
| `/api/upload` | POST | Upload GPX file (multipart) |
| `/api/recompute` | POST | Re-run analysis with new thresholds |
| `/ws` | WebSocket | Push progress / done / error messages |
