"use client";

import { Icon } from "@/components/icon";
import { useCreateSheet } from "@/components/create-sheet";
import { Button } from "@/components/ui/button";
import { IconAdd } from "@/lib/icons";

/** « Nouveau » de l'en-tête, à l'ordinateur seulement : au téléphone et à la tablette, le + de la barre d'onglets suffit. */
export function NewButton() {
  const { open } = useCreateSheet();
  return <Button className="max-lg:hidden" onClick={() => open()}><Icon icon={IconAdd} size={16} />Nouveau</Button>;
}
