// Navigation par appareil, « Commencer avec… », redirections, lecture adaptée, corbeille, réinitialisation de la 2FA.
export async function run({ admin, student, check, BASE, importedDoc, freshStudent, openBlankDraft, waitSaved, saveSettings }) {
  const browser = admin.context().browser();
  const state = await student.context().storageState();
  const open = async (width, height, touch) => {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width, height }, hasTouch: touch, isMobile: touch && width < 768, storageState: state, reducedMotion: "reduce" });
    await c.addCookies([{ name: "campuss-consent", value: "no", url: BASE }]);
    const p = await c.newPage(); p.setDefaultTimeout(45000);
    return { c, p };
  };

  // --- téléphone et tablette : 5 cases, aucun burger, le + ouvre la feuille, le retour la ferme
  for (const [w, h] of [[390, 844], [820, 1180]]) {
    const { c, p } = await open(w, h, true);
    await p.goto("/accueil"); await p.waitForTimeout(800);
    const tabs = p.getByRole("navigation", { name: "Navigation principale" });
    check(`${w} px : barre d'onglets de 5 cases`, (await tabs.getByRole("link").count()) === 4 && (await tabs.getByRole("button", { name: "Nouveau" }).count()) === 1);
    check(`${w} px : pas de burger`, !(await p.getByRole("button", { name: /menu|Toggle Sidebar/i }).count()));
    await tabs.getByRole("button", { name: "Nouveau" }).tap();
    const sheet = p.getByRole("dialog", { name: "Commencer avec…" });
    await sheet.waitFor();
    check(`${w} px : « Commencer avec… » propose Écrire, Demander un cours, Fiche mémo`, await sheet.getByRole("link", { name: "Écrire" }).isVisible() && await sheet.getByRole("link", { name: "Demander un cours" }).isVisible() && await sheet.getByRole("link", { name: "Fiche mémo" }).isVisible());
    await p.screenshot({ path: `/shots/nav-creer-${w}.png` });
    await p.waitForTimeout(300);
    await p.goBack();
    await sheet.waitFor({ state: "hidden" });
    check(`${w} px : le retour système ferme la feuille sans quitter la page`, new URL(p.url()).pathname === "/accueil");
    await c.close();
  }

  // --- Au téléphone, le + puis « Écrire » ouvre la rédaction (et pas « Page introuvable »)
  {
    const { c, p } = await open(390, 844, true);
    await p.goto("/accueil"); await p.waitForTimeout(800);
    await p.getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Nouveau" }).tap();
    await p.getByRole("dialog", { name: "Commencer avec…" }).getByRole("link", { name: "Écrire" }).tap();
    await p.waitForURL(/\/editer\//, { timeout: 20000 }).catch(() => undefined);
    check("390 px : le + puis « Écrire » ouvre la rédaction", /\/editer\//.test(p.url()) && !(await p.getByText("Page introuvable").count()), p.url());
    for (const label of ["Demander un cours", "Fiche mémo"]) {
      await p.goto("/accueil"); await p.waitForTimeout(500);
      await p.getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name: "Nouveau" }).tap();
      await p.getByRole("dialog", { name: "Commencer avec…" }).getByRole("link", { name: label }).tap();
      await p.waitForLoadState("networkidle").catch(() => undefined);
      check(`390 px : le + puis « ${label} » mène à une vraie page`, !(await p.getByText("Page introuvable").count()), p.url());
    }
    await c.close();
  }

  // --- 1100 px : barre latérale repliée ; 1440 px : dépliée
  for (const [w, expanded] of [[1100, false], [1440, true]]) {
    const { c, p } = await open(w, 900, false);
    await c.clearCookies({ name: "sidebar_state" });
    await p.goto("/accueil"); await p.waitForTimeout(800);
    const state = await p.locator("[data-slot=sidebar]").first().getAttribute("data-state");
    check(`${w} px : barre latérale ${expanded ? "dépliée" : "repliée"}`, state === (expanded ? "expanded" : "collapsed"), String(state));
    await c.close();
  }

  // --- redirections 308
  for (const [from, to] of [["/favoris", "/matieres?favoris=1"], ["/calendrier", "/reviser/partiels"], ["/groupes", "/reviser/ensemble"], ["/classement", "/reviser/classement"], ["/account", "/parametres"], ["/dossier-connecte", "/parametres/comptes-connectes"], ["/admin/users", "/admin/personnes"], ["/admin/documents", "/admin/contenus"], ["/admin/audit", "/admin/journal"], ["/admin/signalements", "/admin/moderation"]]) {
    const r = await fetch(BASE + from, { redirect: "manual" });
    check(`redirection ${from} → ${to}`, r.status === 308 && (r.headers.get("location") ?? "").endsWith(to), `${r.status} ${r.headers.get("location")}`);
  }

  // --- lecture adaptée : Atkinson, toute l'interface, très aéré (réglés dans Paramètres) ; aucun bouton ne déborde
  {
    const p = await freshStudent(`nav-dys-${Date.now()}@etu.exemple.fr`);
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto("/parametres/affichage");
    await p.getByRole("radio", { name: /Atkinson/ }).first().click();
    await p.getByRole("button", { name: "Très aéré" }).first().click();
    await p.getByRole("switch", { name: /Toute l’interface/ }).first().click();
    await saveSettings(p);
    const font = () => p.evaluate(() => getComputedStyle(document.body).fontFamily);
    check("lecture adaptée : l'interface passe en Atkinson", (await font()).includes("Atkinson"), await font());
    for (const path of ["/", "/matieres", "/moi", importedDoc && `/d/${importedDoc}`, "/parametres"].filter(Boolean)) {
      await p.goto(path); await p.waitForTimeout(800);
      const over = await p.evaluate(() => [...document.querySelectorAll("[data-slot=button], [data-sidebar=menu-button]")].filter((b) => b.offsetParent && b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent?.trim()));
      check(`lecture adaptée ${path} : aucun bouton qui déborde`, over.length === 0, over.join(", "));
    }
    check("lecture adaptée : retenue au rechargement", (await font()).includes("Atkinson"));
    await p.screenshot({ path: "/shots/nav-dys.png" });
  }

  // --- toast « Annuler » sur l'étoile d'une carte
  {
    const { c, p } = await open(1440, 900, false);
    await p.goto("/matieres"); await p.goto("/accueil"); await p.waitForTimeout(800);
    const star = p.getByRole("button", { name: /aux favoris|des favoris/ }).first();
    if (await star.count()) {
      const before = await star.getAttribute("aria-pressed");
      await star.click();
      await p.getByRole("button", { name: "Annuler" }).click();
      await p.waitForTimeout(800);
      check("favori : « Annuler » rétablit l'état", (await star.getAttribute("aria-pressed")) === before);
    } else check("favori : une carte avec étoile sur l'accueil", false);
    await c.close();
  }

  // --- corbeille : le document quitte les listes, répond 404 à un étudiant, reste ouvrable par l'administration
  {
    await openBlankDraft(admin);
    const id = new URL(admin.url()).pathname.split("/").pop();
    const title = `Corbeille nav ${Date.now()}`;
    await admin.fill("textarea[name=title]", title); await waitSaved(admin);
    await admin.goto(`/admin/documents/${id}`);
    const del = admin.getByRole("button", { name: "Supprimer le document" });
    await del.click(); await del.click(); // confirmation armée : deuxième clic
    await admin.waitForURL(/\/admin\/contenus/, { timeout: 15000 }).catch(() => undefined);
    check("corbeille : le document quitte la liste des contenus", /\/admin\/contenus/.test(admin.url()) && !(await admin.getByText(title).count()));
    check("corbeille : 404 pour un étudiant", (await student.request.get(`/d/${id}`)).status() === 404);
    check("corbeille : l'administration l'ouvre encore", (await admin.goto(`/d/${id}`)).status() === 200);
  }

  // --- réinitialisation de la 2FA : sessions coupées, plus de second facteur
  {
    const { Secret, TOTP } = await import("otpauth");
    const p = await freshStudent(`nav-2fa-${Date.now()}@etu.exemple.fr`);
    await p.goto("/parametres/compte");
    await p.getByRole("button", { name: "Configurer" }).click();
    const secret = await p.locator("code").waitFor().then(() => p.locator("code").textContent());
    await p.fill("input[name=code]", new TOTP({ secret: Secret.fromBase32(secret.replace(/\s/g, "")) }).generate());
    await p.getByRole("button", { name: "Activer" }).click();
    await p.getByText("Active : un code est demandé").waitFor();
    const id = (await p.goto("/moi").then(() => p.locator('main a[href^="/u/"]').first().getAttribute("href"))).split("/").pop();
    // Fiche, onglet Accès et sécurité, « Réinitialiser la 2FA » avec un motif
    await admin.goto(`/admin/personnes/${id}?vue=acces`);
    await admin.getByRole("button", { name: "Réinitialiser la 2FA" }).click();
    const why = admin.getByRole("dialog", { name: "Réinitialiser le second facteur" });
    await why.getByLabel("Motif").fill("Téléphone perdu");
    await why.getByRole("button", { name: "Réinitialiser" }).click();
    await admin.getByRole("button", { name: "Réinitialiser la 2FA" }).waitFor({ state: "detached", timeout: 15000 }).catch(() => undefined);
    check("2FA réinitialisée : plus de bouton « Réinitialiser la 2FA »", !(await admin.getByRole("button", { name: "Réinitialiser la 2FA" }).count()));
    await p.goto("/parametres");
    check("2FA réinitialisée : la personne est déconnectée de ses sessions", /login/.test(p.url()), p.url());
  }
}
