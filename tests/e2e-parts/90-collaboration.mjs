// Demandes de cours, publication toujours relue, relecture après coup des anciens cours, notes à plusieurs, dossier connecté invisible sans clés.
export async function run({ admin, member, student, check, BASE, pageFetch }) {
  // Une matière de la licence commune : le lien de la barre latérale du membre
  await member.goto(`${BASE}/accueil`);
  const link = member.getByRole("link", { name: "Mathématiques" }).first();
  const subjectPath = await link.getAttribute("href");
  await member.goto(`${BASE}${subjectPath}`);

  const text = `Je cherche le chapitre ${100 + Math.floor(Math.random() * 800)} de HPE`;
  const zone = member.getByRole("region", { name: "Demandes de cours" });
  check("demandes : tableau sur la page de la matière", await zone.isVisible());
  await zone.getByRole("textbox", { name: "Ta demande" }).fill(text);
  await zone.getByRole("button", { name: "Demander" }).click();
  await zone.getByText(text).waitFor();
  check("demandes : ajout sur place, sans changer de page", member.url().includes(subjectPath));

  await student.goto(`${BASE}${subjectPath}`);
  const studentZone = student.getByRole("region", { name: "Demandes de cours" });
  const row = studentZone.getByRole("listitem").filter({ hasText: text });
  await row.waitFor();
  const vote = row.getByRole("button", { name: /^Moi aussi/ });
  check("demandes : la voix de l'auteur compte", (await vote.textContent()).includes("1"));
  await vote.click();
  await row.getByRole("button", { name: /^Moi aussi, 2/ }).waitFor();
  // L'affichage précède la réponse du serveur : un rechargement immédiat couperait l'envoi
  await student.waitForTimeout(1500);
  await student.reload();
  check("demandes : le vote reste après rechargement", await studentZone.getByRole("listitem").filter({ hasText: text }).getByRole("button", { name: /^Moi aussi, 2/ }).isVisible());

  await student.goto(`${BASE}/demandes`);
  check("demandes : page d'ensemble", await student.getByText(text).first().isVisible());
  await student.goto(`${BASE}${subjectPath}`);
  await studentZone.getByRole("listitem").filter({ hasText: text }).getByRole("button", { name: "J’ai ce cours" }).click();
  await student.waitForURL(/\/editer\//);
  await student.locator(".ProseMirror").waitFor({ timeout: 30000 });
  check("demandes : brouillon rattaché et rangé dans la matière", (await student.getByText("répond à la demande").count()) > 0 && (await student.locator("select[name=subject]").inputValue()) === subjectPath.split("/").pop());
  if (!(await student.locator("input[name=chapter]").isVisible())) await student.getByRole("button", { name: /^Détails/ }).click(); // le chapitre est dans « Détails »
  check("demandes : chapitre repris de la demande", /^\d+$/.test(await student.locator("input[name=chapter]").inputValue()));
  // Un étudiant n'a jamais de bouton « Publier », quel que soit son nombre de cours validés
  check("publication : l'étudiant envoie en relecture, sans publication directe", await student.getByRole("button", { name: "Envoyer pour validation", exact: true }).isVisible() && !(await student.getByRole("button", { name: "Publier", exact: true }).count()));
  await student.screenshot({ path: "/shots/collaboration-reponse.png", fullPage: true });

  // Relecture après coup : la section reste pour les cours mis en ligne avant la relecture obligatoire
  await admin.goto(`${BASE}/moderation?onglet=apres`);
  check("après coup : file des anciens cours jamais relus", await admin.getByRole("link", { name: /Après coup/ }).isVisible());
  await admin.screenshot({ path: "/shots/collaboration-moderation.png", fullPage: true });

  // Notes à plusieurs, à deux navigateurs : l'étudiant rejoint si son compte est dans le groupe, sinon il est refusé
  await member.goto(`${BASE}${subjectPath}`);
  await member.getByRole("button", { name: "Plus d’actions" }).click();
  await member.getByRole("menuitem", { name: "Démarrer les notes de ce CM" }).click();
  await member.waitForURL(/\/editer\//);
  await member.locator(".ProseMirror").waitFor({ timeout: 30000 });
  const notesId = new URL(member.url()).pathname.split("/").pop();
  await member.getByTestId("notes-presence").filter({ hasNotText: "Connexion" }).waitFor({ timeout: 20000 });
  check("notes : éditeur connecté, bouton de fin", await member.getByRole("button", { name: "Terminer et publier" }).isVisible());
  await member.locator(".ProseMirror").click();
  await member.keyboard.type("Premiere phrase du CM");
  await member.waitForTimeout(7000);
  await member.reload();
  await member.locator(".ProseMirror").getByText("Premiere phrase du CM").waitFor({ timeout: 30000 });
  check("notes : le texte survit à un rechargement, sans doublon", (await member.locator(".ProseMirror").getByText("Premiere phrase du CM").count()) === 1);
  await member.screenshot({ path: "/shots/collaboration-notes.png", fullPage: true });

  // L'étudiant rejoint un groupe de délégué : l'administrateur en lance un dans la même matière
  await admin.goto(`${BASE}${subjectPath}`);
  await admin.getByRole("button", { name: "Plus d’actions" }).click();
  await admin.getByRole("menuitem", { name: "Démarrer les notes de ce CM" }).click();
  await admin.waitForURL(/\/editer\//);
  await admin.locator(".ProseMirror").waitFor({ timeout: 30000 });
  await student.goto(`${BASE}${subjectPath}`);
  const adminNotes = new URL(admin.url()).pathname.split("/").pop();
  await student.locator(`form:has(input[name=id][value="${adminNotes}"])`).getByRole("button", { name: "Rejoindre" }).click();
  await student.waitForURL(/\/editer\//);
  await student.locator(".ProseMirror").waitFor({ timeout: 30000 });
  await admin.locator(".ProseMirror").click();
  await admin.keyboard.type("Ecrit par le delegue");
  await student.locator(".ProseMirror").getByText("Ecrit par le delegue").waitFor({ timeout: 20000 });
  check("notes : le texte arrive chez l'autre en temps réel", true);
  await student.getByTestId("notes-presence").filter({ hasText: "Avec" }).waitFor({ timeout: 20000 });
  check("notes : présence sous le nom du serveur", true);
  await admin.getByRole("button", { name: "Ajouter une partie" }).click();
  await admin.getByRole("textbox", { name: "Partie 1" }).fill("Introduction");
  await admin.getByRole("textbox", { name: "Partie 1" }).blur();
  // L'étudiant est délégué sur le banc : il voit le champ, pas le texte
  await student.getByRole("region", { name: "Tour de rôle" }).filter({ has: student.locator('input[value="Introduction"]') }).or(student.getByRole("region", { name: "Tour de rôle" }).filter({ hasText: "Introduction" })).first().waitFor({ timeout: 20000 });
  check("notes : tour de rôle reçu par le groupe", true);

  // Dossier connecté : le banc n'a aucune clé OAuth
  // L'ancienne adresse mène à « Comptes connectés », qui existe toujours (clés d'accès, 2FA) ; sans clés, aucun service d'import
  check("dossier connecté : invisible sans clés", (await member.goto(`${BASE}/dossier-connecte`)).status() === 200 && new URL(member.url()).pathname === "/parametres/comptes-connectes" && !(await member.getByText(/Google Drive|Notion/).count()));
  check("dossier connecté : routes fermées sans clés", (await pageFetch(member, "/api/connected/google/start", { redirect: "manual" })) === 404);
  await member.setViewportSize({ width: 390, height: 844 });
  await member.goto(`${BASE}/demandes`);
  check("demandes : pas de débordement à 390 px", await member.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await member.setViewportSize({ width: 1280, height: 800 });
}
