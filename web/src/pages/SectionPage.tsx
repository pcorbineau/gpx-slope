import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { AnalysisResult } from "../lib/types";
import { fetchData } from "../lib/api";
import { slopeColor, SLOPE_LEGEND } from "../lib/colors";
import uPlot, { type AlignedData } from "uplot";
import "uplot/dist/uPlot.min.css";
import "./SectionPage.css";

export default function SectionPage() {
  const { n } = useParams();
  const sectionNum = Number(n);
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [chartEl, setChartEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchData().then(setData).catch(console.error);
  }, []);

  useEffect(() => {
    if (!data?.course || !chartEl) return;

    const s = data.sections.find((sec) => sec.n === sectionNum);
    if (!s) {
      chartEl.innerHTML = "Section introuvable";
      return;
    }

    const a = s.idx_start;
    const b = s.idx_end;
    const km = data.course.km.slice(a, b + 1);
    const ele = data.course.ele.slice(a, b + 1);
    const slope = data.course.slope.slice(a, b + 1);

    const eMin = Math.min(...ele);
    const eMax = Math.max(...ele);
    const pad = Math.max(5, (eMax - eMin) * 0.06);

    const rawData: (number | null)[][] = [];
    const series: uPlot.Series[] = [];

    rawData.push(km.slice());
    series.push({
      label: "elevation",
      fill: "rgba(230,230,230,0.6)",
      stroke: "rgba(230,230,230,0)",
      width: 0,
    });

    let i = 1;
    while (i < km.length) {
      const c = slopeColor(slope[i]);
      let j = i;
      while (j < km.length && slopeColor(slope[j]) === c) j++;
      const xs: (number | null)[] = new Array(km.length).fill(null);
      const ys: (number | null)[] = new Array(ele.length).fill(null);
      for (let k = i - 1; k <= j && k < km.length; k++) {
        xs[k] = km[k];
        ys[k] = ele[k];
      }
      rawData.push(xs);
      series.push({
        label: c,
        fill: c + "99",
        stroke: c,
        width: 4,
        points: { show: false } as uPlot.Series.Points,
      });
      i = j;
    }

    const chart = new uPlot(
      {
        width: chartEl.clientWidth,
        height: 560,
        cursor: { drag: { x: true, y: true }, points: { show: false } },
        legend: { show: false },
        axes: [
          { stroke: "#666", grid: { stroke: "rgba(0,0,0,0.06)" }, label: "Distance (km)" },
          { stroke: "#666", grid: { stroke: "rgba(0,0,0,0.06)" }, label: "Altitude (m)" },
        ],
        series: [{}, ...series.map((s) => ({ ...s }))],
      },
      rawData as AlignedData,
      chartEl
    );

    return () => chart.destroy();
  }, [data, sectionNum, chartEl]);

  const section = data?.sections.find((s) => s.n === sectionNum);

  return (
    <div>
      <header style={{
        background: "#1a1a2e",
        color: "#fff",
        padding: "16px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>
          Section {sectionNum} — {section ? (section.dir === "up" ? "Montée" : "Descente") : ""}
        </h1>
        <Link to="/" style={{ color: "#8fd", textDecoration: "none", fontSize: 14 }}>
          ← Retour au profil complet
        </Link>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        {section && (
          <div className="section-infos">
            <div className="section-card">
              <b>Type</b>
              <span style={{ color: section.dir === "up" ? "#2ca25f" : "#d73027", fontWeight: 600 }}>
                {section.dir === "up" ? "Montée" : "Descente"}
              </span>
            </div>
            <div className="section-card">
              <b>Début course</b>
              {section.start_km.toFixed(1)} km
            </div>
            <div className="section-card">
              <b>Distance</b>
              {section.dist_km.toFixed(2)} km
            </div>
            <div className="section-card">
              <b>Dénivelé</b>
              {section.deniv > 0 ? "+" : ""}{section.deniv.toFixed(0)} m
            </div>
            <div className="section-card">
              <b>Pente moyenne</b>
              {section.avg.toFixed(1)} %
            </div>
          </div>
        )}

        <div className="legend" style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          margin: "10px 0",
          fontSize: 13,
        }}>
          {SLOPE_LEGEND.map((item) => (
            <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <i className="sw" style={{ background: item.color, width: 16, height: 16, borderRadius: 3, display: "inline-block" }} />
              {item.label}
            </span>
          ))}
        </div>

        <div
          ref={setChartEl}
          style={{
            width: "100%",
            height: 560,
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,.1)",
          }}
        >
          {!data && <div style={{ textAlign: "center", padding: 60, color: "#888" }}>Chargement...</div>}
        </div>
      </div>
    </div>
  );
}
