const PART = 8 * 1024 * 1024;

async function readError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "L’envoi a échoué.";
}

export async function sendFile(documentId: string, purpose: "attachment" | "page" | "zip", file: File, onBytes: (bytes: number) => void) {
  const started = await fetch("/api/admin/uploads", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, purpose, filename: file.name, size: file.size }),
  });
  if (!started.ok) throw new Error(await readError(started));
  const { id } = await started.json() as { id: string };
  for (let part = 1, start = 0; start < file.size; part++, start += PART) {
    const chunk = file.slice(start, start + PART);
    let response: Response | null = null;
    // Une coupure réseau sur un morceau ne fait pas perdre tout l'envoi
    for (let attempt = 0; attempt < 3 && !response?.ok; attempt++) {
      response = await fetch(`/api/admin/uploads/${id}?part=${part}`, { method: "PUT", body: chunk }).catch(() => null);
    }
    if (!response?.ok) throw new Error(response ? await readError(response) : "Connexion interrompue pendant l’envoi.");
    onBytes(chunk.size);
  }
  const finished = await fetch(`/api/admin/uploads/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!finished.ok) throw new Error(await readError(finished));
}
