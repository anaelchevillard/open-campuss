// Quota, santé, file d'imports, limites. La limite de téléchargement et le quota plein ne se jouent pas ici : il faudrait
// 120 fichiers ou 500 Mo. Leur logique est dans tests/infra.test.ts.
export async function run({ admin, member, student, check, BASE, openBlankDraft, pageFetch }) {
  const anonymous = await (await fetch(`${BASE}/api/health`)).json();
  check("santé : un anonyme ne voit que l'état général", anonymous.status === "ok" && Object.keys(anonymous).length === 1, JSON.stringify(anonymous));
  await member.goto("/parametres/compte");
  const asMember = await member.evaluate(async () => (await fetch("/api/health")).json());
  check("santé : un membre ne voit pas le détail", Object.keys(asMember).length === 1, JSON.stringify(asMember));
  // Section « Données » de Compte et sécurité : espace utilisé, puis le quota
  const used = (p) => p.locator("#donnees span.text-muted-foreground").first();
  await used(member).waitFor({ timeout: 10000 });
  check("compte : espace utilisé affiché avec le quota", /sur 500 Mo/.test(await used(member).textContent()));
  await member.screenshot({ path: "/shots/infra-account.png" });

  await admin.goto("/parametres/compte");
  const asAdmin = await admin.evaluate(async () => (await fetch("/api/health")).json());
  check("santé : détail pour un administrateur", asAdmin.database === "ok" && asAdmin.storage === "ok" && ["ok", "disabled", "unavailable"].includes(asAdmin.antivirus), JSON.stringify(asAdmin));
  check("santé : disque mesuré", typeof asAdmin.diskPercent === "number", JSON.stringify(asAdmin));
  check("compte : administrateur sans limite affichée", !/sur 500 Mo/.test(await used(admin).textContent()));

  // Imports simultanés : chacun finit avec un résultat, ou un refus lisible s'il dépasse la file
  await openBlankDraft(student);
  const doc = new URL(student.url()).pathname.split("/").pop();
  const results = await student.evaluate(async (id) => Promise.all(Array.from({ length: 8 }, async (_, i) => {
    const response = await fetch(`/api/editor/import?doc=${id}`, { method: "POST", headers: { "x-filename": `n${i}.md` }, body: `# Note ${i}\n\nTexte.` });
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("ndjson")) return { status: response.status, body: await response.json() };
    const last = (await response.text()).trim().split("\n").pop();
    return JSON.parse(last);
  })), doc);
  check("import : 8 envois simultanés aboutissent ou demandent de patienter", results.every((r) => (r.status === 200 && r.body.blocks) || (r.status === 503 && /dans une minute/.test(r.body.error))), JSON.stringify(results.map((r) => r.status)));
  check("import : au moins un aboutit", results.some((r) => r.status === 200));

  // Une image insérée n'entre pas dans la limite de téléchargement : la lecture ne doit jamais se bloquer
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const url = await student.evaluate(async ([id, data]) => {
    const body = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    return (await (await fetch(`/api/editor/images?doc=${id}`, { method: "POST", headers: { "x-filename": "point.png" }, body })).json()).url;
  }, [doc, png]);
  const statuses = await student.evaluate(async (u) => Promise.all(Array.from({ length: 130 }, async () => (await fetch(u)).status)), url);
  check("téléchargements : 130 images intégrées restent servies", statuses.every((s) => s === 200), [...new Set(statuses)].join());
  check("téléchargements : fichier inconnu toujours 404", (await pageFetch(student, "/files/00000000-0000-4000-8000-000000000000")) === 404);
}
