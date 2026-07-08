interface Props {
  visible: boolean;
  message?: string;
}

export default function Spinner({ visible, message = "Analyse en cours..." }: Props) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: "24px 32px",
          borderRadius: 12,
          textAlign: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,.3)",
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            border: "5px solid #eee",
            borderTopColor: "#3a86ff",
            borderRadius: "50%",
            margin: "0 auto 12px",
            animation: "spin 1s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 14, color: "#444" }}>{message}</div>
      </div>
    </div>
  );
}
