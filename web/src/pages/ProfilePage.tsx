import { useState, useEffect, useRef, useCallback } from "react";
import type { AnalysisResult, ConfigData, SectionData, ProgressMsg } from "../lib/types";
import { fetchData, fetchConfig, uploadGpx, recomputeAnalysis } from "../lib/api";
import { connectProgressWs } from "../lib/ws";
import { SLOPE_LEGEND } from "../lib/colors";
import ProfileChart from "../components/ProfileChart";
import SectionsTable from "../components/SectionsTable";
import SettingsModal from "../components/SettingsModal";
import Spinner from "../components/Spinner";
import "./ProfilePage.css";

export default function ProfilePage() {
  const [data, setData] = useState<AnalysisResult>({ course: null, sections: [] });
  const [config, setConfig] = useState<ConfigData>({ min_dist_m: 1200, min_deniv_m: 100 });
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState("Analyse en cours...");
  const [showSettings, setShowSettings] = useState(false);
  const [highlightSection, setHighlightSection] = useState<SectionData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData().then(setData).catch(console.error);
    fetchConfig().then(setConfig).catch(console.error);
  }, []);

  useEffect(() => {
    const ws = connectProgressWs((msg: ProgressMsg) => {
      if (msg.type === "progress") {
        setProgressMsg(
          msg.stage === "parsing" ? "Parsing GPX..."
          : msg.stage === "caching" ? "Saving results..."
          : "Analyse en cours..."
        );
      } else if (msg.type === "done") {
        setBusy(false);
        fetchData().then(setData).catch(console.error);
      } else if (msg.type === "error") {
        setBusy(false);
        alert(msg.message);
      }
    });
    return () => ws.close();
  }, []);

  const handleUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      alert("Choisissez un fichier GPX");
      return;
    }
    setBusy(true);
    setProgressMsg("Envoi du fichier...");
    try {
      await uploadGpx(file, config.min_dist_m, config.min_deniv_m);
    } catch (err) {
      setBusy(false);
      alert("Erreur upload: " + (err as Error).message);
    }
  }, [config]);

  const handleRecompute = useCallback(async (minDist: number, minDeniv: number) => {
    setShowSettings(false);
    setBusy(true);
    setProgressMsg("Relance de l'analyse...");
    try {
      await recomputeAnalysis(minDist, minDeniv);
      setConfig({ min_dist_m: minDist, min_deniv_m: minDeniv });
    } catch (err) {
      setBusy(false);
      alert("Erreur: " + (err as Error).message);
    }
  }, []);

  const course = data.course;
  const highlightRange = highlightSection
    ? [highlightSection.start_km, highlightSection.end_km] as [number, number]
    : null;

  return (
    <>
      <header>
        <div>
          <h1>{course?.name ?? "GPX Profile"}</h1>
          {course && (
            <p>
              {course.total_km} km · {data.sections.length} sections · survolez pour la pente
            </p>
          )}
        </div>
        <div className="toolbar">
          <input type="file" ref={fileRef} accept=".gpx" />
          <button
            onClick={handleUpload}
            disabled={busy}
            style={{
              background: "#3a86ff",
              color: "#fff",
              border: 0,
              padding: "8px 14px",
              borderRadius: 6,
              cursor: busy ? "default" : "pointer",
              fontSize: 13,
              opacity: busy ? 0.5 : 1,
            }}
          >
            Analyser ce GPX
          </button>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              background: "#444",
              color: "#fff",
              border: 0,
              padding: "8px 14px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ⚙ Réglages
          </button>
        </div>
      </header>

      <div className="container">
        <div className="legend">
          <strong>Pente :</strong>
          {SLOPE_LEGEND.map((item) => (
            <span key={item.label}>
              <i className="sw" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>

        {course ? (
          <>
            <ProfileChart
              course={course}
              highlightRange={highlightRange ?? undefined}
              highlightColor={highlightSection?.dir === "down" ? "rgba(215,48,39,0.18)" : "rgba(44,162,95,0.18)"}
            />
            <div className="hint">
              Molette = zoom vertical · Shift+molette = zoom horizontal ·
              Double-clic = reset · Cliquez une section dans le tableau pour la voir en détail.
            </div>
            <SectionsTable
              sections={data.sections}
              onHoverSection={setHighlightSection}
              onClickSection={(n) => window.location.href = `/section/${n}`}
            />
          </>
        ) : (
          <div className="empty-state">
            Aucune course chargée.<br />
            Uploadez un fichier GPX pour générer le profil.
          </div>
        )}
      </div>

      <Spinner visible={busy} message={progressMsg} />

      {showSettings && (
        <SettingsModal
          config={config}
          onClose={() => setShowSettings(false)}
          onRecompute={handleRecompute}
        />
      )}
    </>
  );
}
