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

// -- Anchor type for new detection algo ------------------------------------
interface Anchor {
  type: "peak" | "valley";
  index: number;
  km: number;
  ele: number;
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

  const filtered = segs.filter((seg) => {
    const dist = seg.steps.reduce((sum, st) => sum + st.d, 0);
    const dh = seg.steps.reduce((sum, st) => sum + st.dh, 0);
    return dist > minDistM && Math.abs(dh) > minDenivM;
  });

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

    let pente_min = Infinity;
    let pente_max = -Infinity;
    for (let k = idxs[0]; k <= idxs[idxs.length - 1]; k++) {
      const v = slopes[k];
      if (v < pente_min) pente_min = v;
      if (v > pente_max) pente_max = v;
    }

    return {
      n: n + 1,
      dir: seg.dir as "up" | "down",
      start_km: Math.round((xs[idxs[0]] / 1000) * 1000) / 1000,
      end_km: Math.round((xs[idxs[idxs.length - 1]] / 1000) * 1000) / 1000,
      dist_km: Math.round((distSeg / 1000) * 1000) / 1000,
      deniv: Math.round(deniv * 10) / 10,
      avg: Math.round(avg * 10) / 10,
      pente_min: Math.round(pente_min * 10) / 10,
      pente_max: Math.round(pente_max * 10) / 10,
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
