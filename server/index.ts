import { Elysia, t } from "elysia";
import { ensureCacheDir, readJson, getDataPath, getConfigPath, writeJson } from "./cache";
import { addClient, removeClient } from "./ws";

const CONFIG_DEFAULTS = { min_dist_m: 1200, min_deniv_m: 100 };
let config = { ...CONFIG_DEFAULTS };
let analysisPromise: Promise<void> | null = null;

ensureCacheDir();

const loadedConfig = readJson<typeof config>(getConfigPath());
if (loadedConfig) config = { ...config, ...loadedConfig };

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
  .post(
    "/api/config",
    ({ body }) => {
      if (body.min_dist_m !== undefined) config.min_dist_m = body.min_dist_m;
      if (body.min_deniv_m !== undefined) config.min_deniv_m = body.min_deniv_m;
      writeJson(getConfigPath(), config);
      return config;
    },
    {
      body: t.Object({
        min_dist_m: t.Optional(t.Number()),
        min_deniv_m: t.Optional(t.Number()),
      }),
    }
  )
  .get("/api/status", () => ({ busy: analysisPromise !== null, progress: "" }))
  .listen(8765);

console.log(`Server running at http://localhost:8765`);
