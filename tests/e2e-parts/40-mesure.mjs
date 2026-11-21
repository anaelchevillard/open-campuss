// Tableau de bord d'administration et compteurs mis en cache de la barre latérale.
export async function run({ admin, member, check, BASE }) {
  const res = await admin.goto(`${BASE}/admin/statistiques`);
  check("mesure : page des statistiques ouverte", res?.status() === 200);
  const section = admin.getByRole("region", { name: "Indicateurs" });
  const labels = ["Couverture de la L1", "Activation", "Actifs par semaine", "Retour à 7 jours", "Retour à 30 jours", "Contributeurs", "Délai de validation", "Recours aux fiches"];
  for (const label of labels) check(`mesure : indicateur ${label}`, await section.getByRole("heading", { name: label, exact: true }).isVisible());
  const text = (await section.textContent())?.replace(/\u00a0/g, " ") ?? "";
  check("mesure : objectifs repères", ["Objectif 80 %", "Objectif 50 %", "Objectif 10 %", "Objectif moins de 24 h", "Objectif à établir"].every((t) => text.includes(t)), text.slice(0, 400));
  check("mesure : compte brut quand il y a peu de monde", /\d+ sur \d+/.test(text), text.slice(0, 400));
  check("mesure : aucun nom ni adresse dans les indicateurs", !/@/.test(text));
  // Graphiques avec infobulles, période réglable comparée à la précédente, vues reliées
  check("mesure : courbes de la vue d'ensemble", (await admin.locator("[data-slot=chart]").count()) >= 2);
  await admin.locator("[data-slot=chart] .recharts-surface").first().hover();
  check("mesure : infobulle au survol d'une courbe", /\d/.test((await admin.locator(".recharts-tooltip-wrapper").first().textContent()) ?? ""));
  // Sur grand écran, la barre latérale suffit
  check("admin : pas de barre de sections sur grand écran", !(await admin.getByRole("navigation", { name: "Sections" }).isVisible()));
  await admin.getByRole("group", { name: "Période" }).getByRole("link", { name: "90 jours" }).click();
  await admin.waitForURL(/jours=90/);
  check("mesure : période réglable, comparée à la précédente", /comparé au/.test((await admin.locator("main").textContent()) ?? ""));
  await admin.getByRole("link", { name: /Inscriptions/ }).first().click();
  await admin.waitForURL(/vue=retention/);
  check("mesure : un chiffre mène à son détail, période gardée", admin.url().includes("jours=90"));
  check("mesure : entonnoir et rétention par cohorte", await admin.getByRole("region", { name: "Entonnoir des inscrits" }).isVisible() && await admin.getByRole("region", { name: "Rétention par cohorte" }).isVisible());
  check("mesure : cohortes à J+30", await admin.getByRole("columnheader", { name: "J+30" }).isVisible());
  for (const vue of ["audience", "contenus", "revision", "contribution"]) {
    const page = await admin.goto(`${BASE}/admin/statistiques?vue=${vue}&jours=365&annee=1`);
    check(`mesure : vue ${vue} ouverte avec filtres`, page?.status() === 200);
  }
  // Événements produits et rétention par les événements, dans la vue Rétention
  await admin.goto(`${BASE}/admin/statistiques?vue=retention`);
  check("mesure : activité par événement", await admin.getByRole("region", { name: "Activité par événement" }).isVisible());
  check("mesure : rétention par les événements", await admin.getByRole("region", { name: "Rétention mesurée par les événements" }).isVisible());
  await admin.goto(`${BASE}/admin/statistiques?vue=couverture`);
  check("mesure : couverture par matière", await admin.getByRole("region", { name: "CM par matière" }).isVisible());
  await admin.goto(`${BASE}/admin/statistiques`);
  await admin.screenshot({ path: "/shots/mesure-statistiques.png", fullPage: true });
  const size = admin.viewportSize();
  await admin.setViewportSize({ width: 390, height: 844 });
  for (const vue of ["", "?vue=audience", "?vue=retention", "?vue=contenus"]) {
    await admin.goto(`${BASE}/admin/statistiques${vue}`);
    check(`mesure : pas de débordement à 390 px ${vue || "(ensemble)"}`, await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  await admin.goto(`${BASE}/admin/statistiques`);
  check("admin : sections gardées au téléphone (seul chemin vers Journal, Système…)", await admin.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Journal" }).isVisible());
  check("mesure : pas de débordement à 390 px", await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await admin.screenshot({ path: "/shots/mesure-statistiques-390.png", fullPage: true });
  if (size) await admin.setViewportSize(size);

  // Le cache est par compte : deux personnes ne voient jamais les crédits ou compteurs de l'autre
  check("mesure : réservé aux administrateurs", (await member.goto(`${BASE}/admin/statistiques`))?.status() === 404);
  await admin.goto(`${BASE}/accueil`);
  await member.goto(`${BASE}/accueil`);
  const moderationLinkForMember = await member.getByRole("link", { name: /Comptes/ }).count();
  check("mesure : la barre d'un membre ne reprend pas celle de l'administrateur", moderationLinkForMember === 0);
}
