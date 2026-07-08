import { Elysia, t } from "elysia";
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
import { unlinkSync, writeFileSync } from "fs";

const CONFIG_DEFAULTS = { min_dist_m: 1200, min_deniv_m: 100 };
let config = { ...CONFIG_DEFAULTS };
let analysisPromise: Promise<void> | null = null;

ensureCacheDir();

const loadedConfig = readJson<typeof config>(getConfigPath());
if (loadedConfig) config = { ...config, ...loadedConfig };

function persistConfig() {
  writeJson(getConfigPath(), config);
}

const app = new Elysia()
  .ws("/ws", {
    open(ws) {
      addClient(ws);
    },
    close(ws) {
      removeClient(ws);
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
  .post(
    "/api/upload",
    async ({ request }) => {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file)
        return new Response(JSON.stringify({ error: "no file" }), {
          status: 400,
        });

      const params = new URL(request.url).searchParams;
      const minDist = parseInt(
        params.get("min_dist") ?? String(config.min_dist_m),
        10
      );
      const minDeniv = parseInt(
        params.get("min_deniv") ?? String(config.min_deniv_m),
        10
      );

      const tmpPath = join(getCacheDir(), `upload_${randomUUID()}.gpx`);
      const buf = await file.arrayBuffer();
      writeFileSync(tmpPath, new Uint8Array(buf));

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
    }
  )
  .post(
    "/api/recompute",
    async ({ request }) => {
      const params = new URL(request.url).searchParams;
      const minDist = parseInt(
        params.get("min_dist") ?? String(config.min_dist_m),
        10
      );
      const minDeniv = parseInt(
        params.get("min_deniv") ?? String(config.min_deniv_m),
        10
      );

      config.min_dist_m = minDist;
      config.min_deniv_m = minDeniv;
      persistConfig();

      const lastGpx = getLastGpxPath();
      if (!exists(lastGpx)) {
        return new Response(
          JSON.stringify({ error: "aucun GPX en cache" }),
          { status: 400 }
        );
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
    }
  )
  .listen(8765);

console.log(`Server running at http://localhost:8765`);
