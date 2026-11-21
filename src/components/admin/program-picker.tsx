"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Sélecteur de licence global de l'administration, mémorisé dans un cookie. */
export function ProgramPicker({ programs, value }: { programs: { id: number; name: string }[]; value: number | null }) {
  const router = useRouter();
  const items = [{ value: "all", label: "Toutes les licences" }, ...programs.map((p) => ({ value: String(p.id), label: p.name }))];
  return (
    <Select items={items} value={value ? String(value) : "all"} onValueChange={(next) => {
      document.cookie = `campuss-admin-licence=${next === "all" ? "" : next}; path=/; max-age=${next === "all" ? 0 : 31_536_000}; samesite=lax; secure`;
      router.refresh();
    }}>
      <SelectTrigger aria-label="Licence" className="min-w-40"><SelectValue /></SelectTrigger>
      <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}
