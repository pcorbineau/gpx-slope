import { useState } from "react";
import type { SectionData } from "../lib/types";

interface Props {
  sections: SectionData[];
  onHoverSection: (s: SectionData | null) => void;
  onClickSection: (n: number) => void;
}

type SortKey = keyof SectionData;
type SortDir = "asc" | "desc";

function dirLabel(dir: SectionData["dir"]): string {
  return dir === "up" ? "Montée" : dir === "down" ? "Descente" : "Plat";
}

function getSortValue(s: SectionData, key: SortKey): number | string {
  switch (key) {
    case "n": return s.n;
    case "dir": return dirLabel(s.dir);
    case "start_km": return s.start_km;
    case "dist_km": return s.dist_km;
    case "deniv": return s.deniv;
    case "avg": return Math.abs(s.avg);
    case "pente_min": return Math.abs(s.pente_min);
    case "pente_max": return Math.abs(s.pente_max);
    default: return (s as any)[key] ?? 0;
  }
}

const columns: { key: SortKey; label: string }[] = [
  { key: "n", label: "#" },
  { key: "dir", label: "Type" },
  { key: "start_km", label: "Début course" },
  { key: "dist_km", label: "Dist." },
  { key: "deniv", label: "Déniv." },
  { key: "avg", label: "Pente moy." },
  { key: "pente_min", label: "Pente min" },
  { key: "pente_max", label: "Pente max" },
];

export default function SectionsTable({ sections, onHoverSection, onClickSection }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("n");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  if (sections.length === 0) return null;

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...sections].sort((a, b) => {
    const va = getSortValue(a, sortKey);
    const vb = getSortValue(b, sortKey);
    if (typeof va === "string" && typeof vb === "string") {
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  return (
    <table style={{
      width: "100%",
      borderCollapse: "collapse",
      marginTop: 16,
      background: "#fff",
      borderRadius: 8,
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,.1)",
      fontSize: 13,
    }}>
      <thead>
        <tr style={{ background: "#1a1a2e", color: "#fff" }}>
          {columns.map((col) => (
            <th
              key={col.key}
              onClick={() => handleSort(col.key)}
              style={{
                ...thStyle,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              {col.label}
              {sortKey === col.key && (
                <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "▲" : "▼"}</span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((s) => (
          <tr
            key={s.n}
            onClick={() => onClickSection(s.n)}
            onMouseEnter={() => onHoverSection(s)}
            onMouseLeave={() => onHoverSection(null)}
            style={{ cursor: "pointer" }}
            className="section-row"
          >
            <td style={tdStyle}>{s.n}</td>
            <td style={tdStyle}>
              <span style={{
                color: s.dir === "up" ? "#2ca25f" : s.dir === "down" ? "#d73027" : "#888",
                fontWeight: 600,
              }}>
                {dirLabel(s.dir)}
              </span>
            </td>
            <td style={tdStyle}>{s.start_km.toFixed(1)} km</td>
            <td style={tdStyle}>{s.dist_km.toFixed(2)} km</td>
            <td style={tdStyle}>
              {s.deniv > 0 ? "+" : ""}{s.deniv.toFixed(0)} m
            </td>
            <td style={tdStyle}>{s.avg.toFixed(1)} %</td>
            <td style={tdStyle}>{s.pente_min.toFixed(1)} %</td>
            <td style={tdStyle}>{s.pente_max.toFixed(1)} %</td>
          </tr>
        ))}
      </tbody>
      <style>{`tr.section-row:hover td { background: #e8edf8; }`}</style>
    </table>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontSize: 13,
  borderBottom: "1px solid #eee",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #eee",
};
