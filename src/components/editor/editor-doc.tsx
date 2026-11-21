"use client";

import { createContext, useContext } from "react";

/** Le document en cours d'écriture, pour les blocs qui envoient un fichier (artefact) ; null hors d'un cours. */
export const EditorDocContext = createContext<string | null>(null);
export const useEditorDoc = () => useContext(EditorDocContext);
