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
function cumulativeDistances(pts: RawPoint[]): number[] {
  const xs = [0];
  for (let i = 1; i < pts.length; i++) {
    xs.push(xs[i - 1] + haversine(pts[i - 1], pts[i]));
  }
  return xs;
}

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

    while (lo < n && xs[lo] < xLo) {
      sum -= ele[lo];
      count--;
      lo++;
    }
    while (hi < n && xs[hi] <= xHi) {
      sum += ele[hi];
      count++;
      hi++;
    }
    smoothed[i] = count > 0 ? sum / count : ele[i];
  }
  return smoothed;
}

function computeSlopes(xs: number[], eleSmoothed: number[], window: number): number[] {
  const n = xs.length;
  const slopes = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const xLo = xs[i] - window;
    const xHi = xs[i] + window;

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

    const nw = xw.length;
    let sumX = 0, sumY = 0, sumX2 = 0, sumXY = 0;
    for (let k = 0; k < nw; k++) {
      sumX += xw[k];
      sumY += yw[k];
      sumX2 += xw[k] * xw[k];
      sumXY += xw[k] * yw[k];
    }
    const m = (nw * sumXY - sumX * sumY) / (nw * sumX2 - sumX * sumX);
    slopes[i] = m * 100;
  }

  return slopes;
}

export function detectMacroSections(
  xs: number[],
  ele: number[],
  slopes: number[],
  minDeniv: number,
  flatThreshold: number
): SectionData[] {
  const n = ele.length;
  const raw: { i0: number; i1: number; dir: "up" | "down" | "flat" }[] = [];

  let segStart = 0;
  let dir: "up" | "down" | "flat" | null = null;
  let extremeIdx = 0;

  for (let i = 1; i < n; i++) {
    if (dir === null) {
      const cum = ele[i] - ele[segStart];
      if (Math.abs(cum) >= minDeniv) {
        dir = cum > 0 ? "up" : "down";
        extremeIdx = i;
      }
    } else if (dir === "up") {
      if (ele[i] > ele[extremeIdx]) extremeIdx = i;
      if (ele[extremeIdx] - ele[i] >= minDeniv) {
        raw.push({ i0: segStart, i1: extremeIdx, dir });
        segStart = extremeIdx;
        dir = null;
        extremeIdx = segStart;
      }
    } else if (dir === "down") {
      if (ele[i] < ele[extremeIdx]) extremeIdx = i;
      if (ele[i] - ele[extremeIdx] >= minDeniv) {
        raw.push({ i0: segStart, i1: extremeIdx, dir });
        segStart = extremeIdx;
        dir = null;
        extremeIdx = segStart;
      }
    }
  }

  if (dir !== null) {
    raw.push({ i0: segStart, i1: extremeIdx, dir });
  }

  const sections: SectionData[] = [];

  for (let r = 0; r < raw.length; r++) {
    const { i0, i1, dir: d } = raw[r];

    const dist = xs[i1] - xs[i0];
    const deniv = ele[i1] - ele[i0];
    const avg = dist > 0 ? (deniv / dist) * 100 : 0;

    let pente_min = Infinity;
    let pente_max = -Infinity;
    for (let k = i0; k <= i1; k++) {
      if (slopes[k] < pente_min) pente_min = slopes[k];
      if (slopes[k] > pente_max) pente_max = slopes[k];
    }

    let dirFinal: "up" | "down" | "flat";
    const steepUp = pente_max > 10;
    const steepDown = pente_min < -10;
    if (Math.abs(avg) <= flatThreshold && !steepUp && !steepDown) {
      dirFinal = "flat";
    } else {
      dirFinal = d;
    }

    sections.push({
      n: 0,
      dir: dirFinal,
      start_km: Math.round((xs[i0] / 1000) * 1000) / 1000,
      end_km: Math.round((xs[i1] / 1000) * 1000) / 1000,
      dist_km: Math.round((dist / 1000) * 1000) / 1000,
      deniv: Math.round(deniv * 10) / 10,
      avg: Math.round(avg * 10) / 10,
      pente_min: Math.round(pente_min * 10) / 10,
      pente_max: Math.round(pente_max * 10) / 10,
      idx_start: i0,
      idx_end: i1,
    });
  }

  return sections;
}

export function mergeFlatSections(sections: SectionData[], maxFlatDistM: number): SectionData[] {
  const result: SectionData[] = [];

  for (const s of sections) {
    if (result.length === 0) {
      result.push({ ...s });
      continue;
    }

    const prev = result[result.length - 1];

    if (s.dir === "flat" && s.dist_km * 1000 <= maxFlatDistM) {
      const dist = (s.end_km - prev.start_km) * 1000;
      const deniv = s.deniv + prev.deniv;
      const avg = dist > 0 ? (deniv / dist) * 100 : 0;
      prev.idx_end = s.idx_end;
      prev.end_km = s.end_km;
      prev.dist_km = Math.round((dist / 1000) * 1000) / 1000;
      prev.deniv = Math.round(deniv * 10) / 10;
      prev.avg = Math.round(avg * 10) / 10;
      prev.pente_min = Math.min(prev.pente_min, s.pente_min);
      prev.pente_max = Math.max(prev.pente_max, s.pente_max);
    } else if (prev.dir === "flat" && prev.dist_km * 1000 <= maxFlatDistM && s.dir !== "flat") {
      const dist = (s.end_km - prev.start_km) * 1000;
      const deniv = s.deniv + prev.deniv;
      const avg = dist > 0 ? (deniv / dist) * 100 : 0;
      result[result.length - 1] = {
        n: 0,
        dir: s.dir,
        start_km: prev.start_km,
        end_km: s.end_km,
        dist_km: Math.round((dist / 1000) * 1000) / 1000,
        deniv: Math.round(deniv * 10) / 10,
        avg: Math.round(avg * 10) / 10,
        pente_min: Math.min(prev.pente_min, s.pente_min),
        pente_max: Math.max(prev.pente_max, s.pente_max),
        idx_start: prev.idx_start,
        idx_end: s.idx_end,
      };
    } else {
      result.push({ ...s });
    }
  }

  return result.map((s, i) => ({ ...s, n: i + 1 }));
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
  dir: "up" | "down" | "flat";
  start_km: number;
  end_km: number;
  dist_km: number;
  deniv: number;
  avg: number;
  pente_min: number;
  pente_max: number;
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

  const MIN_PEAK_DENIV = 30;
  const FLAT_THRESHOLD = 3;
  const MAX_FLAT_MERGE_M = 500;

  let sections = detectMacroSections(xs, eleSmoothed, slopes, MIN_PEAK_DENIV, FLAT_THRESHOLD);
  sections = mergeFlatSections(sections, MAX_FLAT_MERGE_M);

  const filtered = sections.filter((s) => {
    return s.dist_km * 1000 > minDistM && Math.abs(s.deniv) > minDenivM;
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
    sections: filtered,
  };
}
