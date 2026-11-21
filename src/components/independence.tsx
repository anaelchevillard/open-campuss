"use client";

import { createContext, useContext, type ReactNode } from "react";
import { independenceText } from "@/lib/organization-text";

// Nom de l'université (UNIVERSITY_NAME), fourni par le layout : la mention s'affiche aussi dans les pages du navigateur
const UniversityContext = createContext("");

export function UniversityProvider({ university, children }: { university: string; children: ReactNode }) {
  return <UniversityContext.Provider value={university}>{children}</UniversityContext.Provider>;
}

export function IndependenceNotice({ className }: { className?: string }) {
  return <p className={className}>{independenceText(useContext(UniversityContext))}</p>;
}
