"use client";

import { useEffect, useRef, useState } from "react";

const FONTS = [
  { key: "sans", label: "Source Sans", family: "\"Source Sans 3\", sans-serif" },
  { key: "atkinson", label: "Atkinson", family: "\"Atkinson Hyperlegible Next\", sans-serif" },
  { key: "serif", label: "Serif", family: "\"Source Serif 4\", serif" },
  { key: "od", label: "OpenDyslexic", family: "OpenDyslexic, sans-serif" },
] as const;

/**
 * Les polices de lecture du réglage « Aa », à essayer sur un vrai passage de cours. Chaque bouton s'écrit dans sa police
 * seulement à l'approche de la carte : les trois polices (≈ 190 Ko) ne disputent pas le premier affichage.
 */
export function FontSampler() {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [font, setFont] = useState<(typeof FONTS)[number]["key"]>("sans");
  const family = FONTS.find((f) => f.key === font)?.family;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={box} className="flex h-full flex-col gap-4">
      <div role="group" aria-label="Police de lecture" className="flex flex-wrap gap-1.5">
        {FONTS.map((f) => (
          <button key={f.key} type="button" aria-pressed={font === f.key} onClick={() => setFont(f.key)} className="lp-chip" style={near ? { fontFamily: f.family } : undefined}>{f.label}</button>
        ))}
      </div>
      <p className="lp-sample rounded-xl border border-border bg-card p-4 text-[1.05rem] leading-relaxed transition-[font-family]" style={{ fontFamily: family }}>
        Sur un marché concurrentiel, le prix d’équilibre est celui pour lequel la <mark className="rounded-sm bg-[var(--highlighter)] px-0.5 text-[var(--highlighter-ink,inherit)]">quantité demandée égale la quantité offerte</mark>.
      </p>
    </div>
  );
}
