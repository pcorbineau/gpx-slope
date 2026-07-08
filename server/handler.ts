import { analyzeGpx, type AnalysisResult } from "./analyze";
import { broadcast } from "./ws";
import { writeJson, getDataPath, writeLastGpx, getLastGpxPath } from "./cache";

export async function runAnalysis(
  gpxPath: string,
  minDist: number,
  minDeniv: number
): Promise<AnalysisResult> {
  broadcast({ type: "progress", stage: "parsing" });
  await new Promise((r) => setTimeout(r, 0));

  const result = analyzeGpx(gpxPath, minDist, minDeniv);

  broadcast({ type: "progress", stage: "caching" });
  writeJson(getDataPath(), result);

  if (gpxPath !== getLastGpxPath()) {
    const content = Bun.file(gpxPath);
    writeLastGpx(new Uint8Array(await content.arrayBuffer()));
  }

  return result;
}
