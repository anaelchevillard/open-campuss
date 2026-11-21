// Profil modifié sur place et gardé à « Enregistrer », personnalisation verrouillée mais essayable, profil et badges.
export async function run({ member, student, check, BASE, freshStudent, saveSettings }) {
  const browser = member.context().browser();

  // --- téléphone : la liste des paramètres est dans Moi, chaque section une sous-page avec retour
  {
    const p = await freshStudent(`profil-tel-${Date.now()}@etu.exemple.fr`);
    const state = await p.context().storageState();
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: state, reducedMotion: "reduce" });
    const t = await c.newPage(); t.setDefaultTimeout(45000);
    await t.goto("/moi"); await t.waitForTimeout(600);
    // Profil et Personnalisation fusionnés, on personnalise sur son vrai profil
    check("téléphone : Moi porte la liste des paramètres", await t.getByRole("link", { name: /Profil et apparence/ }).isVisible());
    await t.getByRole("link", { name: /Profil et apparence/ }).tap();
    await t.waitForURL(/\/u\/[^/?]+\?modifier=1/);
    check("téléphone : la flèche retour porte le nom « Paramètres »", await t.getByRole("button", { name: "Retour : Paramètres" }).isVisible());
    await t.goBack();
    await t.waitForURL(/\/moi$/);
    check("téléphone : le retour système revient à Moi", true);
    await t.getByRole("searchbox", { name: "Rechercher un réglage" }).fill("mot de p");
    check("recherche dans les réglages", await t.getByRole("link", { name: /Mot de passe/ }).isVisible());
    await c.close();

    // --- ordinateur : /parametres est l'accueil des réglages ; « Profil et apparence » mène au profil modifiable
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto("/parametres");
    // Une seule navigation sur ordinateur (la colonne), au centre une vue d'ensemble, pas la liste une deuxième fois
    check("ordinateur : Paramètres sans liste en double", new URL(p.url()).pathname === "/parametres"
      && await p.getByRole("navigation", { name: "Sections des paramètres" }).isVisible()
      && !(await p.getByRole("main").getByRole("link", { name: /Profil et apparence.*Photo, bio/ }).isVisible())
      && await p.getByRole("link", { name: "Modifier mon profil" }).isVisible());
    await p.goto("/parametres/profil");
    await p.waitForURL(/\/u\/[^/?]+\?modifier=1/);
    check("ordinateur : fil d'Ariane « Paramètres » sur la personnalisation", await p.getByRole("navigation", { name: "Fil d’Ariane" }).getByRole("link", { name: "Paramètres" }).isVisible());
    const editUrl = p.url();
    check("ordinateur : la personnalisation ne déborde pas", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.goto("/parametres/compte");
    check("ordinateur : navigation à gauche dans les paramètres", await p.getByRole("navigation", { name: "Sections des paramètres" }).isVisible());

    // --- nom : tiré de l'adresse, non modifiable ; pronoms et statut gardés à « Enregistrer »
    await p.goto(editUrl);
    await p.locator("#pronouns").waitFor();
    check("profil : le nom n'est pas modifiable", !(await p.locator("#name").count()));
    check("paramètres : pas de bouton « Enregistrer » sans modification", !(await p.getByRole("region", { name: "Enregistrer les modifications" }).count()));
    await p.fill("#pronouns", "elle");
    await p.getByRole("textbox", { name: "Texte du statut" }).fill("En révision de droit civil");
    check("paramètres : « Enregistrer » apparaît après une modification", await p.getByRole("region", { name: "Enregistrer les modifications" }).isVisible());
    await saveSettings(p);
    await p.reload();
    await p.locator("#pronouns").waitFor();
    check("profil : pronoms et statut conservés au rechargement", (await p.locator("#pronouns").inputValue()) === "elle" && (await p.getByRole("textbox", { name: "Texte du statut" }).inputValue()) === "En révision de droit civil");

    // --- personnalisation à 0 crédit : options ouvertes dès le départ, les autres verrouillées mais essayables sur le profil, non enregistrables
    check("0 crédit : des options déjà ouvertes", await p.getByRole("radio", { name: /Nunito/ }).count() > 0 && !(await p.getByRole("radio", { name: /Nunito/ }).first().getAttribute("title")));
    check("0 crédit : conditions affichées", (await p.getByRole("radio", { name: /Caveat/ }).first().getAttribute("title") ?? "").includes("·"));
    await p.getByRole("radio", { name: /Caveat/ }).first().click();
    // Plus de phrase de déblocage ; une mention « Essai » et « Revenir à mon style », la condition sous l'option
    check("essai sur le profil", await p.getByRole("status").filter({ hasText: "Essai" }).getByRole("button", { name: "Revenir à mon style" }).isVisible()
      && await p.getByRole("radio", { name: /Caveat/ }).first().getByText(/Badge « Scribe III »/).isVisible());
    check("le profil montre la police essayée", (await p.locator("main .user-name[data-font=caveat]").count()) > 0);
    await p.getByRole("region", { name: "Enregistrer les modifications" }).getByRole("button", { name: "Enregistrer", exact: true }).click();
    check("un objet verrouillé ne s'enregistre pas", await p.getByText(/Pas encore débloqué/).first().waitFor({ timeout: 10000 }).then(() => true, () => false));
    await p.getByRole("region", { name: "Enregistrer les modifications" }).getByRole("button", { name: "Annuler" }).click();
    await p.reload();
    check("un objet verrouillé n'est pas enregistré", !(await p.locator("main .user-name[data-font=caveat]").count()));
    await p.screenshot({ path: "/shots/profil-personnalisation.png", fullPage: true });

    // --- affichage : un réglage changé puis enregistré est conservé
    await p.goto("/parametres/affichage");
    await p.getByRole("switch", { name: "Mode compact" }).click();
    await saveSettings(p);
    await p.reload();
    check("affichage : mode compact conservé", await p.evaluate(() => document.documentElement.classList.contains("compact")));
    await p.getByRole("switch", { name: "Mode compact" }).click();
    await saveSettings(p);

    // --- confidentialité : partage de la révision coupé par défaut
    await p.goto("/parametres/confidentialite");
    check("révision partagée : coupée par défaut", (await p.getByRole("switch", { name: "Partager ma révision avec mes amis" }).getAttribute("aria-checked")) !== "true");

    // --- son profil : badges verrouillés avec progression, statut et pronoms visibles
    const id = (await p.goto("/moi").then(() => p.locator('main a[href^="/u/"]').first().getAttribute("href"))).split("/").pop();
    await p.goto(`/u/${id}`);
    check("profil : statut affiché", await p.getByText("En révision de droit civil").isVisible());
    check("profil : badges verrouillés avec progression", (await p.locator("main").getByRole("progressbar").count()) > 0);
    await p.screenshot({ path: "/shots/profil-soi.png", fullPage: true });
  }

  // --- le profil d'un autre : seulement les badges obtenus, aucun chiffre d'impact sous 5
  {
    const id = (await member.goto("/moi").then(() => member.locator('main a[href^="/u/"]').first().getAttribute("href"))).split("/").pop();
    const r = await student.goto(`/u/${id}`);
    if (r?.status() === 200) {
      check("profil d'un autre : aucun badge verrouillé", !(await student.locator("main").getByRole("progressbar").count()));
      check("profil d'un autre : « N sur M » badges", await student.getByText(/\d+ sur \d+/).first().isVisible());
      const impact = await student.getByRole("heading", { name: "Impact" }).count()
        ? await student.locator("section", { has: student.getByRole("heading", { name: "Impact" }) }).locator("span.text-2xl").allTextContents() : [];
      check("impact : aucun chiffre sous 5", impact.every((n) => Number(n.replace(/\s/g, "")) >= 5));
      await student.screenshot({ path: "/shots/profil-autre.png", fullPage: true });
    }
  }
  // --- Un titre très long dans la vitrine ne fait plus défiler la page de côté (360, 390, 1440 px)
  {
    const state = await member.context().storageState();
    for (const width of [360, 390, 1440]) {
      const c = await browser.newContext({ baseURL: BASE, viewport: { width, height: 900 }, storageState: state, reducedMotion: "reduce" });
      const p = await c.newPage(); p.setDefaultTimeout(45000);
      await p.goto("/parametres/profil"); await p.waitForURL(/\/u\/[^/?]+\?modifier=1/);
      await p.locator("#vitrine").scrollIntoViewIfNeeded();
      // Le titre le plus long possible, sans espace : la disposition doit le couper, pas s'élargir
      const injected = await p.evaluate(() => {
        const long = "Introduction-au-droit-constitutionnel-comparé-et-à-l’histoire-des-institutions-".repeat(4);
        const spans = [...document.querySelectorAll("#vitrine span.line-clamp-2")];
        spans.forEach((el) => { el.textContent = long; });
        return spans.length;
      });
      check(`vitrine à ${width} px : aucun défilement horizontal${injected ? "" : " (vitrine verrouillée)"}`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 360 && injected) await p.locator("#vitrine").screenshot({ path: "/shots/vitrine-360.png" });
      // Les cadres animés, avec leur aperçu réel, immobiles en mouvement réduit
      if (width === 1440) {
        const frames = ["Comète", "Orbite", "Aurore", "Pulsation", "Éclats", "Ligne de vol"];
        check("cadres animés proposés avec leur aperçu", (await Promise.all(frames.map((name) => p.getByRole("radio", { name: new RegExp(name) }).count()))).every((n) => n > 0));
        check("cadres animés : immobiles en mouvement réduit", await p.evaluate(() => [...document.querySelectorAll("#cadre .avatar-frame[data-frame]")].every((el) => getComputedStyle(el, "::before").animationName === "none" && getComputedStyle(el, "::after").animationName === "none")));
      }
      await c.close();
    }
  }
}
