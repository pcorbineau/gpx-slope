import { describe, it, expect } from "bun:test";
import { analyzeGpx, findLocalExtrema, filterAnchors, buildSectionsFromAnchors, mergeFlatSections, SectionData } from "./analyze";
import { join } from "path";

const FIXTURE = join(import.meta.dir, "__fixtures__", "simple.gpx");

describe("findLocalExtrema", () => {
  it("finds peaks and valleys in a simple profile", () => {
    const ele = [100, 200, 300, 200, 100, 200, 300, 200, 100];
    const km = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const anchors = findLocalExtrema(ele, km);
    const peaks = anchors.filter((a) => a.type === "peak");
    const valleys = anchors.filter((a) => a.type === "valley");
    expect(peaks.length).toBe(2);
    expect(valleys.length).toBe(1);
    expect(peaks[0].index).toBe(2);
    expect(peaks[1].index).toBe(6);
    expect(valleys[0].index).toBe(4);
  });

  it("returns empty for flat profile", () => {
    const ele = [100, 100, 100, 100, 100];
    const km = [0, 1, 2, 3, 4];
    expect(findLocalExtrema(ele, km)).toEqual([]);
  });

  it("detects plateau-start as peak", () => {
    const ele = [100, 200, 300, 300, 300, 200, 100];
    const km = [0, 1, 2, 3, 4, 5, 6];
    const anchors = findLocalExtrema(ele, km);
    const peaks = anchors.filter((a) => a.type === "peak");
    expect(peaks.length).toBe(1);
    expect(peaks[0].index).toBe(2);
  });
});

describe("filterAnchors", () => {
  it("removes insignificant peaks below minDeniv", () => {
    const ele = [100, 200, 210, 200, 300, 200, 100];
    const km = [0, 1, 2, 3, 4, 5, 6];
    const anchors = findLocalExtrema(ele, km);
    const filtered = filterAnchors(anchors, ele, km, 30);
    const peaks = filtered.filter((a) => a.type === "peak");
    expect(peaks.length).toBe(1);
    expect(peaks[0].index).toBe(4);
  });

  it("keeps significant peaks", () => {
    const ele = [100, 200, 350, 200, 100];
    const km = [0, 1, 2, 3, 4];
    const anchors = findLocalExtrema(ele, km);
    const filtered = filterAnchors(anchors, ele, km, 30);
    expect(filtered.length).toBe(1);
    expect(filtered[0].type).toBe("peak");
  });
});

describe("buildSectionsFromAnchors", () => {
  it("builds correct sections for simple up-down profile", () => {
    interface Pt { lat: number; lon: number; ele: number }
    const pts: Pt[] = [
      { lat: 0, lon: 0, ele: 100 },
      { lat: 0, lon: 0, ele: 200 },
      { lat: 0, lon: 0, ele: 300 },
      { lat: 0, lon: 0, ele: 200 },
      { lat: 0, lon: 0, ele: 100 },
    ];
    const xs = [0, 100, 200, 300, 400];
    const ele = [100, 200, 300, 200, 100];
    const slopes = [0, 100, 100, -100, -100];
    const anchors = [
      { type: "peak" as const, index: 2, km: 200, ele: 300 },
    ];
    const sections = buildSectionsFromAnchors(pts, xs, ele, slopes, anchors, 3);
    expect(sections.length).toBe(2);
    expect(sections[0].dir).toBe("up");
    expect(sections[0].idx_start).toBe(0);
    expect(sections[0].idx_end).toBe(2);
    expect(sections[1].dir).toBe("down");
    expect(sections[1].idx_start).toBe(2);
    expect(sections[1].idx_end).toBe(4);
  });
});

describe("mergeFlatSections", () => {
  it("merges short flat section into adjacent up section", () => {
    const sections: SectionData[] = [
      { n: 1, dir: "up", start_km: 0, end_km: 1, dist_km: 1, deniv: 100, avg: 10, pente_min: 5, pente_max: 15, idx_start: 0, idx_end: 10 },
      { n: 2, dir: "flat", start_km: 1, end_km: 1.3, dist_km: 0.3, deniv: 0, avg: 0, pente_min: -1, pente_max: 1, idx_start: 10, idx_end: 13 },
      { n: 3, dir: "down", start_km: 1.3, end_km: 2.3, dist_km: 1, deniv: -100, avg: -10, pente_min: -15, pente_max: -5, idx_start: 13, idx_end: 23 },
    ];
    const result = mergeFlatSections(sections, 500);
    expect(result.length).toBe(2);
    expect(result[0].idx_end).toBe(13);
    expect(result[0].dir).toBe("up");
  });

  it("keeps long flat section", () => {
    const sections: SectionData[] = [
      { n: 1, dir: "up", start_km: 0, end_km: 1, dist_km: 1, deniv: 100, avg: 10, pente_min: 5, pente_max: 15, idx_start: 0, idx_end: 10 },
      { n: 2, dir: "flat", start_km: 1, end_km: 2, dist_km: 1, deniv: 0, avg: 0, pente_min: -1, pente_max: 1, idx_start: 10, idx_end: 20 },
      { n: 3, dir: "down", start_km: 2, end_km: 3, dist_km: 1, deniv: -100, avg: -10, pente_min: -15, pente_max: -5, idx_start: 20, idx_end: 30 },
    ];
    const result = mergeFlatSections(sections, 500);
    expect(result.length).toBe(3);
  });
});

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
