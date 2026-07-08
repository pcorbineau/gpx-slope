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
  const n = slopes.length;

  // Step 1: classify each point by local slope with hysteresis
  //   - When flat: go up if slope > 2%, down if slope < -2%
  //   - When up: stay up until slope < 0.5% (absorbs micro dips in climbs)
  //   - When down: stay down until slope > -0.5% (absorbs micro rises in descents)
  const HYST_ENTER = 2.0;
  const HYST_EXIT = 0.5;

  const rawDir: ("up" | "down" | "flat")[] = new Array(n);
  rawDir[0] = slopes[0] > HYST_ENTER ? "up" : slopes[0] < -HYST_ENTER ? "down" : "flat";

  for (let i = 1; i < n; i++) {
    const prev = rawDir[i - 1];
    const s = slopes[i];

    if (prev === "up") {
      rawDir[i] = s < HYST_EXIT ? "flat" : "up";
    } else if (prev === "down") {
      rawDir[i] = s > -HYST_EXIT ? "flat" : "down";
    } else {
      rawDir[i] = s > HYST_ENTER ? "up" : s < -HYST_ENTER ? "down" : "flat";
    }
  }

  const MIN_ABSORB_M = 300;

  // Step 2: group consecutive same-direction into runs
  interface Run { dir: "up" | "down" | "flat"; i0: number; i1: number; }
  const runs: Run[] = [];
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (rawDir[i] !== rawDir[start]) {
      runs.push({ dir: rawDir[start], i0: start, i1: i - 1 });
      start = i;
    }
  }
  runs.push({ dir: rawDir[start], i0: start, i1: n - 1 });

  // Step 3: merge same-type adjacent runs
  const merged: Run[] = [];
  for (const run of runs) {
    if (merged.length > 0 && merged[merged.length - 1].dir === run.dir) {
      merged[merged.length - 1].i1 = run.i1;
    } else {
      merged.push({ ...run });
    }
  }

  // Step 4: absorb short runs into dominant trend
  //   - short flat runs (< 300m) → absorb into any neighbor
  //   - short reversals (e.g. down inside up context) → absorb into dominant neighbor
  let changed = true;
  while (changed) {
    changed = false;

    // Merge same-type adjacent runs (absorption may have made them adjacent)
    for (let i = 1; i < merged.length; i++) {
      if (merged[i - 1].dir === merged[i].dir) {
        merged[i - 1].i1 = merged[i].i1;
        merged.splice(i, 1);
        i--;
        changed = true;
      }
    }

    for (let i = 0; i < merged.length; i++) {
      const run = merged[i];
      if (merged.length <= 1) break;
      const dist = xs[run.i1] - xs[run.i0];

      const prev = i > 0 ? merged[i - 1] : null;
      const next = i < merged.length - 1 ? merged[i + 1] : null;

      // Flat runs: absorb if short
      if (run.dir === "flat") {
        if (dist >= MIN_ABSORB_M) continue;
        const target = prev ?? next;
        if (!target) continue;
        target.i0 = Math.min(target.i0, run.i0);
        target.i1 = Math.max(target.i1, run.i1);
        merged.splice(i, 1);
        i--;
        changed = true;
        continue;
      }

      // Direction runs (up/down): absorb if flanked by the opposite non-flat type
      // e.g. micro-downhill inside a climb (up-down-up) → absorb into dominant up
      // Only absorb if the run is short (< 2km) to avoid merging genuine long descents
      if (prev && next && prev.dir === next.dir && prev.dir !== "flat" && prev.dir !== run.dir && dist < 2000) {
        const prevDist = xs[prev.i1] - xs[prev.i0];
        const nextDist = xs[next.i1] - xs[next.i0];
        const target = prevDist >= nextDist ? prev : next;
        target.i0 = Math.min(target.i0, run.i0);
        target.i1 = Math.max(target.i1, run.i1);
        merged.splice(i, 1);
        i--;
        changed = true;
      }
    }
  }

  // Step 5: rebuild after absorption (merge same-type consecutive)
  const final: Run[] = [];
  for (const run of merged) {
    if (final.length > 0 && final[final.length - 1].dir === run.dir) {
      final[final.length - 1].i1 = run.i1;
    } else {
      final.push({ ...run });
    }
  }

  // Step 5b: split runs at significant local direction reversals
  //   - within a down run: find local minima where the following climb >= minDeniv
  //   - within an up run: find local maxima where the following drop >= minDeniv
  //   - this preserves real climbs within a big descent (and vice versa)
  const trimmed: Run[] = [];
  for (const run of final) {
    if (run.dir === "down") {
      let segStart = run.i0;
      for (let k = run.i0 + 1; k < run.i1; k++) {
        if (ele[k] < ele[k - 1] && ele[k] <= ele[k + 1]) {
          // Local minimum at k — find the following peak
          let peakK = k + 1;
          while (peakK < run.i1 && ele[peakK] >= ele[peakK - 1]) peakK++;
          peakK--;
          const rise = ele[peakK] - ele[k];
          if (rise >= minDeniv) {
            const drop = ele[k] - ele[segStart];
            trimmed.push({ dir: drop <= 0 ? "down" : "flat", i0: segStart, i1: k });
            segStart = k;
          }
        }
      }
      if (segStart < run.i1) {
        const drop = ele[run.i1] - ele[segStart];
        trimmed.push({ dir: drop <= 0 ? "down" : "flat", i0: segStart, i1: run.i1 });
      }
    } else if (run.dir === "up") {
      let segStart = run.i0;
      for (let k = run.i0 + 1; k < run.i1; k++) {
        if (ele[k] > ele[k - 1] && ele[k] >= ele[k + 1]) {
          let valleyK = k + 1;
          while (valleyK < run.i1 && ele[valleyK] <= ele[valleyK - 1]) valleyK++;
          valleyK--;
          const drop = ele[k] - ele[valleyK];
          if (drop >= minDeniv) {
            const rise = ele[k] - ele[segStart];
            trimmed.push({ dir: rise >= 0 ? "up" : "flat", i0: segStart, i1: k });
            segStart = k;
          }
        }
      }
      if (segStart < run.i1) {
        const rise = ele[run.i1] - ele[segStart];
        trimmed.push({ dir: rise >= 0 ? "up" : "flat", i0: segStart, i1: run.i1 });
      }
    } else {
      trimmed.push({ ...run });
    }
  }

  // Step 5c: rebuild after trimming (merge same-type consecutive)
  const rebuilt: Run[] = [];
  for (const run of trimmed) {
    if (rebuilt.length > 0 && rebuilt[rebuilt.length - 1].dir === run.dir) {
      rebuilt[rebuilt.length - 1].i1 = run.i1;
    } else {
      rebuilt.push({ ...run });
    }
  }

  // Step 6: build SectionData
  const sections: SectionData[] = [];
  for (const { dir, i0, i1 } of rebuilt) {
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
    const steepSection = pente_max > 10 || pente_min < -10;
    if (Math.abs(avg) <= flatThreshold && !steepSection) {
      dirFinal = "flat";
    } else {
      dirFinal = deniv >= 0 ? "up" : "down";
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

  // Step 7: merge adjacent same-type sections (reclassified flat may create dupes)
  const merged_sections: SectionData[] = [];
  for (const s of sections) {
    if (merged_sections.length > 0 && merged_sections[merged_sections.length - 1].dir === s.dir) {
      const prev = merged_sections[merged_sections.length - 1];
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
    } else {
      merged_sections.push({ ...s });
    }
  }

  return merged_sections;
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
  const MAX_FLAT_MERGE_M = 1000;

  let sections = detectMacroSections(xs, eleSmoothed, slopes, MIN_PEAK_DENIV, FLAT_THRESHOLD);
  sections = mergeFlatSections(sections, MAX_FLAT_MERGE_M);

  let filtered = sections.filter((s) => {
    if (s.dir === "flat") return s.dist_km * 1000 > minDistM;
    return s.dist_km * 1000 > minDistM && Math.abs(s.deniv) > minDenivM;
  });

  // Merge adjacent same-type sections (filtering may have removed gaps between them)
  const merged: SectionData[] = [];
  for (const s of filtered) {
    if (merged.length > 0 && merged[merged.length - 1].dir === s.dir) {
      const prev = merged[merged.length - 1];
      const dist = (s.end_km - prev.start_km) * 1000;
      const deniv = s.deniv + prev.deniv;
      const avg = dist > 0 ? (deniv / dist) * 100 : 0;
      prev.end_km = s.end_km;
      prev.idx_end = s.idx_end;
      prev.dist_km = Math.round((dist / 1000) * 1000) / 1000;
      prev.deniv = Math.round(deniv * 10) / 10;
      prev.avg = Math.round(avg * 10) / 10;
      prev.pente_min = Math.min(prev.pente_min, s.pente_min);
      prev.pente_max = Math.max(prev.pente_max, s.pente_max);
    } else {
      merged.push({ ...s });
    }
  }
  filtered = merged.map((s, i) => ({ ...s, n: i + 1 }));

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
