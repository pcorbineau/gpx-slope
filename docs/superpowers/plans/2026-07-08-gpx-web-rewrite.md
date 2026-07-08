# GPX-Web Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the laggy Python+Plotly GPX viewer with a fast, modern full-TypeScript stack (Bun+Elysia backend, React+Vite+uPlot frontend).

**Architecture:** Monorepo with `server/` (Elysia API + GPX analysis) and `web/` (React frontend built by Vite). The Vite dev proxy routes `/api/*` and `/ws` to the Elysia server. Analysis runs asynchronously, progress pushed via WebSocket, result cached to disk.

**Tech Stack:** Bun 1.3, Elysia, TypeScript, React 19, Vite, uPlot, typed arrays for analysis.

## Global Constraints

- Bun runtime (at `C:\Users\PaulCORBINEAU\.bun\bin\bun.exe`)
- Node v24 available but Bun is primary
- Only standard npm packages, no extra system deps
- CSV/JSON on disk cache in `uploads/` (gitignored)
- Port 8765 (must match existing usage)
- All current features must work: slope-colored profile, custom crosshair, sections table with hover, per-section page, settings modal, upload, recompute, disk persistence
- No map, no auth, no database
- Analysis algorithm must produce identical output shape to current `analyzer.py` (same `course` + `sections` fields)

---

### Task 1: Scaffold Bun project + Elysia server skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `server/index.ts`
- Create: `server/analyze.ts` (skeleton)
- Create: `server/cache.ts`
- Create: `server/ws.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `server/index.ts` starts an Elysia server on port 8765 with placeholder routes, `server/analyze.ts` exports `analyzeGpx(path: string, minDist: number, minDeniv: number) => AnalysisResult`, `server/cache.ts` exports cache helpers, `server/ws.ts` exports WebSocket progress helpers.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "gpx-web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "bun run --hot server/index.ts",
    "build:web": "cd web && bun run build",
    "dev:web": "cd web && bun run dev"
  },
  "dependencies": {
    "elysia": "^1.2",
    "@elysiajs/websocket": "^1.2",
    "typescript": "^5.7",
    "@types/bun": "^1.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": ".",
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["server/**/*.ts"]
}
```

- [ ] **Step 3: Create `server/cache.ts`**

```typescript
import { join } from "path";

const ROOT = import.meta.dir;
const UPLOADS = join(ROOT, "..", "uploads");
const DATA_PATH = join(UPLOADS, "data.json");
const LAST_GPX_PATH = join(UPLOADS, "last.gpx");
const CONFIG_PATH = join(UPLOADS, "config.json");

export function getCacheDir(): string {
  return UPLOADS;
}

export function getDataPath(): string {
  return DATA_PATH;
}

export function getLastGpxPath(): string {
  return LAST_GPX_PATH;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function ensureCacheDir(): void {
  Bun.mkdirSync(UPLOADS, { recursive: true });
}

export function readJson<T>(path: string): T | null {
  try {
    const f = Bun.file(path);
    if (f.size === 0) return null;
    return JSON.parse(Bun.readTextFileSync(path)) as T;
  } catch {
    return null;
  }
}

export function writeJson(path: string, data: unknown): void {
  Bun.writeSync(path, JSON.stringify(data));
}

export function readLastGpx(): Uint8Array | null {
  try {
    const f = Bun.file(LAST_GPX_PATH);
    if (f.size === 0) return null;
    return new Uint8Array(f.arrayBufferSync());
  } catch {
    return null;
  }
}

export function writeLastGpx(data: Uint8Array): void {
  Bun.writeSync(LAST_GPX_PATH, data);
}
```

- [ ] **Step 4: Create `server/ws.ts`**

```typescript
import type { ServerWebSocket } from "bun";

const clients = new Set<ServerWebSocket<unknown>>();

export function addClient(ws: ServerWebSocket<unknown>): void {
  clients.add(ws);
}

export function removeClient(ws: ServerWebSocket<unknown>): void {
  clients.delete(ws);
}

export type ProgressMsg =
  | { type: "progress"; stage: string }
  | { type: "done" }
  | { type: "error"; message: string };

export function broadcast(msg: ProgressMsg): void {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    try {
      ws.send(payload);
    } catch {
      clients.delete(ws);
    }
  }
}
```

- [ ] **Step 5: Create `server/analyze.ts` skeleton**

```typescript
export interface CourseData {
  km: number[];
  ele: number[];
  slope: number[];
  lat: number[];
  lon: number[];
  name: string;
  total_km: number;
}

export interface SectionData {
  n: number;
  dir: "up" | "down";
  start_km: number;
  end_km: number;
  dist_km: number;
  deniv: number;
  avg: number;
  idx_start: number;
  idx_end: number;
}

export interface AnalysisResult {
  course: CourseData;
  sections: SectionData[];
}

// Full implementation in Task 3
export function analyzeGpx(_path: string, _minDist: number, _minDeniv: number): AnalysisResult {
  throw new Error("Not implemented yet");
}
```

- [ ] **Step 6: Create `server/index.ts` skeleton**

```typescript
import { Elysia } from "elysia";
import { websocket } from "@elysiajs/websocket";
import { ensureCacheDir, readJson, getDataPath, getConfigPath } from "./cache";
import { addClient, removeClient, broadcast, type ProgressMsg } from "./ws";

const CONFIG_DEFAULTS = { min_dist_m: 1200, min_deniv_m: 100 };
let config = { ...CONFIG_DEFAULTS };
let analysisPromise: Promise<void> | null = null;

ensureCacheDir();

const loadedConfig = readJson<typeof config>(getConfigPath());
if (loadedConfig) config = { ...config, ...loadedConfig };

const app = new Elysia()
  .use(websocket())
  .ws("/ws", {
    open(ws) {
      addClient(ws.raw);
    },
    close(ws) {
      removeClient(ws.raw);
    },
  })
  .get("/api/data", () => {
    const data = readJson(getDataPath());
    return data ?? { course: null, sections: [] };
  })
  .get("/api/config", () => config)
  .post("/api/config", ({ body }: { body: { min_dist_m?: number; min_deniv_m?: number } }) => {
    if (body.min_dist_m !== undefined) config.min_dist_m = body.min_dist_m;
    if (body.min_deniv_m !== undefined) config.min_deniv_m = body.min_deniv_m;
    writeJson(getConfigPath(), config);
    return config;
  })
  .get("/api/status", () => ({ busy: analysisPromise !== null, progress: "" }))
  .listen(8765);

console.log(`Server running at http://localhost:8765`);
```

- [ ] **Step 7: Install deps and verify it starts**

```bash
cd C:\Users\PaulCORBINEAU\Documents\gpx-web
C:\Users\PaulCORBINEAU\.bun\bin\bun install
```

Expected: `bun.lock` + `node_modules/` created, no errors.

```bash
C:\Users\PaulCORBINEAU\.bun\bin\bun run server/index.ts &
sleep 2
curl -s http://localhost:8765/api/data
```

Expected: `{"course":null,"sections":[]}`

```bash
curl -s http://localhost:8765/api/config
```

Expected: `{"min_dist_m":1200,"min_deniv_m":100}`

Kill background process afterwards.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json server/ bun.lock
git add -N . 2>/dev/null; git add -A server/ package.json tsconfig.json bun.lock 2>/dev/null
git commit -m "feat: scaffold Bun+Elysia server with skeleton routes"
```

---

### Task 2: Write GPX analysis test + fixture

**Files:**
- Create: `server/analyze.test.ts`
- Create: `server/__fixtures__/simple.gpx`

**Interfaces:**
- Consumes: `analyzeGpx(path, minDist, minDeniv) => AnalysisResult` from Task 1
- Produces: passing test that verifies analysis output shape and values

- [ ] **Step 1: Create `server/__fixtures__/simple.gpx`**

A minimal GPX with 3 points forming a climb then a plateau, so we can assert sections:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Test Climb</name>
    <trkseg>
      <trkpt lat="44.0" lon="6.0"><ele>800</ele></trkpt>
      <trkpt lat="44.001" lon="6.001"><ele>850</ele></trkpt>
      <trkpt lat="44.002" lon="6.002"><ele>900</ele></trkpt>
      <trkpt lat="44.003" lon="6.003"><ele>950</ele></trkpt>
      <trkpt lat="44.004" lon="6.004"><ele>1000</ele></trkpt>
      <trkpt lat="44.005" lon="6.005"><ele>1050</ele></trkpt>
      <trkpt lat="44.006" lon="6.006"><ele>1050</ele></trkpt>
      <trkpt lat="44.007" lon="6.007"><ele>1050</ele></trkpt>
      <trkpt lat="44.008" lon="6.008"><ele>1050</ele></trkpt>
      <trkpt lat="44.009" lon="6.009"><ele>1000</ele></trkpt>
    </trkseg>
  </trk>
</gpx>
```

- [ ] **Step 2: Create `server/analyze.test.ts`**

```typescript
import { describe, it, expect } from "bun:test";
import { analyzeGpx } from "./analyze";
import { join } from "path";

const FIXTURE = join(import.meta.dir, "__fixtures__", "simple.gpx");

describe("analyzeGpx", () => {
  it("returns course and sections for a valid GPX", () => {
    const result = analyzeGpx(FIXTURE, 0, 0);
    expect(result.course).toBeDefined();
    expect(result.course.km).toBeInstanceOf(Array);
    expect(result.course.km.length).toBe(10);
    expect(result.course.ele.length).toBe(10);
    expect(result.course.slope.length).toBe(10);
    expect(result.course.lat.length).toBe(10);
    expect(result.course.lon.length).toBe(10);
    expect(result.course.total_km).toBeGreaterThan(0);
    expect(result.sections).toBeInstanceOf(Array);
  });

  it("detects a climb section", () => {
    const result = analyzeGpx(FIXTURE, 100, 50);
    // The first 6 points go up ~250m, should be 'up'
    const upSections = result.sections.filter((s) => s.dir === "up");
    expect(upSections.length).toBeGreaterThanOrEqual(1);
  });

  it("filters by min distance and min deniv", () => {
    const resultSmall = analyzeGpx(FIXTURE, 0, 0);
    const resultFiltered = analyzeGpx(FIXTURE, 99999, 99999);
    expect(resultFiltered.sections.length).toBeLessThan(resultSmall.sections.length);
  });

  it("handles malformed or missing files gracefully", () => {
    expect(() => analyzeGpx("/nonexistent.gpx", 0, 0)).toThrow();
  });
});
```

- [ ] **Step 3: Run test (expect fail — analyzeGpx not implemented)**

```bash
C:\Users\PaulCORBINEAU\.bun\bin\bun test server/analyze.test.ts
```

Expected: Throws "Not implemented yet" or similar error.

- [ ] **Step 4: Commit**

```bash
git add server/analyze.test.ts server/__fixtures__/simple.gpx
git commit -m "test: add GPX analysis test with fixture"
```

---

### Task 3: Port GPX analysis algorithm from Python to TypeScript

**Files:**
- Modify: `server/analyze.ts` (replace skeleton with full implementation)

**Interfaces:**
- Consumes: GPX file path, analysis returns `AnalysisResult`
- Produces: Working analysis engine matching original `analyzer.py` output shape

- [ ] **Step 1: Implement `analyzeGpx` in `server/analyze.ts`**

```typescript
import { readFileSync } from "fs";
import { basename } from "path";

// -- GPX parsing -----------------------------------------------------------
interface RawPoint {
  lat: number;
  lon: number;
  ele: number;
}

function parseGpx(path: string): { pts: RawPoint[]; name: string } {
  const xml = readFileSync(path, "utf-8");
  const pts: RawPoint[] = [];

  const trkptRe = /<trkpt[^>]*lat="([^"]+)"\s*lon="([^"]+)"[^>]*>[\s\S]*?<\/trkpt>/gi;
  let match: RegExpExecArray | null;
  while ((match = trkptRe.exec(xml)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const eleMatch = match[0].match(/<ele>([^<]+)<\/ele>/i);
    if (!eleMatch) continue;
    const ele = parseFloat(eleMatch[1]);
    pts.push({ lat, lon, ele });
  }

  const nameMatch = xml.match(/<name>([^<]+)<\/name>/i);
  const name = nameMatch ? nameMatch[1] : basename(path).replace(/\.gpx$/i, "");
  return { pts, name };
}

// -- Haversine distance ----------------------------------------------------
function haversine(a: RawPoint, b: RawPoint): number {
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// -- Moving window helpers -------------------------------------------------
/** Compute cumulative distances in meters. */
function cumulativeDistances(pts: RawPoint[]): number[] {
  const xs = [0];
  for (let i = 1; i < pts.length; i++) {
    xs.push(xs[i - 1] + haversine(pts[i - 1], pts[i]));
  }
  return xs;
}

/** Sliding-window mean over elevation. O(n) via two-pointer accumulation. */
function smoothElevation(pts: RawPoint[], xs: number[], window: number): number[] {
  const n = pts.length;
  const ele = pts.map((p) => p.ele);
  const smoothed = new Array<number>(n);
  let lo = 0;
  let hi = 0;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < n; i++) {
    const xLo = xs[i] - window;
    const xHi = xs[i] + window;

    // advance lo pointer
    while (lo < n && xs[lo] < xLo) {
      sum -= ele[lo];
      count--;
      lo++;
    }
    // advance hi pointer
    while (hi < n && xs[hi] <= xHi) {
      sum += ele[hi];
      count++;
      hi++;
    }
    smoothed[i] = count > 0 ? sum / count : ele[i];
  }
  return smoothed;
}

// -- Linear regression slope per point -------------------------------------
function computeSlopes(
  xs: number[],
  eleSmoothed: number[],
  window: number
): number[] {
  const n = xs.length;
  const slopes = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const xLo = xs[i] - window;
    const xHi = xs[i] + window;

    // Collect points in window
    const xw: number[] = [];
    const yw: number[] = [];
    for (let j = 0; j < n; j++) {
      if (xs[j] >= xLo && xs[j] <= xHi) {
        xw.push(xs[j]);
        yw.push(eleSmoothed[j]);
      }
    }

    if (xw.length < 3) {
      slopes[i] = 0;
      continue;
    }

    // Simple linear regression: y = m*x + b
    const nw = xw.length;
    let sumX = 0, sumY = 0, sumX2 = 0, sumXY = 0;
    for (let k = 0; k < nw; k++) {
      sumX += xw[k];
      sumY += yw[k];
      sumX2 += xw[k] * xw[k];
      sumXY += xw[k] * yw[k];
    }
    const m = (nw * sumXY - sumX * sumY) / (nw * sumX2 - sumX * sumX);
    slopes[i] = m * 100; // percent
  }

  return slopes;
}

// -- Section detection -----------------------------------------------------
interface Step {
  d: number;
  dh: number;
  km: number;
  i0: number;
  i1: number;
  slope: number;
  dir: "up" | "down" | "flat" | null;
}

// -- Public API ------------------------------------------------------------
export interface CourseData {
  km: number[];
  ele: number[];
  slope: number[];
  lat: number[];
  lon: number[];
  name: string;
  total_km: number;
}

export interface SectionData {
  n: number;
  dir: "up" | "down";
  start_km: number;
  end_km: number;
  dist_km: number;
  deniv: number;
  avg: number;
  idx_start: number;
  idx_end: number;
}

export interface AnalysisResult {
  course: CourseData;
  sections: SectionData[];
}

export function analyzeGpx(
  path: string,
  minDistM: number,
  minDenivM: number
): AnalysisResult {
  const { pts, name } = parseGpx(path);
  if (pts.length < 2) throw new Error("GPX without valid points");

  const xs = cumulativeDistances(pts);
  const eleSmoothed = smoothElevation(pts, xs, 40);
  const slopes = computeSlopes(xs, eleSmoothed, 60);

  // Build steps (intermediate between consecutive points)
  const steps: Step[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = xs[i] - xs[i - 1];
    const dh = eleSmoothed[i] - eleSmoothed[i - 1];
    steps.push({
      d,
      dh,
      km: xs[i],
      i0: i - 1,
      i1: i,
      slope: (slopes[i - 1] + slopes[i]) / 2,
      dir: null,
    });
  }

  // Assign direction with hysteresis
  const upThr = 2.0;
  const downThr = -2.0;
  let lastDir: Step["dir"] = null;
  for (const s of steps) {
    if (s.dh > upThr) {
      s.dir = "up";
      lastDir = "up";
    } else if (s.dh < downThr) {
      s.dir = "down";
      lastDir = "down";
    } else {
      s.dir = lastDir ?? "flat";
    }
  }

  // Group consecutive same-direction steps into segments
  interface Segment {
    dir: "up" | "down";
    steps: Step[];
    start_km: number;
    end_km: number;
  }
  const segs: Segment[] = [];
  let cur: Segment | null = null;

  for (const s of steps) {
    if (s.d === 0) continue;
    if (!cur) {
      cur = {
        dir: s.dir as "up" | "down",
        steps: [s],
        start_km: s.km - s.d,
        end_km: s.km,
      };
    } else if (s.dir === cur.dir) {
      cur.steps.push(s);
      cur.end_km = s.km;
    } else {
      segs.push(cur);
      cur = {
        dir: s.dir as "up" | "down",
        steps: [s],
        start_km: s.km - s.d,
        end_km: s.km,
      };
    }
  }
  if (cur) segs.push(cur);

  // Filter by min distance and min elevation
  const filtered = segs.filter((seg) => {
    const dist = seg.steps.reduce((sum, st) => sum + st.d, 0);
    const dh = seg.steps.reduce((sum, st) => sum + st.dh, 0);
    return dist > minDistM && Math.abs(dh) > minDenivM;
  });

  // Build output
  const sections: SectionData[] = filtered.map((seg, n) => {
    const idxsSet = new Set<number>();
    for (const st of seg.steps) {
      idxsSet.add(st.i0);
      idxsSet.add(st.i1);
    }
    const idxs = Array.from(idxsSet).sort((a, b) => a - b);
    const distSeg = seg.steps.reduce((sum, st) => sum + st.d, 0);
    const deniv = seg.steps.reduce((sum, st) => sum + st.dh, 0);
    const avg = (deniv / distSeg) * 100;

    return {
      n: n + 1,
      dir: seg.dir as "up" | "down",
      start_km: Math.round((xs[idxs[0]] / 1000) * 1000) / 1000,
      end_km: Math.round((xs[idxs[idxs.length - 1]] / 1000) * 1000) / 1000,
      dist_km: Math.round((distSeg / 1000) * 1000) / 1000,
      deniv: Math.round(deniv * 10) / 10,
      avg: Math.round(avg * 10) / 10,
      idx_start: idxs[0],
      idx_end: idxs[idxs.length - 1],
    };
  });

  return {
    course: {
      km: xs.map((x) => Math.round((x / 1000) * 10000) / 10000),
      ele: eleSmoothed.map((e) => Math.round(e * 10) / 10),
      slope: slopes.map((s) => Math.round(s * 100) / 100),
      lat: pts.map((p) => Math.round(p.lat * 1e6) / 1e6),
      lon: pts.map((p) => Math.round(p.lon * 1e6) / 1e6),
      name,
      total_km: Math.round((xs[xs.length - 1] / 1000) * 100) / 100,
    },
    sections,
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
C:\Users\PaulCORBINEAU\.bun\bin\bun test server/analyze.test.ts
```

Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/analyze.ts
git commit -m "feat: port GPX analysis algorithm from Python to TypeScript"
```

---

### Task 4: Implement upload + recompute with WebSocket progress

**Files:**
- Modify: `server/index.ts` (add upload and recompute handlers)
- Modify: `server/cache.ts` (ensure `writeLastGpx` works with Bun.Blob)
- Create: `server/handler.ts` (extract upload/recompute logic)

**Interfaces:**
- Consumes: `analyzeGpx` from Task 3, `broadcast` from Task 1
- Produces: `POST /api/upload` accepts multipart GPX, runs analysis async, pushes progress via WS; `POST /api/recompute` re-runs with current config

- [ ] **Step 1: Create `server/handler.ts`**

```typescript
import { analyzeGpx, type AnalysisResult } from "./analyze";
import { broadcast } from "./ws";
import { writeJson, getDataPath, writeLastGpx, getLastGpxPath, exists } from "./cache";
import { unlinkSync } from "fs";

export async function runAnalysis(
  gpxPath: string,
  minDist: number,
  minDeniv: number,
  onProgress?: (stage: string) => void
): Promise<AnalysisResult> {
  onProgress?.("parsing");
  broadcast({ type: "progress", stage: "parsing" });

  // Small delay so WS message gets sent before CPU-bound work
  await new Promise((r) => setTimeout(r, 0));

  const result = analyzeGpx(gpxPath, minDist, minDeniv);

  onProgress?.("caching");
  broadcast({ type: "progress", stage: "caching" });

  writeJson(getDataPath(), result);

  // Copy GPX to last.gpx if it's not already there
  if (gpxPath !== getLastGpxPath()) {
    const content = Bun.file(gpxPath);
    writeLastGpx(new Uint8Array(await content.arrayBuffer()));
  }

  return result;
}
```

- [ ] **Step 2: Update `server/cache.ts` to add `exists` helper**

Add to `cache.ts`:

```typescript
export function exists(path: string): boolean {
  try {
    const f = Bun.file(path);
    return f.size > 0;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Update `server/index.ts` with upload + recompute handlers**

Replace the skeleton with the full implementation:

```typescript
import { Elysia } from "elysia";
import { websocket } from "@elysiajs/websocket";
import {
  ensureCacheDir,
  readJson,
  getDataPath,
  getConfigPath,
  getLastGpxPath,
  getCacheDir,
  exists,
  writeJson,
} from "./cache";
import { addClient, removeClient, broadcast } from "./ws";
import { runAnalysis } from "./handler";
import { join } from "path";
import { randomUUID } from "crypto";
import { unlinkSync } from "fs";

const CONFIG_DEFAULTS = { min_dist_m: 1200, min_deniv_m: 100 };
let config = { ...CONFIG_DEFAULTS };
let analysisPromise: Promise<void> | null = null;

ensureCacheDir();

const loadedConfig = readJson<typeof config>(getConfigPath());
if (loadedConfig) config = { ...config, ...loadedConfig };

// Write config on changes
function persistConfig() {
  writeJson(getConfigPath(), config);
}

const app = new Elysia()
  .use(websocket())
  .ws("/ws", {
    open(ws) {
      addClient(ws.raw);
    },
    close(ws) {
      removeClient(ws.raw);
    },
  })
  .get("/api/data", () => {
    const data = readJson(getDataPath());
    return data ?? { course: null, sections: [] };
  })
  .get("/api/config", () => config)
  .get("/api/status", () => ({
    busy: analysisPromise !== null,
    progress: "",
    error: null,
  }))
  .post("/api/upload", async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return new Response(JSON.stringify({ error: "no file" }), { status: 400 });

    const params = new URL(request.url).searchParams;
    const minDist = parseInt(params.get("min_dist") ?? String(config.min_dist_m), 10);
    const minDeniv = parseInt(params.get("min_deniv") ?? String(config.min_deniv_m), 10);

    const tmpPath = join(getCacheDir(), `upload_${randomUUID()}.gpx`);
    const buf = await file.arrayBuffer();
    Bun.writeSync(tmpPath, new Uint8Array(buf));

    analysisPromise = runAnalysis(tmpPath, minDist, minDeniv)
      .then(() => {
        broadcast({ type: "done" });
      })
      .catch((err) => {
        broadcast({ type: "error", message: err.message });
      })
      .finally(() => {
        analysisPromise = null;
        try {
          unlinkSync(tmpPath);
        } catch {}
      });

    return { accepted: true };
  })
  .post("/api/recompute", async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const minDist = parseInt(params.get("min_dist") ?? String(config.min_dist_m), 10);
    const minDeniv = parseInt(params.get("min_deniv") ?? String(config.min_deniv_m), 10);

    config.min_dist_m = minDist;
    config.min_deniv_m = minDeniv;
    persistConfig();

    const lastGpx = getLastGpxPath();
    if (!exists(lastGpx)) {
      return new Response(JSON.stringify({ error: "aucun GPX en cache" }), { status: 400 });
    }

    analysisPromise = runAnalysis(lastGpx, minDist, minDeniv)
      .then(() => {
        broadcast({ type: "done" });
      })
      .catch((err) => {
        broadcast({ type: "error", message: err.message });
      })
      .finally(() => {
        analysisPromise = null;
      });

    return { accepted: true };
  })
  .listen(8765);

console.log(`Server running at http://localhost:8765`);
```

- [ ] **Step 4: Start server and test upload**

```bash
# In one terminal
C:\Users\PaulCORBINEAU\.bun\bin\bun run server/index.ts &
sleep 2

# Test upload
curl -s -F "file=@server/__fixtures__/simple.gpx" http://localhost:8765/api/upload
```

Expected: `{"accepted":true}`

- [ ] **Step 5: Wait and verify data appeared**

```bash
sleep 3
curl -s http://localhost:8765/api/data | bun -e "const d=JSON.parse(await new Response(process.stdin).text()); console.log('course:', d.course?.name, 'sections:', d.sections?.length)"
```

Expected: `course: simple sections: <number>`

```bash
curl -s http://localhost:8765/api/status
```

Expected: `{"busy":false,"progress":"","error":null}`

Kill background server.

- [ ] **Step 6: Commit**

```bash
git add server/index.ts server/handler.ts server/cache.ts
git commit -m "feat: add upload and recompute handlers with WS progress"
```

---

### Task 5: Scaffold React + Vite frontend

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/pages/ProfilePage.tsx` (placeholder)
- Create: `web/src/pages/SectionPage.tsx` (placeholder)

**Interfaces:**
- Consumes: Server running on port 8765
- Produces: Vite dev server proxying `/api` and `/ws` to Bun backend, renders React app with two routes

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "gpx-web-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "uplot": "^1.6"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `web/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8765",
      "/ws": {
        target: "ws://localhost:8765",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
```

- [ ] **Step 4: Create `web/index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GPX Slope</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⛰️</text></svg>" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: Create `web/src/main.tsx`**

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

- [ ] **Step 6: Create `web/src/App.tsx`**

```typescript
import { Routes, Route, Navigate } from "react-router-dom";
import ProfilePage from "./pages/ProfilePage";
import SectionPage from "./pages/SectionPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProfilePage />} />
      <Route path="/section/:n" element={<SectionPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 7: Create placeholder `web/src/pages/ProfilePage.tsx`**

```typescript
export default function ProfilePage() {
  return (
    <div>
      <h1>GPX Profile</h1>
      <p>Profile page placeholder</p>
    </div>
  );
}
```

- [ ] **Step 8: Create placeholder `web/src/pages/SectionPage.tsx`**

```typescript
import { useParams } from "react-router-dom";

export default function SectionPage() {
  const { n } = useParams();
  return (
    <div>
      <h1>Section {n}</h1>
      <a href="/">← Back to profile</a>
    </div>
  );
}
```

- [ ] **Step 9: Install frontend deps and verify it starts**

```bash
cd C:\Users\PaulCORBINEAU\Documents\gpx-web\web
C:\Users\PaulCORBINEAU\.bun\bin\bun install
```

Expected: `node_modules/` and `bun.lock` created.

```bash
C:\Users\PaulCORBINEAU\.bun\bin\bun run dev &
sleep 3
curl -s http://localhost:5173/
```

Expected: Returns the index.html with script tags.

Kill background Vite process.

- [ ] **Step 10: Commit**

```bash
git add web/
git commit -m "feat: scaffold React+Vite frontend with routing"
```

---

### Task 6: Build shared frontend utilities (API, WS, types, colors)

**Files:**
- Create: `web/src/lib/api.ts`
- Create: `web/src/lib/ws.ts`
- Create: `web/src/lib/colors.ts`
- Create: `web/src/lib/types.ts`

**Interfaces:**
- Consumes: Server API endpoints
- Produces: Typed fetch helpers, WebSocket progress client, slope color scale, shared TypeScript types

- [ ] **Step 1: Create `web/src/lib/types.ts`**

```typescript
export interface CourseData {
  km: number[];
  ele: number[];
  slope: number[];
  lat: number[];
  lon: number[];
  name: string;
  total_km: number;
}

export interface SectionData {
  n: number;
  dir: "up" | "down";
  start_km: number;
  end_km: number;
  dist_km: number;
  deniv: number;
  avg: number;
  idx_start: number;
  idx_end: number;
}

export interface AnalysisResult {
  course: CourseData | null;
  sections: SectionData[];
}

export interface ServerStatus {
  busy: boolean;
  progress: string;
  error: string | null;
}

export interface ConfigData {
  min_dist_m: number;
  min_deniv_m: number;
}

export type ProgressMsg =
  | { type: "progress"; stage: string }
  | { type: "done" }
  | { type: "error"; message: string };
```

- [ ] **Step 2: Create `web/src/lib/api.ts`**

```typescript
import type { AnalysisResult, ConfigData, ServerStatus } from "./types";

const BASE = "";

export async function fetchData(): Promise<AnalysisResult> {
  const res = await fetch(`${BASE}/api/data`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchStatus(): Promise<ServerStatus> {
  const res = await fetch(`${BASE}/api/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchConfig(): Promise<ConfigData> {
  const res = await fetch(`${BASE}/api/config`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function uploadGpx(
  file: File,
  minDist: number,
  minDeniv: number
): Promise<void> {
  const fd = new FormData();
  fd.append("file", file);
  const url = `${BASE}/api/upload?min_dist=${minDist}&min_deniv=${minDeniv}`;
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
}

export async function recomputeAnalysis(
  minDist: number,
  minDeniv: number
): Promise<void> {
  const url = `${BASE}/api/recompute?min_dist=${minDist}&min_deniv=${minDeniv}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Recompute failed: HTTP ${res.status}`);
}
```

- [ ] **Step 3: Create `web/src/lib/ws.ts`**

```typescript
import type { ProgressMsg } from "./types";

export type ProgressCallback = (msg: ProgressMsg) => void;

export function connectProgressWs(
  onMessage: ProgressCallback,
  onError?: (err: Event) => void
): WebSocket {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onmessage = (event) => {
    try {
      const msg: ProgressMsg = JSON.parse(event.data);
      onMessage(msg);
    } catch {
      // ignore malformed
    }
  };

  ws.onerror = (err) => onError?.(err);

  return ws;
}
```

- [ ] **Step 4: Create `web/src/lib/colors.ts`**

```typescript
export function slopeColor(v: number): string {
  const a = Math.abs(v);
  if (a < 3) return "#2ca25f";
  if (a < 10) return "#1f77b4";
  if (a < 15) return "#fee08b";
  if (a < 20) return "#fc8d59";
  if (a < 25) return "#d73027";
  return "#000000";
}

export const SLOPE_LEGEND = [
  { color: "#2ca25f", label: "< 3%" },
  { color: "#1f77b4", label: "3–10%" },
  { color: "#fee08b", label: "10–15%" },
  { color: "#fc8d59", label: "15–20%" },
  { color: "#d73027", label: "20–25%" },
  { color: "#000000", label: "≥ 25%" },
] as const;
```

- [ ] **Step 5: Verify build works**

```bash
cd C:\Users\PaulCORBINEAU\Documents\gpx-web\web
C:\Users\PaulCORBINEAU\.bun\bin\bun run tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/
git commit -m "feat: add shared frontend utilities (API, WS, colors, types)"
```

---

### Task 7: Build ProfileChart component (uPlot + crosshair)

**Files:**
- Create: `web/src/components/ProfileChart.tsx`
- Create: `web/src/components/ProfileChart.css`

**Interfaces:**
- Consumes: `CourseData` from types, `slopeColor`
- Produces: React component that renders main elevation profile with slope coloring, custom crosshair with pinned label, zoom, range slider

- [ ] **Step 1: Create `web/src/components/ProfileChart.css`**

```css
.chart-wrapper {
  position: relative;
  width: 100%;
  height: 620px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,.1);
  cursor: none;
}

.chart-wrapper .u-legend {
  display: none !important;
}

.crosshair-label {
  position: absolute;
  top: 8px;
  right: 12px;
  background: rgba(26, 26, 46, 0.9);
  color: #fff;
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 6px;
  pointer-events: none;
  white-space: nowrap;
  font-family: system-ui, -apple-system, sans-serif;
  z-index: 10;
}
```

- [ ] **Step 2: Create `web/src/components/ProfileChart.tsx`**

```typescript
import { useRef, useEffect, useCallback } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { CourseData } from "../lib/types";
import { slopeColor } from "../lib/colors";
import "./ProfileChart.css";

interface Props {
  course: CourseData;
  highlightRange?: [number, number] | null;
  highlightColor?: string;
  onHoverKm?: (km: number | null) => void;
}

export default function ProfileChart({
  course,
  highlightRange,
  highlightColor = "rgba(44,162,95,0.18)",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const { km, ele, slope } = course;
    if (km.length < 2) return;

    // Build colored slope band series: each color run as a separate series
    // We'll use a custom draw hook instead for performance — draw a single
    // poly fill split by color. uPlot doesn't natively do per-segment coloring
    // on a single series, so we overlay multiple area series.

    const rawData: (number | null)[][] = [];
    const series: uPlot.Series[] = [];

    // Series 0: grey fill baseline
    rawData.push(km.slice());
    series.push({
      label: "elevation",
      fill: "rgba(230,230,230,0.6)",
      stroke: "rgba(230,230,230,0)",
      width: 0,
    });

    // Split by slope color runs
    let i = 1;
    while (i < km.length) {
      const c = slopeColor(slope[i]);
      let j = i;
      while (j < km.length && slopeColor(slope[j]) === c) j++;

      const xs: (number | null)[] = new Array(km.length).fill(null);
      const ys: (number | null)[] = new Array(ele.length).fill(null);
      for (let k = i - 1; k <= j && k < km.length; k++) {
        xs[k] = km[k];
        ys[k] = ele[k];
      }

      rawData.push(xs);
      series.push({
        label: c,
        fill: c + "99",
        stroke: c,
        width: 3,
      });

      i = j;
    }

    // Crosshair cursor: hide default, use overlay
    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: 620,
      cursor: {
        show: true,
        drag: { x: true, y: true },
        points: { show: false },
      },
      select: { show: false, left: 0, top: 0, width: 0, height: 0 },
      legend: { show: false },
      axes: [
        { stroke: "#666", grid: { stroke: "rgba(0,0,0,0.06)" }, label: "Distance (km)" },
        { stroke: "#666", grid: { stroke: "rgba(0,0,0,0.06)" }, label: "Altitude (m)" },
      ],
      series: [
        {},
        ...series.map((s) => ({
          ...s,
          points: { show: false } as uPlot.Series.Points,
        })),
      ],
      hooks: {
        ready: [(u) => {
          chartRef.current = u;
        }],
        setCursor: [
          (u) => {
            const label = containerRef.current?.querySelector(".crosshair-label") as HTMLElement | null;
            if (!label || u.cursor.idx === null) return;
            const idx = u.cursor.idx;
            const kmVal = km[idx];
            const eleVal = ele[idx];
            const slopeVal = slope[idx];
            label.textContent =
              `km ${kmVal.toFixed(2)} · alt ${eleVal.toFixed(0)} m · pente ${slopeVal.toFixed(1)} %`;
          },
        ],
      },
    };

    const chart = new uPlot(opts, rawData, containerRef.current);

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [course]);

  // Highlight section via overlay rect
  useEffect(() => {
    if (!chartRef.current || !highlightRange || !containerRef.current) return;
    const u = chartRef.current;
    const p0 = u.valToPos(highlightRange[0], "x");
    const p1 = u.valToPos(highlightRange[1], "x");
    const left = Math.min(p0, p1);
    const width = Math.abs(p1 - p0);

    let overlay = containerRef.current.querySelector(".section-overlay") as HTMLElement | null;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "section-overlay";
      overlay.style.cssText =
        `position:absolute;top:0;bottom:0;pointer-events:none;z-index:5;background:${highlightColor};`;
      containerRef.current.appendChild(overlay);
    }
    overlay.style.left = `${left}px`;
    overlay.style.width = `${width}px`;
    overlay.style.background = highlightColor;
  }, [highlightRange, highlightColor, course.km]);

  return (
    <div className="chart-wrapper" ref={containerRef}>
      <div className="crosshair-label">Survolez le graphique</div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd C:\Users\PaulCORBINEAU\Documents\gpx-web\web
C:\Users\PaulCORBINEAU\.bun\bin\bun run tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/
git commit -m "feat: add ProfileChart uPlot component with crosshair"
```

---

### Task 8: Build SectionsTable component

**Files:**
- Create: `web/src/components/SectionsTable.tsx`

**Interfaces:**
- Consumes: `SectionData[]`, `onHoverSection`, `onLeaveSection`
- Produces: Table of sections with hover highlighting and links to per-section pages

- [ ] **Step 1: Create `web/src/components/SectionsTable.tsx`**

```typescript
import type { SectionData } from "../lib/types";

interface Props {
  sections: SectionData[];
  onHoverSection: (s: SectionData | null) => void;
}

export default function SectionsTable({ sections, onHoverSection }: Props) {
  if (sections.length === 0) return null;

  return (
    <table style={{
      width: "100%",
      borderCollapse: "collapse",
      marginTop: 16,
      background: "#fff",
      borderRadius: 8,
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,.1)",
      fontSize: 13,
    }}>
      <thead>
        <tr style={{ background: "#1a1a2e", color: "#fff" }}>
          <th style={thStyle}>#</th>
          <th style={thStyle}>Type</th>
          <th style={thStyle}>Début course</th>
          <th style={thStyle}>Dist.</th>
          <th style={thStyle}>Déniv.</th>
          <th style={thStyle}>Pente moy.</th>
          <th style={thStyle}>Profil</th>
        </tr>
      </thead>
      <tbody>
        {sections.map((s) => (
          <tr
            key={s.n}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => onHoverSection(s)}
            onMouseLeave={() => onHoverSection(null)}
          >
            <td style={tdStyle}>{s.n}</td>
            <td style={tdStyle}>
              <span style={{ color: s.dir === "up" ? "#2ca25f" : "#d73027", fontWeight: 600 }}>
                {s.dir === "up" ? "Montée" : "Descente"}
              </span>
            </td>
            <td style={tdStyle}>{s.start_km.toFixed(1)} km</td>
            <td style={tdStyle}>{s.dist_km.toFixed(2)} km</td>
            <td style={tdStyle}>
              {s.deniv > 0 ? "+" : ""}{s.deniv.toFixed(0)} m
            </td>
            <td style={tdStyle}>{s.avg.toFixed(1)} %</td>
            <td style={tdStyle}>
              <a href={`/section/${s.n}`} style={{ color: "#1f77b4", fontWeight: 600, textDecoration: "none" }}>
                Ouvrir →
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontSize: 13,
  borderBottom: "1px solid #eee",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #eee",
};
```

- [ ] **Step 2: Verify compiles**

```bash
cd C:\Users\PaulCORBINEAU\Documents\gpx-web\web
C:\Users\PaulCORBINEAU\.bun\bin\bun run tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/SectionsTable.tsx
git commit -m "feat: add SectionsTable component"
```

---

### Task 9: Build SettingsModal component

**Files:**
- Create: `web/src/components/SettingsModal.tsx`

**Interfaces:**
- Consumes: current config, callbacks for close and recompute
- Produces: Modal with distance/elevation inputs

- [ ] **Step 1: Create `web/src/components/SettingsModal.tsx`**

```typescript
import { useState } from "react";
import type { ConfigData } from "../lib/types";

interface Props {
  config: ConfigData;
  onClose: () => void;
  onRecompute: (minDist: number, minDeniv: number) => void;
}

export default function SettingsModal({ config, onClose, onRecompute }: Props) {
  const [minDist, setMinDist] = useState(config.min_dist_m);
  const [minDeniv, setMinDeniv] = useState(config.min_deniv_m);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          padding: "24px 28px",
          borderRadius: 12,
          width: 340,
          boxShadow: "0 4px 20px rgba(0,0,0,.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px" }}>Réglages d'analyse</h3>
        <label style={{ display: "block", fontSize: 13, marginBottom: 14, color: "#444" }}>
          Distance minimale d'une section (m)
          <input
            type="number"
            min={0}
            step={50}
            value={minDist}
            onChange={(e) => setMinDist(Number(e.target.value))}
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: 8,
              border: "1px solid #ccc",
              borderRadius: 6,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </label>
        <label style={{ display: "block", fontSize: 13, marginBottom: 14, color: "#444" }}>
          Dénivelé minimal d'une section (m)
          <input
            type="number"
            min={0}
            step={5}
            value={minDeniv}
            onChange={(e) => setMinDeniv(Number(e.target.value))}
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: 8,
              border: "1px solid #ccc",
              borderRadius: 6,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </label>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button
            onClick={onClose}
            style={{
              background: "#888",
              color: "#fff",
              border: 0,
              padding: "8px 14px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => onRecompute(minDist, minDeniv)}
            style={{
              background: "#3a86ff",
              color: "#fff",
              border: 0,
              padding: "8px 14px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Relancer l'analyse
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/SettingsModal.tsx
git commit -m "feat: add SettingsModal component"
```

---

### Task 10: Build Spinner / overlay component

**Files:**
- Create: `web/src/components/Spinner.tsx`

- [ ] **Step 1: Create `web/src/components/Spinner.tsx`**

```typescript
interface Props {
  visible: boolean;
  message?: string;
}

export default function Spinner({ visible, message = "Analyse en cours..." }: Props) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: "24px 32px",
          borderRadius: 12,
          textAlign: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,.3)",
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            border: "5px solid #eee",
            borderTopColor: "#3a86ff",
            borderRadius: "50%",
            margin: "0 auto 12px",
            animation: "spin 1s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 14, color: "#444" }}>{message}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/Spinner.tsx
git commit -m "feat: add Spinner overlay component"
```

---

### Task 11: Integrate ProfilePage (main page with all components)

**Files:**
- Modify: `web/src/pages/ProfilePage.tsx`
- Create: `web/src/pages/ProfilePage.css`

- [ ] **Step 1: Create `web/src/pages/ProfilePage.css`**

```css
body {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  margin: 0;
  background: #f5f6f8;
  color: #222;
}

header {
  background: #1a1a2e;
  color: #fff;
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

header h1 { margin: 0; font-size: 20px; }
header p { margin: 4px 0 0; opacity: .7; font-size: 13px; }

.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
}

.toolbar input[type=file] { color: #fff; font-size: 12px; }

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}

.legend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin: 12px 0;
  font-size: 13px;
  align-items: center;
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sw {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  display: inline-block;
}

.hint {
  font-size: 12px;
  opacity: .6;
  margin-top: 6px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #888;
  font-size: 14px;
}
```

- [ ] **Step 2: Rewrite `web/src/pages/ProfilePage.tsx`**

```typescript
import { useState, useEffect, useRef, useCallback } from "react";
import type { AnalysisResult, ConfigData, SectionData, ProgressMsg } from "../lib/types";
import { fetchData, fetchConfig, uploadGpx, recomputeAnalysis } from "../lib/api";
import { connectProgressWs } from "../lib/ws";
import { SLOPE_LEGEND } from "../lib/colors";
import ProfileChart from "../components/ProfileChart";
import SectionsTable from "../components/SectionsTable";
import SettingsModal from "../components/SettingsModal";
import Spinner from "../components/Spinner";
import "./ProfilePage.css";

export default function ProfilePage() {
  const [data, setData] = useState<AnalysisResult>({ course: null, sections: [] });
  const [config, setConfig] = useState<ConfigData>({ min_dist_m: 1200, min_deniv_m: 100 });
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState("Analyse en cours...");
  const [showSettings, setShowSettings] = useState(false);
  const [highlightSection, setHighlightSection] = useState<SectionData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load initial data and config
  useEffect(() => {
    fetchData().then(setData).catch(console.error);
    fetchConfig().then(setConfig).catch(console.error);
  }, []);

  // Connect to WebSocket for progress updates
  useEffect(() => {
    const ws = connectProgressWs((msg: ProgressMsg) => {
      if (msg.type === "progress") {
        setProgressMsg(
          msg.stage === "parsing" ? "Parsing GPX..."
          : msg.stage === "caching" ? "Saving results..."
          : "Analyse en cours..."
        );
      } else if (msg.type === "done") {
        setBusy(false);
        fetchData().then(setData).catch(console.error);
      } else if (msg.type === "error") {
        setBusy(false);
        alert(msg.message);
      }
    });
    return () => ws.close();
  }, []);

  const handleUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      alert("Choisissez un fichier GPX");
      return;
    }
    setBusy(true);
    setProgressMsg("Envoi du fichier...");
    try {
      await uploadGpx(file, config.min_dist_m, config.min_deniv_m);
      // WS will handle the rest
    } catch (err) {
      setBusy(false);
      alert("Erreur upload: " + (err as Error).message);
    }
  }, [config]);

  const handleRecompute = useCallback(async (minDist: number, minDeniv: number) => {
    setShowSettings(false);
    setBusy(true);
    setProgressMsg("Relance de l'analyse...");
    try {
      await recomputeAnalysis(minDist, minDeniv);
      setConfig({ min_dist_m: minDist, min_deniv_m: minDeniv });
      // WS will handle the rest
    } catch (err) {
      setBusy(false);
      alert("Erreur: " + (err as Error).message);
    }
  }, []);

  const course = data.course;
  const highlightRange = highlightSection
    ? [highlightSection.start_km, highlightSection.end_km] as [number, number]
    : null;

  return (
    <>
      <header>
        <div>
          <h1>{course?.name ?? "GPX Profile"}</h1>
          {course && (
            <p>
              {course.total_km} km · {data.sections.length} sections · survolez pour la pente
            </p>
          )}
        </div>
        <div className="toolbar">
          <input type="file" ref={fileRef} accept=".gpx" />
          <button
            onClick={handleUpload}
            disabled={busy}
            style={{
              background: "#3a86ff",
              color: "#fff",
              border: 0,
              padding: "8px 14px",
              borderRadius: 6,
              cursor: busy ? "default" : "pointer",
              fontSize: 13,
              opacity: busy ? 0.5 : 1,
            }}
          >
            Analyser ce GPX
          </button>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              background: "#444",
              color: "#fff",
              border: 0,
              padding: "8px 14px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ⚙ Réglages
          </button>
        </div>
      </header>

      <div className="container">
        <div className="legend">
          <strong>Pente :</strong>
          {SLOPE_LEGEND.map((item) => (
            <span key={item.label}>
              <i className="sw" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>

        {course ? (
          <>
            <ProfileChart
              course={course}
              highlightRange={highlightRange ?? undefined}
            />
            <div className="hint">
              Molette = zoom vertical · Shift+molette = zoom horizontal ·
              Double-clic = reset · Cliquez une section dans le tableau pour la voir en détail.
            </div>
            <SectionsTable
              sections={data.sections}
              onHoverSection={setHighlightSection}
            />
          </>
        ) : (
          <div className="empty-state">
            Aucune course chargée.<br />
            Uploadez un fichier GPX pour générer le profil.
          </div>
        )}
      </div>

      <Spinner visible={busy} message={progressMsg} />

      {showSettings && (
        <SettingsModal
          config={config}
          onClose={() => setShowSettings(false)}
          onRecompute={handleRecompute}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Verify compiles**

```bash
cd C:\Users\PaulCORBINEAU\Documents\gpx-web\web
C:\Users\PaulCORBINEAU\.bun\bin\bun run tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/
git commit -m "feat: integrate ProfilePage with all components"
```

---

### Task 12: Build SectionPage (per-section detail)

**Files:**
- Modify: `web/src/pages/SectionPage.tsx`
- Create: `web/src/pages/SectionPage.css`

- [ ] **Step 1: Create `web/src/pages/SectionPage.css`**

```css
.section-infos {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin: 14px 0;
}

.section-card {
  background: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,.1);
  font-size: 14px;
}

.section-card b {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  opacity: .6;
  margin-bottom: 4px;
}
```

- [ ] **Step 2: Rewrite `web/src/pages/SectionPage.tsx`**

```typescript
import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { AnalysisResult } from "../lib/types";
import { fetchData } from "../lib/api";
import { slopeColor, SLOPE_LEGEND } from "../lib/colors";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import "./SectionPage.css";

export default function SectionPage() {
  const { n } = useParams();
  const sectionNum = Number(n);
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [chartEl, setChartEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchData().then(setData).catch(console.error);
  }, []);

  useEffect(() => {
    if (!data?.course || !chartEl) return;

    const s = data.sections.find((sec) => sec.n === sectionNum);
    if (!s) {
      chartEl.innerHTML = "Section introuvable";
      return;
    }

    const a = s.idx_start;
    const b = s.idx_end;
    const km = data.course.km.slice(a, b + 1);
    const ele = data.course.ele.slice(a, b + 1);
    const slope = data.course.slope.slice(a, b + 1);

    const eMin = Math.min(...ele);
    const eMax = Math.max(...ele);
    const pad = Math.max(5, (eMax - eMin) * 0.06);

    const rawData: (number | null)[][] = [];
    const series: uPlot.Series[] = [];

    // Series 0: grey fill
    rawData.push(km.slice());
    series.push({
      label: "elevation",
      fill: "rgba(230,230,230,0.6)",
      stroke: "rgba(230,230,230,0)",
      width: 0,
    });

    // Colored runs
    let i = 1;
    while (i < km.length) {
      const c = slopeColor(slope[i]);
      let j = i;
      while (j < km.length && slopeColor(slope[j]) === c) j++;
      const xs: (number | null)[] = new Array(km.length).fill(null);
      const ys: (number | null)[] = new Array(ele.length).fill(null);
      for (let k = i - 1; k <= j && k < km.length; k++) {
        xs[k] = km[k];
        ys[k] = ele[k];
      }
      rawData.push(xs);
      series.push({
        label: c,
        fill: c + "99",
        stroke: c,
        width: 4,
        points: { show: false },
      });
      i = j;
    }

    const chart = new uPlot(
      {
        width: chartEl.clientWidth,
        height: 560,
        cursor: { drag: { x: true, y: true }, points: { show: false } },
        legend: { show: false },
        axes: [
          { stroke: "#666", grid: { stroke: "rgba(0,0,0,0.06)" }, label: "Distance (km)" },
          { stroke: "#666", grid: { stroke: "rgba(0,0,0,0.06)" }, label: "Altitude (m)" },
        ],
        series: [{}, ...series.map((s) => ({ ...s }))],
      },
      rawData,
      chartEl
    );

    return () => chart.destroy();
  }, [data, sectionNum, chartEl]);

  const section = data?.sections.find((s) => s.n === sectionNum);

  return (
    <div>
      <header style={{
        background: "#1a1a2e",
        color: "#fff",
        padding: "16px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>
          Section {sectionNum} — {section ? (section.dir === "up" ? "Montée" : "Descente") : ""}
        </h1>
        <Link to="/" style={{ color: "#8fd", textDecoration: "none", fontSize: 14 }}>
          ← Retour au profil complet
        </Link>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        {section && (
          <div className="section-infos">
            <div className="section-card">
              <b>Type</b>
              <span style={{ color: section.dir === "up" ? "#2ca25f" : "#d73027", fontWeight: 600 }}>
                {section.dir === "up" ? "Montée" : "Descente"}
              </span>
            </div>
            <div className="section-card">
              <b>Début course</b>
              {section.start_km.toFixed(1)} km
            </div>
            <div className="section-card">
              <b>Distance</b>
              {section.dist_km.toFixed(2)} km
            </div>
            <div className="section-card">
              <b>Dénivelé</b>
              {section.deniv > 0 ? "+" : ""}{section.deniv.toFixed(0)} m
            </div>
            <div className="section-card">
              <b>Pente moyenne</b>
              {section.avg.toFixed(1)} %
            </div>
          </div>
        )}

        <div className="legend" style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          margin: "10px 0",
          fontSize: 13,
        }}>
          {SLOPE_LEGEND.map((item) => (
            <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <i className="sw" style={{ background: item.color, width: 16, height: 16, borderRadius: 3, display: "inline-block" }} />
              {item.label}
            </span>
          ))}
        </div>

        <div
          ref={setChartEl}
          style={{
            width: "100%",
            height: 560,
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,.1)",
          }}
        >
          {!data && <div style={{ textAlign: "center", padding: 60, color: "#888" }}>Chargement...</div>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify compiles**

```bash
cd C:\Users\PaulCORBINEAU\Documents\gpx-web\web
C:\Users\PaulCORBINEAU\.bun\bin\bun run tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/SectionPage.tsx web/src/pages/SectionPage.css
git commit -m "feat: build SectionPage with per-section uPlot chart"
```

---

### Task 13: Integration test — server + frontend end-to-end

**Files:**
- None (testing only)

- [ ] **Step 1: Start backend**

```bash
cd C:\Users\PaulCORBINEAU\Documents\gpx-web
C:\Users\PaulCORBINEAU\.bun\bin\bun run server/index.ts &
```

Expected: `Server running at http://localhost:8765`

- [ ] **Step 2: Start frontend dev server in a second terminal**

```bash
cd C:\Users\PaulCORBINEAU\Documents\gpx-web\web
C:\Users\PaulCORBINEAU\.bun\bin\bun run dev &
```

Expected: Vite dev server starts on port 5173, proxying `/api` to 8765.

- [ ] **Step 3: Upload a real GPX via the web UI**

Open http://localhost:5173 in a browser, pick a GPX file, click "Analyser ce GPX".

Expected: Spinner appears, then profile chart + sections table appear with data.

- [ ] **Step 4: Verify crosshair interaction**

Hover over the chart.

Expected: A crosshair label shows "km X.XX · alt Y m · pente Z.Z %".

- [ ] **Step 5: Test section table hover + click**

Hover a row, click "Ouvrir →".

Expected: Row hover highlights on the profile. Section page opens with its own chart.

- [ ] **Step 6: Test settings modal**

Click ⚙ Réglages, change values, click "Relancer l'analyse".

Expected: Spinner appears, then chart updates with new sections.

- [ ] **Step 7: Test data persistence**

Refresh the page (F5).

Expected: Chart and table still show (loaded from server cache).

- [ ] **Step 8: Kill background servers**

```bash
# In each terminal, Ctrl+C or:
taskkill /F /IM bun.exe 2>/dev/null
```

- [ ] **Step 9: Commit any final fixes**

If tests revealed issues, fix them and commit.

---

### Task 14: Clean up old files

**Files:**
- Delete: `index.html`
- Delete: `section.html`
- Delete: `server.py`
- Delete: `analyzer.py`
- Delete: `__pycache__/` (if tracked)
- Modify: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Delete old files**

```bash
cd C:\Users\PaulCORBINEAU\Documents\gpx-web
git rm index.html section.html server.py analyzer.py
Remove-Item -Recurse -Force __pycache__ -ErrorAction SilentlyContinue
```

- [ ] **Step 2: Update `.gitignore`**

Replace with:

```
uploads/
node_modules/
dist/
```

- [ ] **Step 3: Update `README.md`**

Replace with new instructions:

```markdown
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
```

- [ ] **Step 4: Remove old `__pycache__` from gitignore patterns**

```bash
cd C:\Users\PaulCORBINEAU\Documents\gpx-web
git add .gitignore README.md
git rm --cached -r __pycache__ 2>/dev/null
git commit -m "chore: cleanup old Python files and update README"
```

---

### Task 15: Update root package.json with workspace scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update `package.json` with concurrent dev script**

```json
{
  "name": "gpx-web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "bun run --hot server/index.ts & cd web && bun run dev",
    "dev:server": "bun run --hot server/index.ts",
    "dev:web": "cd web && bun run dev",
    "build": "cd web && bun run build",
    "test": "cd web && bun test && cd .. && bun test server/",
    "lint": "cd web && bun run tsc --noEmit && cd .. && bun run tsc --noEmit"
  },
  "dependencies": {
    "elysia": "^1.2",
    "@elysiajs/websocket": "^1.2",
    "typescript": "^5.7",
    "@types/bun": "^1.2"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: update workspace scripts"
```
