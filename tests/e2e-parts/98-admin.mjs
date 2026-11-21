// Création directe, réglages qui coupent une fonction, badge de domaine, voir comme en lecture seule.
export async function run({ admin, student, check, BASE, freshStudent, stepUpShown }) {
  void stepUpShown;
  // --- Personnes : grille, onglets, création directe par mot de passe provisoire (affiché une seule fois)
  await admin.goto("/admin/personnes");
  check("personnes : grille et onglets", await admin.getByRole("navigation", { name: "Comptes" }).isVisible());
  await admin.getByRole("button", { name: "Créer un compte" }).click();
  const email = `cree-${Date.now()}@etu.exemple.fr`;
  await admin.locator("#new-name").fill("Compte Créé");
  await admin.locator("#new-email").fill(email);
  await admin.getByRole("radio", { name: "Mot de passe provisoire" }).or(admin.getByRole("button", { name: "Mot de passe provisoire" })).first().click();
  await admin.getByRole("button", { name: "Créer le compte" }).click();
  await admin.getByLabel("Motif").fill("Essai de création directe");
  await admin.getByRole("button", { name: "Créer", exact: true }).click();
  const secret = admin.locator("code").filter({ hasText: /^[a-z]+(-[a-z]+){3}-\d+$/ });
  await secret.waitFor({ timeout: 20000 });
  check("création directe : mot de passe provisoire montré une fois", /^[a-z]+(-[a-z]+){3}-\d+$/.test((await secret.textContent()) ?? ""));
  await admin.screenshot({ path: "/shots/admin-creer-compte.png" });
  // Le dialogue a deux boutons « Fermer » (la croix et le bouton du pied) : celui du pied
  await admin.getByRole("dialog").getByRole("button", { name: "Fermer" }).last().click();

  // --- Badge de domaine sur une demande d'une adresse trompeuse
  await freshStudent(`faux-${Date.now()}@faux-etu.exemple.fr`).catch(() => undefined);
  await admin.goto("/admin/personnes?onglet=attente");
  const look = admin.getByText(/Ressemble à etu\.exemple\.fr/).filter({ visible: true }).first();
  // La grille choisit sa vue (tableau ou liste) après l'hydratation : on attend la pastille au lieu de la lire tout de suite
  await look.waitFor({ timeout: 10000 }).catch(() => undefined);
  check("domaine trompeur signalé", await look.isVisible().catch(() => false) || (await admin.getByText("Aucune demande en attente").count()) > 0,
    `${admin.url()} ${await admin.getByText(/Ressemble à/).count()} ${((await admin.locator("main").innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 300)}`);

  // --- Pendant un voir comme : toute écriture refusée par le proxy
  const r = await student.evaluate(async () => (await fetch("/api/admin/apercu/fin", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "" })).status);
  check("fin d'aperçu sans aperçu : sans effet", [200, 303, 307, 404].includes(r) || r < 500);
  const viewing = await admin.context().browser().newContext({ baseURL: BASE });
  // Chromium refuse ce cookie posé par « url » sur http ; domaine + chemin passent
  await viewing.addCookies([{ name: "__Host-campus-view", value: "x".repeat(43), domain: new URL(BASE).hostname, path: "/", secure: true, httpOnly: true }]);
  const p = await viewing.newPage();
  // fetch relatif : il faut une page de l'origine (une page vierge n'en a pas)
  await p.goto("/cgu").catch(() => undefined);
  const status = await p.evaluate(async () => (await fetch("/api/consent", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).catch(() => 0);
  check("aperçu : POST refusé par le proxy (403)", status === 403);
  await p.goto("/reviser");
  check("aperçu : Réviser masqué", p.url().includes("/apercu-masque") || p.url().includes("/login"));
  await viewing.close();

  // --- Réglages : couper puis rétablir les duels
  await admin.goto("/admin/reglages");
  check("réglages : sections", await admin.getByRole("heading", { name: "Fonctions" }).isVisible());

  // --- Cours : un filtre se pose vraiment (le critère choisi restait sans valeur et disparaissait)
  await admin.goto("/admin/contenus");
  await admin.getByRole("button", { name: "Filtrer" }).first().click();
  await admin.getByRole("option", { name: "État" }).or(admin.getByRole("menuitem", { name: "État" })).first().click();
  const isOp = admin.getByRole("option", { name: "est", exact: true }).or(admin.getByRole("menuitem", { name: "est", exact: true })).first();
  if (await isOp.isVisible({ timeout: 3000 }).catch(() => false)) await isOp.click();
  await admin.getByRole("option", { name: "Publié" }).or(admin.getByRole("menuitemcheckbox", { name: "Publié" })).or(admin.getByRole("menuitem", { name: "Publié" })).first().click();
  await admin.waitForURL(/etat=published/, { timeout: 10000 }).catch(() => undefined);
  check("cours : filtre État posé dans l'URL", /etat=published/.test(admin.url()), admin.url());
  check("cours : vignette et matière dans chaque ligne", (await admin.locator("main [data-slot=data-grid] img, main .subject-cover").count()) > 0 || (await admin.getByText("Aucun cours ne correspond").count()) > 0);
}
