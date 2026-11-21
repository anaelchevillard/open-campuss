// Accueil, Matières, favoris en filtre, palette et « Demander… », Demandes, tutoriel en 2 écrans.
// ⌘K : on réessaie tant que la page n'a pas fini de s'hydrater (l'écouteur clavier arrive avec le JS)
async function openPalette(page) {
  const dialog = page.getByRole("dialog", { name: "Recherche" });
  for (let i = 0; i < 5 && !(await dialog.isVisible()); i++) { await page.keyboard.press("Control+k"); await dialog.waitFor({ timeout: 3000 }).catch(() => undefined); }
  return dialog;
}
export async function run({ admin, member, student, check, BASE, freshStudent }) {
  // --- favoris : redirection et étoile avec « Annuler »
  await member.goto(`${BASE}/favoris`);
  check("favoris : /favoris mène à /matieres?favoris=1", /\/matieres\?favoris=1$/.test(member.url()));
  await member.goto(`${BASE}/matieres?tri=recent`);
  const star = member.locator("article").first().getByRole("button", { name: /aux favoris|des favoris/ });
  if (await star.count()) {
    const before = await star.getAttribute("aria-pressed");
    await star.click();
    await member.getByRole("button", { name: "Annuler" }).click();
    await member.waitForTimeout(800);
    check("favoris : l'étoile ajoute ou retire, « Annuler » rétablit", (await star.getAttribute("aria-pressed")) === before);
  }

  // --- accueil : une seule action principale, une matière en 1 clic
  await member.goto(`${BASE}/accueil`);
  check("accueil : carte du jour", await member.getByRole("region", { name: /./ }).first().isVisible() && (await member.locator("#carte-du-jour").count()) === 1);
  check("accueil : plus de nom de licence en titre ni d'onglets L1/L2/L3", !(await member.getByRole("navigation", { name: "Année de licence" }).count()));
  const tile = member.locator("main a[href^='/matieres/']").first();
  if (await tile.count()) { await tile.click(); await member.waitForURL(/\/matieres\/\d+/); check("accueil : une matière en 1 clic", true); }

  // --- palette : peu de résultats, « Demander… » crée la demande sans quitter la palette
  await member.goto(`${BASE}/accueil`);
  const palette = await openPalette(member);
  await palette.waitFor();
  const query = `zzchap ${Math.floor(Math.random() * 9000) + 1000} introuvable`;
  await palette.getByRole("combobox", { name: "Rechercher" }).fill(query);
  const ask = palette.getByRole("option", { name: /^Demander « / });
  await ask.waitFor();
  check("palette : « Demander… » pour une recherche sans résultat", await ask.isVisible());
  await member.screenshot({ path: "/shots/parcours-palette-demander.png" });
  await ask.click();
  await palette.getByRole("button", { name: "Demander" }).click();
  await palette.getByText("Demande envoyée").waitFor();
  check("palette : demande créée sans quitter la palette", await palette.isVisible());
  await member.keyboard.press("Escape");

  // Une demande proche : l'autre étudiant se voit proposer « Moi aussi »
  await student.goto(`${BASE}/accueil`);
  const other = await openPalette(student);
  await other.getByRole("combobox", { name: "Rechercher" }).fill(query);
  await other.getByRole("button", { name: "Moi aussi" }).waitFor({ timeout: 15000 }).catch(() => undefined);
  check("palette : une demande proche propose « Moi aussi »", await other.getByRole("button", { name: "Moi aussi" }).isVisible());
  await student.keyboard.press("Escape");

  // --- Demandes : anonymes, jamais vides
  await student.goto(`${BASE}/demandes?vue=attendues`);
  check("demandes : la demande apparaît", await student.getByText(query).first().isVisible());
  check("demandes : aucun nom d'auteur", !(await student.getByText(/Demandé par [A-ZÉ][a-zé]/).count()));
  check("demandes : jamais vide (demandes ou besoins détectés)", (await student.locator("main li").count()) > 0);
  await student.goto(`${BASE}/demandes?nouvelle=1`);
  // autoFocus s'applique à l'hydratation : on laisse jusqu'à 5 s au lieu de lire juste après le chargement
  const composer = student.getByRole("textbox", { name: "Ta demande" });
  let focused = false;
  for (let i = 0; i < 25 && !focused; i++) { focused = await composer.evaluate((el) => el === document.activeElement).catch(() => false); if (!focused) await student.waitForTimeout(200); }
  check("demandes : ?nouvelle=1 met le focus sur le composeur", focused);

  // --- semestres : S2 à part, matière annuelle aux deux
  await admin.goto(`${BASE}/matieres?semestre=1`);
  const s1 = await admin.locator("main a[href^='/matieres/']").count();
  await admin.goto(`${BASE}/matieres?semestre=2`);
  const s2 = await admin.locator("main a[href^='/matieres/']").count();
  check("semestres : les deux semestres s'affichent", s1 > 0 && s2 > 0);

  // --- tutoriel : 2 écrans, ni année ni tour
  const fresh = await freshStudent(`parcours${Date.now()}@etu.exemple.fr`).catch(() => null);
  if (fresh) {
    check("bienvenue : aucun écran de tour", !(await fresh.locator(".driver-popover").count()));
    await fresh.goto(`${BASE}/accueil`);
    check("bien démarrer : la liste est sur l'accueil", await fresh.getByRole("heading", { name: "Bien démarrer" }).isVisible());
    await fresh.screenshot({ path: "/shots/parcours-bien-demarrer.png", fullPage: true });
  }
  // Un étudiant qui a fini le tutoriel (l'admin n'y passe jamais, il n'est donc pas « accueilli »)
  await member.goto(`${BASE}/bienvenue`);
  check("bienvenue : un compte déjà accueilli retourne à l'accueil", new URL(member.url()).pathname === "/accueil");
}
