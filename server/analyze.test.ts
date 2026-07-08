import { describe, it, expect } from "bun:test";
import { analyzeGpx, mergeFlatSections, detectMacroSections, SectionData } from "./analyze";
import { join } from "path";
import { writeFileSync, unlinkSync } from "fs";

const FIXTURE = join(import.meta.dir, "__fixtures__", "simple.gpx");

describe("detectMacroSections", () => {
  it("detects up and down from slope-classified segments", () => {
    // 170 points at 10m spacing → 1700m total
    const xs: number[] = [];
    for (let i = 0; i < 170; i++) xs.push(i * 10);
    // flat 0-350m, climb 350-650m (10%), flat 650-1000m, descent 1000-1350m, flat 1350-1700m
    const ele: number[] = [];
    for (let i = 0; i < 170; i++) {
      const d = i * 10;
      if (d < 350) ele.push(100);
      else if (d < 650) ele.push(100 + (d - 350) * 0.1);
      else if (d < 1000) ele.push(130);
      else if (d < 1350) ele.push(130 - (d - 1000) * 0.1);
      else ele.push(95);
    }
    const slopes: number[] = [];
    for (let i = 0; i < 170; i++) {
      const d = i * 10;
      if (d < 350) slopes.push(0);
      else if (d < 650) slopes.push(10);
      else if (d < 1000) slopes.push(0);
      else if (d < 1350) slopes.push(-10);
      else slopes.push(0);
    }
    const sections = detectMacroSections(xs, ele, slopes, 30, 3);
    expect(sections.length).toBe(5);
    expect(sections[0].dir).toBe("flat");  // 0-350m
    expect(sections[1].dir).toBe("up");    // 350-650m
    expect(sections[2].dir).toBe("flat");  // 650-1000m
    expect(sections[3].dir).toBe("down");  // 1000-1350m
    expect(sections[4].dir).toBe("flat");  // 1350-1700m
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
    const pts: string[] = [];
    for (let i = 0; i < 200; i++) {
      const d = i * 10;
      let ele: number;
      if (d < 500) ele = 100;
      else if (d < 1200) ele = 100 + (d - 500) * 0.08;
      else if (d < 1500) ele = 156;
      else ele = 156 - (d - 1500) * 0.1;
      const lat = 44 + i * 0.0001;
      const lon = 3.3 + i * 0.0001;
      pts.push(`<trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele></trkpt>`);
    }
    const xml = `<?xml version="1.0"?><gpx><trk><name>Test</name><trkseg>${pts.join("")}</trkseg></trk></gpx>`;
    const tmpFile = join(import.meta.dir, "__fixtures__", "_test_big.gpx");
    writeFileSync(tmpFile, xml);
    const result = analyzeGpx(tmpFile, 100, 50);
    unlinkSync(tmpFile);
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
