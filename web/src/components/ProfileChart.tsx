import { useRef, useEffect } from "react";
import uPlot, { type AlignedData } from "uplot";
import "uplot/dist/uPlot.min.css";
import type { CourseData } from "../lib/types";
import { slopeColor } from "../lib/colors";
import "./ProfileChart.css";

interface Props {
  course: CourseData;
  highlightRange?: [number, number] | null;
  highlightColor?: string;
}

export default function ProfileChart({
  course,
  highlightRange,
  highlightColor = "rgba(44,162,95,0.18)",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const highlightRef = useRef<{ range: [number, number]; color: string } | null>(null);

  highlightRef.current = highlightRange
    ? { range: highlightRange, color: highlightColor }
    : null;

  useEffect(() => {
    if (!containerRef.current) return;

    const { km, ele, slope } = course;
    if (km.length < 2) return;

    const rawData: (number | null)[][] = [];
    const series: uPlot.Series[] = [];

    rawData.push(km.slice());
    rawData.push(ele.slice());
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

      const ys: (number | null)[] = new Array(ele.length).fill(null);
      for (let k = i - 1; k <= j && k < km.length; k++) {
        ys[k] = ele[k];
      }

      rawData.push(ys);
      series.push({
        label: c,
        fill: c + "99",
        stroke: c,
        width: 3,
      });

      i = j;
    }

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: 620,
      cursor: {
        show: true,
        drag: { x: true, y: true },
        points: { show: false },
      },
      select: { show: false } as uPlot.Select,
      legend: { show: false },
      axes: [
        { stroke: "#666", grid: { stroke: "rgba(0,0,0,0.06)" }, label: "Distance (km)", values: (_, ticks) => ticks.map(v => Number(v.toFixed(1)) + "") },
        { stroke: "#666", grid: { stroke: "rgba(0,0,0,0.06)" }, label: "Altitude (m)" },
      ],
      series: [
        {},
        ...series.map((s) => ({
          ...s,
          points: { show: false } as uPlot.Series.Points,
        })),
      ],
      hooks: {
        ready: [(u) => {
          chartRef.current = u;
        }],
        draw: [
          (u) => {
            const h = highlightRef.current;
            if (!h) return;
            const p0 = u.valToPos(h.range[0], "x");
            const p1 = u.valToPos(h.range[1], "x");
            const left = Math.min(p0, p1);
            const width = Math.abs(p1 - p0);
            const { ctx } = u;
            ctx.fillStyle = h.color;
            ctx.fillRect(left, u.bbox.top, width, u.bbox.height);
          },
        ],
        setCursor: [
          (u) => {
            const label = containerRef.current?.querySelector(".crosshair-label") as HTMLElement | null;
            if (!label || u.cursor.idx == null) return;
            const idx: number = u.cursor.idx;
            const kmVal = km[idx];
            const eleVal = ele[idx];
            const slopeVal = slope[idx];
            label.textContent =
              `km ${kmVal.toFixed(2)} · alt ${eleVal.toFixed(0)} m · pente ${slopeVal.toFixed(1)} %`;
          },
        ],
      },
    };

    const chart = new uPlot(opts, rawData as AlignedData, containerRef.current);

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [course]);

  return (
    <div className="chart-wrapper" ref={containerRef}>
      <div className="crosshair-label">Survolez le graphique</div>
    </div>
  );
}
