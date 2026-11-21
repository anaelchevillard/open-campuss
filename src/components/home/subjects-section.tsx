"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { SegmentedTabs } from "@/components/segmented-tabs";

/** Matières du semestre : « Toutes » (tuiles) ou « Favoris » (cours étoilés), sans quitter l'accueil. */
export function SubjectsSection({ all, favorites, favoriteCount }: { all: ReactNode; favorites: ReactNode; favoriteCount: number }) {
  const [value, setValue] = useState("all");
  return (
    <section aria-labelledby="matieres" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <h2 id="matieres" className="heading">Matières</h2>
        <SegmentedTabs label="Matières affichées" value={value} onValueChange={setValue} className="mx-0 px-0"
          items={[{ value: "all", label: "Toutes" }, { value: "favorites", label: "Favoris", count: favoriteCount }]} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={value} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {value === "all" ? all : favorites}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
