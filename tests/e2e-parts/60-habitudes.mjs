// Habitudes : objectif, préparation, saison, défi, partage public, parrainage, groupes.
export async function run({ admin, member, student, check, BASE, newUser, quizDoc }) {
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  // Objectif du jour : réglable sur place, et enregistré sans bouton
  await student.goto(`${BASE}/reviser`);
  const goal = student.getByRole("button", { name: "10 par jour" });
  check("habitudes : objectif réglable", await goal.isVisible());
  await goal.click();
  await student.waitForTimeout(800);
  await student.reload();
  check("habitudes : objectif enregistré", (await student.getByRole("button", { name: "10 par jour" }).getAttribute("aria-pressed")) === "true");
  const reviser = await student.locator("main").textContent();
  check("habitudes : aucun message culpabilisant", !/perdu|cassé|rompu/i.test(reviser));
  await student.screenshot({ path: "/shots/habitudes-reviser.png", fullPage: true });

  // Classement : saison visible, filtre par matière, bandeau refermable
  await student.goto(`${BASE}/classement`);
  check("saison : indiquée sur le classement", await student.getByText(/Saison (d’automne|de printemps) · jusqu’au/).first().isVisible());
  const close = student.getByRole("button", { name: "Fermer l’annonce de saison" });
  if (await close.count()) {
    await close.click();
    await student.waitForTimeout(800);
    await student.reload();
    check("saison : le bandeau fermé ne revient pas", !(await student.getByRole("button", { name: "Fermer l’annonce de saison" }).count()));
  }
  await student.goto(`${BASE}/classement?matiere=999999999`);
  check("classement : matière inconnue sans erreur", await student.getByRole("heading", { name: "Réviser" }).isVisible());

  // Défi : le score à battre n'est montré qu'après avoir joué, et rien n'est servi aux autres licences
  await student.goto(`${BASE}${quizDoc}/quiz`);
  const finished = async (page) => {
    for (let i = 0; i < 30; i++) {
      // Choisir une réponse la valide et passe à la suivante ; à la dernière, « Voir mon score »
      await page.locator("fieldset label").first().click();
      await page.waitForTimeout(400);
      const last = page.getByRole("button", { name: "Voir mon score" });
      if (await last.count()) { await last.click(); return; }
    }
  };
  await finished(student);
  await student.getByRole("button", { name: "Créer un lien de défi" }).click();
  const duelUrl = await student.getByRole("textbox", { name: "Lien" }).inputValue();
  check("défi : lien créé", /\/defi\/[0-9a-f-]{36}$/.test(duelUrl));
  await student.screenshot({ path: "/shots/habitudes-defi.png", fullPage: true });
  const anonymous = await newUser();
  await anonymous.p.goto(duelUrl);
  check("défi : un visiteur anonyme est renvoyé vers la connexion", /\/login/.test(anonymous.p.url()));
  await member.goto(duelUrl);
  const pageHtml = await member.content();
  check("défi : ni réponses ni score à battre avant de jouer", !/"answer"|explanation/.test(pageHtml) && !(await member.locator("main").getByText(/a fait \d+ sur/).count()));
  await finished(member);
  await member.getByText(/a fait \d+ sur \d+/).waitFor();
  check("défi : scores comparés après la partie", true);
  await member.reload();
  check("défi : une seule partie", !(await member.getByRole("button", { name: "Voir mon score" }).count()));

  // Partage : aperçu sans contenu, révocable
  await student.goto(`${BASE}${quizDoc}`);
  await student.getByRole("button", { name: "Partager", exact: true }).click();
  const linkBox = student.getByRole("textbox", { name: "Lien" });
  await linkBox.waitFor();
  const shareUrl = await linkBox.inputValue();
  check("partage : jeton long", /\/p\/[\w-]{43}$/.test(shareUrl));
  const outsider = await newUser();
  const shown = await outsider.p.goto(shareUrl);
  check("partage : page publique accessible", shown?.status() === 200);
  check("partage : non indexée", /noindex/.test(shown?.headers()["x-robots-tag"] ?? ""));
  const preview = await outsider.p.locator("main").textContent();
  const links = await outsider.p.locator("main a").evaluateAll((all) => all.map((a) => a.getAttribute("href")));
  check("partage : aucun lien vers le document", !links.some((href) => href?.startsWith("/d/")));
  check("partage : pas de contenu ni d'auteur", preview.length < 500, preview);
  await outsider.p.screenshot({ path: "/shots/habitudes-apercu.png", fullPage: true });
  await outsider.p.setViewportSize({ width: 390, height: 844 });
  check("partage : pas de débordement à 390 px", await overflow(outsider.p));
  await outsider.p.getByText("Créer mon compte", { exact: true }).click();
  await outsider.p.waitForURL(/\/register\?ref=/);
  check("parrainage : code transmis à l'inscription", await outsider.p.locator("input[name=ref]").count() === 1);
  check("parrainage : l'inscription garde ses champs", await outsider.p.locator("input[name=terms]").count() === 1);
  const guess = await outsider.p.goto(`${BASE}/p/${"a".repeat(43)}`);
  check("partage : jeton inconnu", guess?.status() === 404);
  await student.getByRole("button", { name: "Désactiver ce lien" }).click();
  await student.getByText("Lien désactivé").waitFor();
  check("partage : lien révoqué", (await outsider.p.goto(shareUrl))?.status() === 404);

  // Parrainage : un nombre, jamais de nom
  await student.goto(`${BASE}/amis`);
  await student.getByRole("button", { name: "Inviter sur Campuss" }).click();
  check("parrainage : lien personnel", await student.getByRole("textbox", { name: "Lien" }).isVisible());

  // Groupes : création, puis invisible pour les autres
  await student.goto(`${BASE}/reviser/ensemble`);
  await student.getByRole("button", { name: "Nouveau groupe" }).click();
  await student.getByLabel("Nom", { exact: true }).fill("Groupe e2e");
  await student.getByRole("button", { name: /^Créer le groupe/ }).click();
  await student.waitForURL(/\/groupes\/[0-9a-f-]{36}$/);
  const groupUrl = student.url();
  await student.getByRole("button", { name: "25 min" }).click();
  await student.getByRole("timer").waitFor();
  check("groupe : minuteur partagé", /^(25:00|24:\d\d)$/.test((await student.getByRole("timer").textContent()).trim()));
  await student.screenshot({ path: "/shots/habitudes-groupe.png", fullPage: true });
  check("groupe : invisible pour un non-membre", (await admin.goto(groupUrl))?.status() === 404);
  await student.getByRole("button", { name: "Arrêter" }).click();
  await student.getByRole("button", { name: "25 min" }).waitFor();
  await student.getByLabel("Date et heure").fill(`${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)}T18:30`);
  await student.getByRole("button", { name: "Ajouter le rendez-vous" }).click();
  await student.getByText("Rendez-vous ajouté").waitFor();
  await student.goto(`${BASE}/calendrier`);
  check("groupe : rendez-vous au calendrier du membre", await student.getByRole("region", { name: "Rendez-vous de groupe" }).getByText("Groupe e2e").isVisible());
  await admin.goto(`${BASE}/calendrier`);
  check("groupe : absent du calendrier des autres", !(await admin.getByText("Groupe e2e").count()));
  await member.goto(`${BASE}/calendrier`);
  check("groupe : absent pour un étudiant de la licence", !(await member.getByText("Groupe e2e").count()));
  check("groupe : calendrier sans débordement", await overflow(member));
}
