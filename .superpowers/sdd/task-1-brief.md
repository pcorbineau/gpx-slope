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

