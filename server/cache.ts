import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

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
  mkdirSync(UPLOADS, { recursive: true });
}

export function readJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data), "utf-8");
}

export function readLastGpx(): Uint8Array | null {
  try {
    if (!existsSync(LAST_GPX_PATH)) return null;
    return readFileSync(LAST_GPX_PATH);
  } catch {
    return null;
  }
}

export function writeLastGpx(data: Uint8Array): void {
  writeFileSync(LAST_GPX_PATH, data);
}

export function exists(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}
