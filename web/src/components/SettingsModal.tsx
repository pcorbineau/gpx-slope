import { useState } from "react";
import type { ConfigData } from "../lib/types";

interface Props {
  config: ConfigData;
  onClose: () => void;
  onRecompute: (minDist: number, minDeniv: number) => void;
}

export default function SettingsModal({ config, onClose, onRecompute }: Props) {
  const [minDist, setMinDist] = useState(config.min_dist_m);
  const [minDeniv, setMinDeniv] = useState(config.min_deniv_m);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          padding: "24px 28px",
          borderRadius: 12,
          width: 340,
          boxShadow: "0 4px 20px rgba(0,0,0,.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px" }}>Réglages d'analyse</h3>
        <label style={{ display: "block", fontSize: 13, marginBottom: 14, color: "#444" }}>
          Distance minimale d'une section (m)
          <input
            type="number"
            min={0}
            step={50}
            value={minDist}
            onChange={(e) => setMinDist(Number(e.target.value))}
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: 8,
              border: "1px solid #ccc",
              borderRadius: 6,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </label>
        <label style={{ display: "block", fontSize: 13, marginBottom: 14, color: "#444" }}>
          Dénivelé minimal d'une section (m)
          <input
            type="number"
            min={0}
            step={5}
            value={minDeniv}
            onChange={(e) => setMinDeniv(Number(e.target.value))}
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: 8,
              border: "1px solid #ccc",
              borderRadius: 6,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </label>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button
            onClick={onClose}
            style={{
              background: "#888",
              color: "#fff",
              border: 0,
              padding: "8px 14px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => onRecompute(minDist, minDeniv)}
            style={{
              background: "#3a86ff",
              color: "#fff",
              border: 0,
              padding: "8px 14px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Relancer l'analyse
          </button>
        </div>
      </div>
    </div>
  );
}
