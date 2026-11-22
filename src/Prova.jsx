import React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, interpolate } from "remotion";

const stile = `
@font-face { font-family: "Inter"; font-weight: 600; src: url("${staticFile("fonts/inter-latin-600-normal.woff2")}") format("woff2"); }
@font-face { font-family: "Inter"; font-weight: 800; src: url("${staticFile("fonts/inter-latin-800-normal.woff2")}") format("woff2"); }
`;

// Render di prova: 2 secondi, testo con accenti italiani nel font del progetto.
export const Prova = () => {
  const frame = useCurrentFrame();
  const opacita = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: "#111", justifyContent: "center", alignItems: "center" }}>
      <style>{stile}</style>
      <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 96, color: "#fff", opacity: opacita, textAlign: "center", padding: 60 }}>
        Render di prova: è già così!
      </div>
    </AbsoluteFill>
  );
};
