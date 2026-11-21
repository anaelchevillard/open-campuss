"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errors/client";

/** Erreurs non rattrapées du navigateur, envoyées à /api/errors (Admin › Erreurs). Ne rend rien. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportError("error", event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => reportError("rejection", event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
