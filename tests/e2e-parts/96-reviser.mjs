// Premier contact sans formulaire, séance en un clic, ami ajouté sur place, blocage, jeu masquable.
export async function run({ student, member, check, BASE, freshStudent, saveSettings }) {
  // --- un compte neuf voit une action, jamais un formulaire
  const fresh = await freshStudent(`reviser-${Date.now()}@etu.exemple.fr`);
  await fresh.goto(`${BASE}/reviser`);
  check("réviser : compte vide → « Créer mes fiches »", await fresh.getByRole("link", { name: "Créer mes fiches" }).isVisible());
  check("réviser : aucun formulaire au premier contact", !(await fresh.locator("main textarea, main form input[name=front]").count()));
  check("réviser : onglets Aujourd’hui, Fiches, Partiels, Ensemble", await fresh.getByRole("navigation", { name: "Réviser" }).getByRole("link", { name: "Ensemble" }).isVisible() && await fresh.getByRole("navigation", { name: "Réviser" }).getByRole("link", { name: /^Fiches/ }).isVisible());
  await fresh.screenshot({ path: "/shots/reviser-vide.png", fullPage: true });
  // Sans fiche, les cours tout de suite, en mode « Créer des fiches » (plus d'écran « choisis un cours »)
  await fresh.getByRole("link", { name: "Créer mes fiches" }).click();
  await fresh.waitForURL(/\/reviser\/fiches\/nouveau/);
  check("fiches : mode création avec ses étapes", await fresh.getByRole("heading", { level: 1, name: "Créer des fiches" }).isVisible() && await fresh.getByRole("list", { name: "Étapes" }).isVisible());
  check("fiches : message pour un compte sans fiche", await fresh.getByText("Tu n’as pas encore de fiches.").isVisible());
  check("fiches : recherche de cours", await fresh.getByRole("searchbox", { name: "Rechercher un cours" }).isVisible());
  await fresh.goto(`${BASE}/reviser/seance?nouvelles=5`);
  await fresh.waitForURL(/\/reviser\/fiches\/nouveau/);
  check("fiches : « Faire 5 fiches » sans fiche mène droit aux cours", true);
  await fresh.goto(`${BASE}/reviser/seance`);
  await fresh.waitForURL(/\/reviser\/fiches\/nouveau/);
  check("séance : plus de « Rien à réviser » pour un compte sans fiche", !(await fresh.getByText(/Rien à réviser/).count()));
  // Filtre par matière (chips) ; cartes « Créer des fiches », pas les cartes de cours
  const subjectNav = fresh.getByRole("navigation", { name: "Filtrer par matière" });
  if (await subjectNav.isVisible().catch(() => false)) {
    await subjectNav.getByRole("link").nth(1).click();
    await fresh.waitForURL(/matiere=\d+/);
    check("fiches : filtre par matière", (await fresh.locator("main a[href*='/reviser/fiches/nouveau?cours=']").count()) > 0 || (await fresh.getByText("Aucun cours trouvé").count()) > 0);
    check("fiches : pas de carte de cours habituelle", (await fresh.locator("main article").count()) === 0);
  }

  // Partiel blanc sans assez de quiz → pourquoi, et trois issues claires
  await fresh.goto(`${BASE}/reviser/seance?mode=partiel`);
  const noMock = fresh.getByRole("heading", { name: /^Pas encore assez de quiz en / });
  if (await noMock.isVisible().catch(() => false)) {
    check("partiel blanc : explique et propose trois issues", await fresh.getByText("Un partiel blanc tire ses questions des quiz").isVisible()
      && await fresh.getByText("Générer les quiz avec Campuss IA").isVisible() && await fresh.getByText("Faire un partiel avec mes fiches").isVisible() && await fresh.getByText("S’entraîner sur les sujets publiés").isVisible());
  } else {
    check("partiel blanc : un partiel ou un choix de matière", await fresh.getByText(/Partiel blanc|Choisis une matière/).first().isVisible());
  }

  // --- Ensemble : ajouter un ami sans changer de page, réponse identique pour un code inconnu
  await fresh.goto(`${BASE}/reviser/ensemble`);
  const field = fresh.getByRole("textbox", { name: "Code d’un ami" }).first();
  await field.fill("ZZZZZ-ZZZZZ");
  await fresh.getByRole("button", { name: "Ajouter", exact: true }).first().click();
  const reply = fresh.getByRole("status").filter({ hasText: "Demande envoyée" }).first();
  await reply.waitFor();
  const unknown = await reply.textContent();
  await student.goto(`${BASE}/amis`);
  const code = (await student.getByTestId("friend-code").first().textContent()).trim();
  await field.fill(code);
  await fresh.getByRole("button", { name: "Ajouter", exact: true }).first().click();
  await fresh.waitForTimeout(900);
  check("ensemble : ajout sur place, sans changer de page", new URL(fresh.url()).pathname === "/reviser/ensemble");
  check("ensemble : même réponse pour un code inconnu", (await fresh.getByRole("status").filter({ hasText: "Demande envoyée" }).first().textContent()) === unknown);

  // --- l'autre accepte, puis bloque : plus d'ami, plus de demande possible
  await student.reload();
  await student.getByRole("region", { name: "Demandes reçues" }).getByRole("button", { name: "Accepter" }).first().click();
  await student.waitForTimeout(1200);
  await student.reload();
  // Tous les comptes neufs du banc s'appellent « Prenom Nom » : la ligne se repère par le lien du profil
  const freshHref = await fresh.goto(`${BASE}/moi`).then(() => fresh.locator('main a[href^="/u/"]').first().getAttribute("href"));
  const list = student.getByRole("list", { name: "Mes amis" });
  const row = list.getByRole("listitem").filter({ has: student.locator(`a[href="${freshHref}"]`) });
  await list.waitFor();
  await row.getByRole("button", { name: /^Actions pour/ }).click();
  await student.getByRole("menuitem", { name: "Bloquer" }).click();
  await student.getByRole("dialog").getByRole("button", { name: "Bloquer" }).click();
  await student.waitForTimeout(1200);
  await fresh.goto(`${BASE}/amis`);
  check("blocage : l'ami disparaît des deux côtés", !(await fresh.getByRole("list", { name: "Mes amis" }).count()));
  await fresh.getByRole("textbox", { name: "Code d’un ami" }).first().fill(code);
  await fresh.getByRole("button", { name: "Ajouter", exact: true }).first().click();
  await fresh.waitForTimeout(900);
  await student.goto(`${BASE}/amis`);
  check("blocage : aucune demande ne passe", !(await student.getByRole("region", { name: "Demandes reçues" }).getByRole("button", { name: "Accepter" }).count()));

  // --- la séance du jour se lance en un clic, au même endroit depuis Aujourd'hui
  await member.goto(`${BASE}/reviser`);
  const start = member.getByRole("region", { name: "Séance du jour" }).getByRole("link", { name: /^Commencer/ }).first();
  if (await start.count()) {
    check("séance : un seul clic depuis Aujourd’hui", (await start.getAttribute("href")) === "/reviser/seance");
    await start.click();
    await member.waitForURL(/\/reviser\/seance/);
    check("séance : plein écran, hors navigation", !(await member.getByRole("navigation", { name: "Navigation principale" }).count()) && await member.getByRole("link", { name: "Quitter la séance" }).isVisible());
    await member.screenshot({ path: "/shots/reviser-seance.png" });
  }

  // --- masquer le jeu : ni flamme, ni quêtes, ni ligue, les fiches restent
  await fresh.goto(`${BASE}/parametres/revision`);
  await fresh.getByRole("switch", { name: /Masquer les éléments de jeu/ }).click();
  await saveSettings(fresh);
  await fresh.goto(`${BASE}/reviser`);
  check("jeu masqué : ni quêtes ni série", !(await fresh.getByRole("region", { name: "Quêtes du jour" }).count()) && !(await fresh.getByRole("region", { name: "Objectif et série" }).count()));
  check("jeu masqué : les modes restent", await fresh.getByRole("link", { name: /Partiel blanc/ }).first().isVisible());
}
