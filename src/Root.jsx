import React from "react";
import { Composition } from "remotion";
import { Prova } from "./Prova.jsx";

// Composizioni del progetto. "Prova" serve solo a controllare che il render funzioni.
export const Root = () => (
  <Composition id="Prova" component={Prova} durationInFrames={60} fps={30} width={1080} height={1920} />
);
