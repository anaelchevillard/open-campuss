"use client";

import { useMode } from "@/components/nav/use-mode";
import { SegmentedTabs } from "@/components/segmented-tabs";
import type { Role } from "@/lib/modes";

/** Au téléphone et à la tablette, en Lecture, on passe des matières aux demandes ; en Édition, Demandes est un onglet à part entière. */
export function SectionSwitch({ value, requests, role }: { value: "matieres" | "demandes"; requests?: number; role: Role }) {
  const mode = useMode(role);
  if (mode !== "read") return null;
  return (
    <SegmentedTabs label="Matières ou demandes" value={value} className="mb-6 lg:hidden"
      items={[{ value: "matieres", label: "Matières", href: "/matieres" }, { value: "demandes", label: "Demandes", href: "/demandes", count: requests }]} />
  );
}
