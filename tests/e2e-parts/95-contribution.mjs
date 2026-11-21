// Mes documents (statuts, adresse, corbeille avec Annuler, fil, demande de retrait), file « À valider » au clavier.
export async function run({ admin, member, check, BASE, freshStudent, openBlankDraft, waitSaved, send }) {
  const title = `Renvoi au clavier ${Date.now()}`;
  const author = await freshStudent(`contribution_${Date.now()}@etu.exemple.fr`);
  await openBlankDraft(author);
  await author.locator("textarea[name=title]").fill(title);
  await author.locator("select[name=subject]").selectOption({ index: 1 });
  // L'origine du contenu est dans le menu « Détails » de l'éditeur
  await author.getByRole("button", { name: /^Détails/ }).click();
  await author.locator("select[name=rights]").selectOption({ index: 1 });
  await author.keyboard.press("Escape");
  await author.locator(".ProseMirror").click();
  await author.keyboard.type("Un texte trop court pour être publié tel quel.");
  await waitSaved(author);
  await send(author);
  await author.getByText(/attend/).first().waitFor();

  // --- À valider : J, R, 2, un mot, Entrée, puis Z, puis de nouveau
  await admin.goto(`${BASE}/moderation`);
  const list = admin.getByRole("navigation", { name: "À valider" });
  await list.getByRole("button", { name: new RegExp(title) }).click();
  check("file : aucune case à cocher permanente", (await admin.locator("input[type=checkbox]").count()) === 0);
  check("file : aperçu centré", await admin.getByRole("region", { name: "Aperçu" }).or(admin.locator("section[aria-label=Aperçu]")).first().isVisible());
  await admin.keyboard.press("r");
  await admin.keyboard.press("2");
  check("file : 2 choisit le motif", await admin.getByRole("radio", { name: /Incomplet ou trop court/ }).getAttribute("aria-checked") === "true");
  await admin.keyboard.type("Ajoute le chapitre 2");
  await admin.keyboard.press("Enter");
  await admin.getByText(new RegExp(`^Renvoyé · ${title}`)).waitFor();
  check("file : renvoi au clavier, l'élément quitte la file", (await list.getByRole("button", { name: new RegExp(title) }).count()) === 0);
  await admin.keyboard.press("z");
  await list.getByRole("button", { name: new RegExp(title) }).waitFor();
  check("file : Z annule la dernière décision", true);
  await admin.screenshot({ path: "/shots/contribution-moderation.png", fullPage: true });
  await list.getByRole("button", { name: new RegExp(title) }).click();
  await admin.getByRole("button", { name: /^Renvoyer/ }).click();
  await admin.getByRole("radio", { name: /Incomplet ou trop court/ }).click();
  await admin.getByLabel("Un mot pour l’auteur").fill("Ajoute le chapitre 2");
  await admin.getByLabel("Un mot pour l’auteur").press("Enter");
  await admin.getByText(new RegExp(`^Renvoyé · ${title}`)).waitFor();
  await admin.waitForTimeout(9000);

  // --- Mes documents : « À corriger » en tête, motif et relecteur
  await author.goto(`${BASE}/contribuer`);
  const alert = author.getByRole("alert").filter({ hasText: title });
  check("à corriger : en tête, avec le motif", await alert.isVisible() && (await alert.textContent()).includes("Incomplet ou trop court"));
  await author.screenshot({ path: "/shots/contribution-a-corriger.png", fullPage: true });

  // --- fil : l'auteur répond, le relecteur est prévenu
  await author.getByRole("button", { name: `Actions pour ${title}` }).first().click();
  await author.getByRole("menuitem", { name: "Statistiques et fil" }).click();
  await author.getByLabel("Message").fill("C’est corrigé, merci");
  await author.getByRole("button", { name: "Envoyer" }).click();
  await author.getByText("C’est corrigé, merci").waitFor();
  await admin.goto(`${BASE}/notifications`);
  // Le message s'affiche chez l'auteur avant la fin de l'action : si la notification n'est pas encore là, on recharge une fois
  const replied = admin.getByText(/t’a répondu/).first();
  if (!(await replied.isVisible())) { await admin.waitForTimeout(1500); await admin.reload(); }
  check("fil : le relecteur est prévenu de la réponse", await replied.waitFor({ timeout: 10000 }).then(() => true, () => false));
  await author.keyboard.press("Escape");

  // --- onglets, tri et vue dans l'adresse ; ils survivent au retour arrière
  await member.goto(`${BASE}/contribuer`);
  // Un clic avant l'hydratation est perdu : on reclique tant que l'adresse n'a pas changé
  for (let i = 0; i < 5 && !/onglet=publies/.test(member.url()); i++) { await member.getByRole("button", { name: /^Publiés/ }).click(); await member.waitForTimeout(400); }
  await member.getByRole("radio", { name: "Liste" }).or(member.getByRole("button", { name: "Liste" })).first().click();
  await member.waitForTimeout(300);
  check("mes documents : onglet et vue dans l'adresse", /onglet=publies/.test(member.url()) && /vue=liste/.test(member.url()), member.url());
  const first = member.locator("table a[href^='/d/']").first();
  if (await first.count()) {
    await first.click();
    await member.waitForURL(/\/d\//);
    await member.goBack();
    await member.waitForURL(/contribuer/);
    check("mes documents : l'état survit au retour arrière", /onglet=publies/.test(member.url()) && (await member.locator("table").count()) > 0);
    // Un cours publié ne se retire que sur demande justifiée à l'administration
    await member.getByRole("button", { name: /^Actions pour / }).first().click();
    await member.getByRole("menu").waitFor();
    check("retrait : « Demander le retrait » à la place de la corbeille pour un cours publié", await member.getByRole("menuitem", { name: "Demander le retrait" }).isVisible()
      && !(await member.getByRole("menuitem", { name: "Mettre à la corbeille" }).count()) && !(await member.getByRole("menuitem", { name: "Retirer de la publication" }).count()));
    await member.getByRole("menuitem", { name: "Demander le retrait" }).click();
    const ask = member.getByRole("dialog");
    await ask.getByLabel("Pourquoi le retirer ?").fill("court");
    // Justification trop courte : le bouton reste marqué indisponible (aria-disabled), la fenêtre reste ouverte
    check("retrait : la justification est obligatoire", (await ask.getByRole("button", { name: "Envoyer la demande" }).getAttribute("aria-disabled")) === "true" && await ask.isVisible());
    await ask.getByLabel("Pourquoi le retirer ?").fill("Essai e2e : ce cours contient une erreur de chapitre.");
    await ask.getByRole("button", { name: "Envoyer la demande" }).click();
    await member.getByText("Demande envoyée").first().waitFor();
    await admin.goto(`${BASE}/admin/moderation?onglet=retraits`);
    check("retrait : la demande arrive dans la file de l'administration", await admin.getByText("Essai e2e : ce cours contient une erreur de chapitre.").isVisible());
    await admin.getByLabel("Mot pour l’auteur").first().fill("Le chapitre sera corrigé par une proposition.");
    await admin.getByRole("button", { name: "Refuser" }).first().click();
    await admin.getByText("Demande refusée").first().waitFor();
    await member.goto(`${BASE}/notifications`);
    check("retrait : l'auteur est prévenu du refus", await member.getByText("Ta demande de retrait est refusée").first().isVisible());
  }

  // --- corbeille : exécutée tout de suite, « Annuler » restaure
  await author.goto(`${BASE}/contribuer`);
  await author.getByRole("button", { name: `Actions pour ${title}` }).first().click();
  await author.getByRole("menuitem", { name: "Mettre à la corbeille" }).click();
  await author.getByText("Mis à la corbeille").waitFor();
  await author.getByRole("button", { name: "Annuler" }).click();
  await author.waitForTimeout(1500);
  await author.reload();
  check("corbeille : Annuler restaure le document", await author.getByRole("alert").filter({ hasText: title }).isVisible());
}
