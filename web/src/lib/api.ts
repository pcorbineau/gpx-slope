import type { AnalysisResult, ConfigData } from "./types";

const BASE = "";

export async function fetchData(): Promise<AnalysisResult> {
  const res = await fetch(`${BASE}/api/data`);
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
