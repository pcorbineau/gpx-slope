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
  pente_min: number;
  pente_max: number;
  idx_start: number;
  idx_end: number;
}

export interface AnalysisResult {
  course: CourseData | null;
  sections: SectionData[];
}

export interface ServerStatus {
  busy: boolean;
  progress: string;
  error: string | null;
}

export interface ConfigData {
  min_dist_m: number;
  min_deniv_m: number;
}

export type ProgressMsg =
  | { type: "progress"; stage: string }
  | { type: "done" }
  | { type: "error"; message: string };
