import { describe, it, expect } from "bun:test";
import { analyzeGpx, mergeFlatSections, detectMacroSections, SectionData } from "./analyze";
import { join } from "path";

const FIXTURE = join(import.meta.dir, "__fixtures__", "simple.gpx");

describe("detectMacroSections", () => {
  it("detects up section for climbing profile", () => {
    const xs = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900];
    const ele = [100, 150, 200, 250, 300, 350, 350, 350, 350, 300];
    const slopes = ele.map(() => 0);
    const sections = detectMacroSections(xs, ele, slopes, 30, 3);
    const up = sections.filter((s) => s.dir === "up");
    expect(up.length).toBeGreaterThanOrEqual(1);
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
