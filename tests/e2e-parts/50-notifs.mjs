// Cloche, centre, réglages, désinscription refusée pour un faux jeton, proposition d'installation.
// Le push exige un vrai service de push : non joué ici. La tâche quotidienne attend 17 h : non jouée non plus.
export async function run({ admin, member, student, check, BASE, pageFetch, saveSettings }) {
  // Le cours de ce membre a été publié plus tôt dans le parcours : la nouvelle l'attend dans le centre
  await member.goto(`${BASE}/accueil`);
  const bell = member.getByRole("button", { name: /^Notifications/ });
  check("notifs : cloche dans la barre du haut", await bell.isVisible());
  await bell.click();
  const menu = member.getByRole("dialog").filter({ has: member.getByRole("link", { name: "Tout voir" }) });
  await menu.getByRole("link", { name: "Tout voir" }).waitFor();
  const published = menu.getByText("Ton cours est publié").first();
  await published.waitFor({ timeout: 5000 }).catch(() => {});
  await member.screenshot({ path: "/shots/notifs-menu.png" });
  check("notifs : la publication est dans le centre", await published.isVisible());
  if (await published.isVisible()) {
    await published.click();
    await member.waitForURL(/\/d\//);
    check("notifs : un clic ouvre le lien", /\/d\//.test(member.url()));
  }

  const res = await student.goto(`${BASE}/notifications`);
  check("notifs : historique ouvert", res?.status() === 200);
  await student.screenshot({ path: "/shots/notifs-page.png", fullPage: true });
  const size = student.viewportSize();
  await student.setViewportSize({ width: 390, height: 844 });
  await student.goto(`${BASE}/notifications`);
  check("notifs : pas de débordement à 390 px", await student.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await student.getByRole("button", { name: /^Notifications/ }).click();
  await student.screenshot({ path: "/shots/notifs-menu-390.png" });
  await student.keyboard.press("Escape");
  if (size) await student.setViewportSize(size);

  check("notifs : un identifiant inconnu ne fait pas d'erreur", (await pageFetch(student, "/notifications/ouvrir/pas-un-identifiant", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })) === 200);

  // Réglages, sans jamais demander la permission à l'arrivée
  await student.goto(`${BASE}/parametres/notifications`);
  check("notifs : réglage du mail hebdomadaire", await student.getByRole("switch", { name: /Résumé de la semaine/ }).isVisible());
  const weekly = student.getByRole("switch", { name: /Résumé de la semaine/ });
  await weekly.click();
  await saveSettings(student); // les réglages partent avec « Enregistrer »
  await student.reload();
  check("notifs : le réglage s'enregistre", (await student.getByRole("switch", { name: /Résumé de la semaine/ }).getAttribute("aria-checked")) === "false");
  await student.getByRole("switch", { name: /Résumé de la semaine/ }).click();
  await saveSettings(student);
  await student.screenshot({ path: "/shots/notifs-account.png", fullPage: true });
  check("notifs : aucune permission demandée à l'arrivée", await student.evaluate(() => Notification.permission !== "granted"));

  const anonymous = await fetch(`${BASE}/desabonnement/faux.jeton`, { redirect: "manual" });
  check("notifs : faux jeton de désinscription refusé", anonymous.status === 404);

  check("notifs : inscription au push fermée sans clés ou sans session", [403, 404].includes((await fetch(`${BASE}/api/account/push`, { method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(BASE).origin }, body: "{}" })).status));

  // Mesure agrégée
  await admin.goto(`${BASE}/admin/statistiques?vue=couverture`);
  const section = admin.getByRole("region", { name: "Ce qui fait revenir" });
  check("notifs : mesure dans les statistiques", await section.isVisible());
  check("notifs : mesure sans nom ni adresse", !/@/.test((await section.textContent()) ?? ""));

  // Proposition d'installation, sur un faux iPhone, à la troisième visite seulement
  const page = await member.context().newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari" });
  });
  await page.goto(`${BASE}/accueil`);
  await page.evaluate(() => { localStorage.removeItem("campuss-install-shown"); localStorage.setItem("campuss-visits", "1"); sessionStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(3500);
  const hint = page.getByRole("complementary", { name: /écran d’accueil/ });
  check("notifs : rien à la deuxième visite", (await hint.count()) === 0);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await hint.waitFor({ timeout: 8000 });
  check("notifs : mode d'emploi iPhone", /Safari.*Partager/.test((await hint.textContent()) ?? ""));
  await page.screenshot({ path: "/shots/notifs-install.png" });
  await hint.getByRole("button", { name: "Fermer" }).click();
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.waitForTimeout(3500);
  check("notifs : une seule fois", (await hint.count()) === 0);
  await page.close();
}
