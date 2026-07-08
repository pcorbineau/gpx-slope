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
  dir: "up" | "down";
  start_km: number;
  end_km: number;
  dist_km: number;
  deniv: number;
  avg: number;
  idx_start: number;
  idx_end: number;
}

export interface AnalysisResult {
  course: CourseData;
  sections: SectionData[];
}

export function analyzeGpx(_path: string, _minDist: number, _minDeniv: number): AnalysisResult {
  throw new Error("Not implemented yet");
}
