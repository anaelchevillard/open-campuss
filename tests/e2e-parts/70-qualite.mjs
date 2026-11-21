// Juger un cours : étoiles, badge, enseignant et année, fiches IA signalées, attente de validation.
export async function run({ admin, member, student, check, BASE, openBlankDraft, waitSaved, send, quizDoc, freshStudent }) {
  const docId = quizDoc.split("/").pop();
  const star = (page, n) => page.getByRole("radio", { name: `${n} étoile${n > 1 ? "s" : ""}`, exact: true });

  // Étoiles : enregistrées sans bouton, modifiables, les deux emplacements restent d'accord
  await student.goto(`${BASE}${quizDoc}`);
  check("notes : étoiles à la fin du texte, pas à côté du favori", await star(student, 4).count() === 1);
  check("notes : le Merci reste", await student.getByRole("button", { name: /Merci/ }).isVisible());
  // Un clic avant l'hydratation est perdu (React rend le bouton radio contrôlé à son état) : on reclique
  for (let i = 0; i < 10 && !(await star(student, 4).first().isChecked()); i++) {
    await star(student, 4).first().check({ force: true, timeout: 2000 }).catch(() => undefined);
    await student.waitForTimeout(500);
  }
  await student.waitForTimeout(1200);
  await student.reload();
  check("notes : enregistrée sans valider", await star(student, 4).first().isChecked());
  await star(student, 4).first().focus();
  await student.keyboard.press("ArrowRight");
  await student.waitForTimeout(1200);
  await student.reload();
  check("notes : modifiable au clavier", await star(student, 5).first().isChecked());
  check("notes : pas de moyenne sous trois notes", !(await student.getByText(/\d,\d \(\d+\)/).count()));
  await student.screenshot({ path: "/shots/qualite-page.png", fullPage: true });

  // Le badge, l'enseignant et le filtre, sur un cours de l'administrateur
  check("badge : affiché sur la page d'un cours publié", await student.getByText("Relu par un délégué").first().isVisible());
  const subject = await student.locator('nav a[href^="/matieres/"]').first().getAttribute("href");
  await admin.goto(`${BASE}${subject}`);
  check("carte : date de mise à jour visible", await admin.locator("article").first().getByText(/Mis à jour le/).isVisible());
  check("filtre : par année", await admin.getByRole("button", { name: "Filtrer par année universitaire" }).count() <= 1);
  await admin.getByRole("button", { name: "Trier" }).click();
  await admin.getByRole("menuitemradio", { name: "Mieux notés" }).click();
  await admin.waitForURL(/tri=notes/);
  await admin.screenshot({ path: "/shots/qualite-matiere.png", fullPage: true });
  const size = admin.viewportSize();
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.reload();
  check("carte : pas de débordement à 390 px", await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  if (size) await admin.setViewportSize(size);

  // Un auteur ne note pas son propre cours
  await admin.goto(`${BASE}${quizDoc}`);
  check("notes : pas d'étoiles pour l'auteur", await star(admin, 1).count() === 0);

  // Fiches IA : deux signalements, une seule ligne ; une fiche retirée ne revient pas ; une copie reste
  // Un clic avant l'hydratation est perdu : on reclique tant que la liste n'est pas là
  const openCards = async (page) => {
    await page.goto(`${BASE}${quizDoc}`);
    const flag = page.getByRole("button", { name: "Signaler une erreur" }).first();
    for (let i = 0; i < 5 && !(await flag.isVisible()); i++) {
      await page.getByRole("button", { name: "Voir les fiches de Campuss IA" }).click();
      await flag.waitFor({ timeout: 3000 }).catch(() => undefined);
    }
    await flag.waitFor({ timeout: 10000 });
  };
  await openCards(student);
  const firstCard = student.locator("#fiches-memo li").first();
  const front = (await firstCard.locator("span.font-semibold").first().textContent()).trim();
  await firstCard.getByRole("button", { name: "Ajouter", exact: true }).click();
  await firstCard.getByRole("button", { name: "Ajoutée" }).waitFor();
  await firstCard.getByRole("button", { name: "Signaler une erreur" }).click();
  await firstCard.getByText("Signalée, merci.").waitFor();
  await openCards(member);
  await member.locator("#fiches-memo li", { hasText: front }).getByRole("button", { name: "Signaler une erreur" }).click();
  await member.locator("#fiches-memo li", { hasText: front }).getByText("Signalée, merci.").waitFor();
  await admin.goto(`${BASE}/moderation?onglet=fiches`);
  const row = admin.getByRole("navigation", { name: "Fiches IA" }).getByRole("button", { name: new RegExp(front.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  check("fiches IA : une seule ligne pour deux signalements", await row.count() === 1 && await row.getByText("2 signalements").isVisible());
  await admin.screenshot({ path: "/shots/qualite-moderation.png", fullPage: true });
  await row.click();
  await admin.getByRole("button", { name: /^Retirer/ }).click();
  await row.waitFor({ state: "detached" });
  await openCards(student);
  check("fiches IA : la fiche retirée ne revient plus", await student.getByText(front, { exact: true }).count() === 0);
  // Les fiches de l'étudiant vivent sur /reviser/fiches (Réviser n'affiche plus qu'un compteur)
  await student.goto(`${BASE}/reviser/fiches`);
  check("fiches IA : la copie de l'étudiant reste à lui", await student.getByText(front, { exact: true }).filter({ visible: true }).first().isVisible());

  // Régénérer le paquet : deux clics, puis la ligne disparaît
  await openCards(student);
  await student.locator("#fiches-memo li").first().getByRole("button", { name: "Signaler une erreur" }).click();
  await student.getByText("Signalée, merci.").waitFor();
  await admin.goto(`${BASE}/moderation?onglet=fiches`);
  await admin.getByRole("button", { name: "Plus d’actions" }).click();
  await admin.getByRole("menuitem", { name: "Régénérer tout le paquet" }).click();
  await admin.getByText("Le paquet est régénéré").waitFor({ timeout: 30000 }).catch(() => undefined);
  await admin.goto(`${BASE}/moderation?onglet=fiches`);
  check("fiches IA : la régénération solde les signalements", await admin.getByText("Aucune fiche signalée").isVisible());

  const author = await freshStudent("qualite_essai@etu.exemple.fr");
  // Attente de validation, vue de l'auteur
  await openBlankDraft(author);
  await author.locator("textarea[name=title]").fill("Cours en attente de relecture");
  await author.locator("select[name=subject]").selectOption({ index: 1 });
  await author.getByRole("button", { name: /^Détails/ }).click();
  await author.locator("select[name=rights]").selectOption({ index: 1 });
  await author.locator("input[name=teacher]").fill("M. Dupont");
  await author.keyboard.press("Escape");
  await author.locator(".ProseMirror").click();
  await author.keyboard.type("Un texte écrit par l'auteur.");
  await waitSaved(author);
  await send(author);
  await author.getByText(/Validation sous 24 h en général. Il attend depuis moins d’une heure/).waitFor();
  check("attente : annoncée sur la page d'édition", true);
  await author.goto(`${BASE}/contribuer`);
  // La grille apparaît un instant après le chargement (fondu d'entrée de la vue) : on l'attend
  await author.getByText(/^Envoyé le/).filter({ visible: true }).first().waitFor({ timeout: 10000 }).catch(() => undefined);
  check("attente : annoncée sur Mes documents", await author.getByText("En attente", { exact: true }).filter({ visible: true }).first().isVisible() && await author.getByText(/^Envoyé le/).filter({ visible: true }).first().isVisible());

  // Publication : badge sur la carte et notification de l'auteur
  await admin.goto(`${BASE}/moderation`);
  await admin.getByRole("navigation", { name: "À valider" }).getByRole("button", { name: /Cours en attente de relecture/ }).click();
  await admin.keyboard.press("e");
  await admin.waitForURL(/\/d\//);
  // Barre « Relecture » : Publier, puis l'engagement demandé une fois par séance
  await admin.getByRole("region", { name: "Relecture" }).getByRole("button", { name: /^Publier/ }).click();
  await admin.getByRole("button", { name: "J’ai vérifié, publier" }).click({ timeout: 3000 }).catch(() => undefined);
  await admin.getByText("Relu par un délégué").first().waitFor();
  check("badge : posé à la publication", true);
  check("enseignant : affiché sur la page", await admin.getByText("M. Dupont").filter({ visible: true }).first().isVisible());
  await admin.locator('nav a[href^="/matieres/"]').first().click();
  await admin.waitForURL(/matieres/);
  check("enseignant : affiché sur la carte", await admin.locator("article", { hasText: "M. Dupont" }).first().isVisible());
  // Un seul enseignant : le filtre n'a rien à proposer et reste caché ; sinon il ne propose que les valeurs présentes
  const filter = admin.getByRole("button", { name: "Filtrer par enseignant" });
  if (await filter.count()) {
    await filter.click();
    // L'enseignant est exigé à l'envoi : d'autres cours de la matière ont le leur (M. Martin…).
    // Le menu propose « Enseignants » puis seulement des noms portés par une carte de la page.
    const [all, ...names] = await admin.getByRole("menuitemradio").allTextContents();
    const present = await Promise.all(names.map((name) => admin.locator("article", { hasText: name }).count()));
    check("filtre : seules les valeurs présentes", all === "Enseignants" && names.includes("M. Dupont") && present.every((n) => n > 0), [all, ...names].join());
    await admin.getByRole("menuitemradio", { name: "M. Dupont" }).click();
  } else await admin.goto(`${admin.url().split("?")[0]}?enseignant=${encodeURIComponent("M. Dupont")}`);
  await admin.waitForURL(/enseignant=/);
  await admin.waitForTimeout(800);
  check("filtre : par enseignant", await admin.locator("article").count() >= 1 && await admin.locator("article", { hasNotText: "M. Dupont" }).count() === 0);
  // La notification part juste après la publication : on lui laisse quelques secondes
  let inbox = await author.goto(`${BASE}/notifications`);
  for (let i = 0; i < 5 && inbox?.status() === 200 && !(await author.getByText(/Ton cours est (en ligne|publié)/).filter({ visible: true }).count()); i++) { await author.waitForTimeout(1500); inbox = await author.reload(); }
  if (inbox?.status() === 200) check("notification : l'auteur apprend la publication", await author.getByText(/Ton cours est (en ligne|publié)/).filter({ visible: true }).first().isVisible());
}
