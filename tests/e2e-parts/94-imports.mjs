// « Commencer avec… » sur un brouillon vierge, photo ou PDF avec Campuss IA, comptes connectés (sans clés OAuth sur le banc).
export async function run({ member, check, BASE, FX, pageFetch }) {
  const json = (p, url, init) => p.evaluate(async ([u, i]) => { const r = await fetch(u, i); return { status: r.status, body: await r.json().catch(() => null) }; }, [url, init]);

  // --- départ transmis : le brouillon s'ouvre avec ?depart=, l'adresse est nettoyée ensuite
  await member.goto(`${BASE}/contribuer/nouveau?depart=photo`);
  await member.waitForURL(/\/editer\/[0-9a-f-]{36}/, { timeout: 30000 });
  const doc = new URL(member.url()).pathname.split("/").pop();
  check("imports : /contribuer/nouveau crée le brouillon et ouvre l'éditeur", Boolean(doc));

  // --- ce que les tuiles peuvent proposer : sans clés OAuth, aucun service ; l'IA du banc est là
  const status = await json(member, `/api/connected/status?doc=${doc}`);
  check("imports : état des tuiles lisible sur son brouillon", status.status === 200 && Array.isArray(status.body?.accounts));
  check("imports : sans clés, ni Notion ni Google", status.body?.accounts?.length === 0);
  check("imports : la photo est proposée quand l'IA est là", status.body?.ocr === true);
  check("imports : état refusé sur le brouillon d'un autre", (await pageFetch(member, "/api/connected/status?doc=11111111-1111-4111-8111-111111111111")) === 403);

  // --- tuiles dans l'éditeur vierge
  await member.goto(`${BASE}/editer/${doc}`);
  await member.locator(".ProseMirror").waitFor({ timeout: 30000 });
  const tiles = member.getByRole("region", { name: "Commencer avec…" });
  await tiles.waitFor({ timeout: 10000 }).catch(() => undefined);
  check("imports : tuiles « Commencer avec… » sur le brouillon vierge", await tiles.isVisible());
  check("imports : tuile photo ou PDF avec Campuss IA", await tiles.getByText("Photo ou PDF avec Campuss IA").isVisible().catch(() => false));
  check("imports : aucune tuile Notion ni Google sans clés (rien de grisé)", !(await tiles.getByText("Notion").count()) && !(await tiles.getByText("Google Docs").count()));
  await member.screenshot({ path: "/shots/imports-tuiles.png" });

  // --- la photo : la transcription démarre et le texte arrive dans l'éditeur
  const photo = tiles.locator('input[aria-label="Prendre une photo ou choisir un PDF"]');
  if (await photo.count()) {
    await photo.setInputFiles(FX + "page.png");
    const attest = member.locator("input[name=attest-ocr]");
    if (await attest.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
      await attest.check();
      await member.getByRole("button", { name: /Transcrire 1 page/ }).click();
    }
    await member.locator(".ProseMirror").getByText("Loi normale", { exact: true }).waitFor({ timeout: 60000 }).catch(() => undefined);
    check("imports : la photo est transcrite dans l'éditeur", await member.locator(".ProseMirror").getByText("Loi normale", { exact: true }).isVisible().catch(() => false));
    check("imports : mention « à vérifier » après la transcription", await member.getByText("Généré par Campuss IA · à vérifier").first().isVisible().catch(() => false));
    await member.screenshot({ path: "/shots/imports-photo.png" });
  }

  // --- un PDF texte passe par l'import, sans l'IA
  const pdf = await member.evaluate(async ([d, bytes]) => {
    const r = await fetch(`/api/editor/import?doc=${d}`, { method: "POST", body: new Uint8Array(bytes), headers: { "x-filename": "vrai.pdf" } });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [doc, [...(await import("node:fs")).readFileSync(FX + "vrai.pdf")]]);
  check("imports : un PDF est converti ou reconnu comme scan", (pdf.status === 200 && Array.isArray(pdf.body?.blocks)) || (pdf.status === 422 && pdf.body?.scanned === true));

  // --- import d'une page connectée : refusé sans compte relié
  const source = await json(member, "/api/editor/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId: doc, source: { provider: "notion", id: "abc" } }) });
  check("imports : page Notion refusée sans service configuré", source.status === 400);

  // --- comptes connectés : la page existe toujours (connexion à Campuss) ; sans clés, aucun service n'y figure
  check("imports : comptes connectés ouverts sans clés, sans service", (await member.goto(`${BASE}/parametres/comptes-connectes`)).status() === 200 && !(await member.getByText("Google Drive").count()));
  check("imports : connexion introuvable sans clés, retour extérieur jamais suivi", (await pageFetch(member, "/api/connected/notion/start?retour=https%3A%2F%2Fexemple.com")) === 404);
  check("imports : sélecteur introuvable sans clés", (await pageFetch(member, "/api/connected/google/pages?q=x")) === 404);
}
