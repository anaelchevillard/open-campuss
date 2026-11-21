"use client";

import "mafs/core.css";
import { Coordinates, Mafs, Plot, Theme } from "mafs";
import type { PlotSpec } from "@/lib/rich/plot";

const COLORS = [Theme.blue, Theme.red, Theme.green, Theme.violet, Theme.orange, Theme.pink];

/** Chargé seulement quand un graphe de fonctions est présent dans la page. */
export default function MafsPlot({ spec }: { spec: PlotSpec }) {
  return (
    <Mafs height={320} zoom={{ min: 0.25, max: 8 }} viewBox={{ x: spec.x, y: spec.y, padding: 0 }} preserveAspectRatio={false}>
      <Coordinates.Cartesian />
      {spec.functions.map((f, i) => <Plot.OfX key={i} y={f.fn} color={COLORS[i % COLORS.length]} />)}
    </Mafs>
  );
}
