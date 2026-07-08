import type { SectionData } from "../lib/types";

interface Props {
  sections: SectionData[];
  onHoverSection: (s: SectionData | null) => void;
  onClickSection: (n: number) => void;
}

export default function SectionsTable({ sections, onHoverSection, onClickSection }: Props) {
  if (sections.length === 0) return null;

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
          <th style={thStyle}>#</th>
          <th style={thStyle}>Type</th>
          <th style={thStyle}>Début course</th>
          <th style={thStyle}>Dist.</th>
          <th style={thStyle}>Déniv.</th>
          <th style={thStyle}>Pente moy.</th>
        </tr>
      </thead>
      <tbody>
        {sections.map((s) => (
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
              <span style={{ color: s.dir === "up" ? "#2ca25f" : "#d73027", fontWeight: 600 }}>
                {s.dir === "up" ? "Montée" : "Descente"}
              </span>
            </td>
            <td style={tdStyle}>{s.start_km.toFixed(1)} km</td>
            <td style={tdStyle}>{s.dist_km.toFixed(2)} km</td>
            <td style={tdStyle}>
              {s.deniv > 0 ? "+" : ""}{s.deniv.toFixed(0)} m
            </td>
            <td style={tdStyle}>{s.avg.toFixed(1)} %</td>
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
