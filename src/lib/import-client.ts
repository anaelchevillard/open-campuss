/** Réponse d'un import, directe ou précédée d'une attente : l'appelant n'a pas à connaître la différence. */
export const IMPORT_STREAM_TYPE = "application/x-ndjson";

export type ImportEvent = { phase: "waiting" | "running" };

export async function readImportResponse<T>(response: Response, onEvent: (event: ImportEvent) => void): Promise<{ status: number; data: T }> {
  if (!response.headers.get("content-type")?.includes(IMPORT_STREAM_TYPE) || !response.body) {
    return { status: response.status, data: await response.json().catch(() => ({})) as T };
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let result: { status: number; data: T } | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += value;
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) {
      const message = JSON.parse(line) as ImportEvent | { status: number; body: T };
      if ("phase" in message) onEvent(message);
      else result = { status: message.status, data: message.body };
    }
    if (done) break;
  }
  // Connexion coupée en route : même présentation qu'une erreur du serveur
  return result ?? { status: 502, data: {} as T };
}
