export function slopeColor(v: number): string {
  const a = Math.abs(v);
  if (a < 3) return "#2ca25f";
  if (a < 10) return "#1f77b4";
  if (a < 15) return "#fee08b";
  if (a < 20) return "#fc8d59";
  if (a < 25) return "#d73027";
  return "#000000";
}

export const SLOPE_LEGEND = [
  { color: "#2ca25f", label: "< 3%" },
  { color: "#1f77b4", label: "3–10%" },
  { color: "#fee08b", label: "10–15%" },
  { color: "#fc8d59", label: "15–20%" },
  { color: "#d73027", label: "20–25%" },
  { color: "#000000", label: "≥ 25%" },
] as const;
