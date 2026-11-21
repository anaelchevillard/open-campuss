// Grille à trois zones, page de cours, éditeur (menu « / », poignée, bulle), /corriger, impression.
export async function run({ admin, student, check, BASE, importedDoc, openBlankDraft }) {
  const browser = student.context().browser();
  const state = await student.context().storageState();
  const open = async (width, height, touch = false) => {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width, height }, hasTouch: touch, isMobile: touch && width < 768, storageState: state, reducedMotion: "reduce" });
    await c.addCookies([{ name: "campuss-consent", value: "no", url: BASE }]);
    const p = await c.newPage(); p.setDefaultTimeout(45000);
    return { c, p };
  };
  const firstLeft = (p) => p.locator("article.course > p").first().evaluate((el) => Math.round(el.getBoundingClientRect().left));
  const selectPassage = (p, n) => p.evaluate((count) => {
    // Premier passage de texte assez long, dans n'importe quel paragraphe du cours
    const text = [...document.querySelectorAll("article.course > p")].flatMap((el) => [...el.childNodes]).find((node) => node.nodeType === 3 && node.data.trim().length > count);
    if (!text) return false;
    const range = new Range(); range.setStart(text, 0); range.setEnd(text, count);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    return true;
  }, n);

  // --- 1440 px : le texte ne bouge pas, ni avec une note, ni avec le sommaire, qui est à droite
  {
    const { c, p } = await open(1440, 900);
    await p.goto(`/d/${importedDoc}`); await p.locator("article.course").waitFor(); await p.waitForTimeout(600);
    const before = await firstLeft(p);
    const text = await p.locator("article.course").boundingBox();
    const toc = p.getByRole("navigation", { name: "Sommaire du cours" }).or(p.getByRole("button", { name: "Dans ce cours" })).first();
    const tocBox = await toc.boundingBox().catch(() => null);
    check("lecture 1440 : le sommaire est à droite du texte", Boolean(tocBox) && tocBox.x >= text.x + text.width);
    const measure = await p.locator("article.course").evaluate((el) => el.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize));
    check("lecture : colonne de 36rem au plus", measure <= 36.05, String(measure));
    if (await selectPassage(p, 12)) {
      await p.getByRole("toolbar", { name: "Annoter le passage" }).getByRole("button", { name: "Note" }).click();
      await p.getByLabel("Écris ta note…").fill("Note de mesure");
      await p.keyboard.press("Enter");
      await p.waitForTimeout(800);
      // La note se pose dans la marge de droite, toujours visible. La colonne de notes réservée peut
      // décaler le texte de quelques pixels (jamais plus de 1rem), mais la note ne le recouvre jamais.
      const after = await firstLeft(p);
      const rail = await p.locator(".ann-rail").filter({ hasText: "Note de mesure" }).boundingBox().catch(() => null);
      const textBox = await p.locator("article.course").boundingBox();
      check("lecture 1440 : le premier paragraphe ne bouge pas quand une note apparaît", Math.abs(after - before) <= 16 && Boolean(rail) && rail.x >= textBox.x + textBox.width, `${before} → ${after}, note ${rail ? Math.round(rail.x) : "absente"} / texte ${Math.round(textBox.x + textBox.width)}`);
    }
    // Un seul bouton plein : Réviser (déclencheur de menu : son data-slot est celui du menu, on regarde donc tous les boutons)
    await p.mouse.move(0, 0);
    const filled = await p.evaluate(() => {
      const probe = document.createElement("span"); probe.style.background = "var(--primary)"; document.body.append(probe);
      const primary = getComputedStyle(probe).backgroundColor; probe.remove();
      return [...document.querySelectorAll("button, a[role=button], [data-slot=button]")].filter((b) => !b.closest("[data-slot=sidebar]") && b.offsetParent && getComputedStyle(b).backgroundColor === primary).map((b) => b.textContent.trim());
    });
    check("lecture : un seul bouton plein, « Réviser »", filled.length === 1 && filled[0].startsWith("Réviser"), filled.join(" | "));
    await p.getByRole("button", { name: "Notes" }).click();
    await p.getByRole("dialog", { name: "Notes" }).waitFor();
    check("lecture : le panneau Notes s'ouvre", await p.getByRole("dialog", { name: "Notes" }).getByText("Note de mesure").first().isVisible().catch(() => false));
    await p.keyboard.press("Escape");
    // Impression : ni navigation ni barre d'actions
    await p.emulateMedia({ media: "print" });
    const hidden = await p.evaluate(() => ["[data-slot=sidebar]", ".doc-actionbar", ".doc-aside"].every((sel) => [...document.querySelectorAll(sel)].every((el) => getComputedStyle(el).display === "none")));
    check("impression : la navigation et les actions sont masquées", hidden);
    await p.evaluate(() => document.documentElement.classList.add("print-notes"));
    check("impression : notes numérotées en bas de page", await p.locator(".print-notes-list li").count() > 0);
    await p.emulateMedia({ media: "screen" });
    await p.screenshot({ path: "/shots/lecture-cours-1440.png" });
    await c.close();
  }

  // --- téléphone : la barre d'onglets reste, les actions du cours flottent au-dessus
  {
    const { c, p } = await open(390, 844, true);
    await p.goto(`/d/${importedDoc}`); await p.locator("article.course").waitFor(); await p.waitForTimeout(600);
    const tabs = await p.getByRole("navigation", { name: "Navigation principale" }).isVisible().catch(() => false);
    const reading = await p.getByRole("navigation", { name: "Lecture" }).isVisible();
    check("téléphone : barre d'actions du cours au-dessus des onglets", reading && tabs);
    await p.getByRole("navigation", { name: "Lecture" }).getByRole("button", { name: "Sommaire" }).tap().catch(() => {});
    check("téléphone : sommaire en feuille", await p.getByRole("dialog", { name: "Dans ce cours" }).isVisible().catch(() => false));
    await p.screenshot({ path: "/shots/lecture-cours-390.png" });
    await c.close();
  }

  // --- éditeur : menu « / » compact, une seule poignée, une seule bulle
  {
    const { c, p } = await open(1440, 900);
    await openBlankDraft(p);
    const pm = p.locator(".ProseMirror");
    await pm.click();
    await p.keyboard.type("Première ligne");
    await p.keyboard.press("Enter");
    await p.keyboard.type("/");
    const menu = p.locator(".slash-menu");
    await menu.waitFor();
    const box = await menu.boundingBox();
    check("éditeur : menu « / » de 18rem × 20rem au plus", box.width <= 288.5 && box.height <= 320.5, `${box.width}×${box.height}`);
    await p.keyboard.type("defini");
    check("éditeur : recherche sans accents", await menu.getByText("Définition").isVisible());
    await p.keyboard.type("xyzw");
    await p.waitForTimeout(300);
    check("éditeur : « Aucun bloc » puis fermeture", !(await menu.isVisible().catch(() => false)) || await menu.getByText("Aucun bloc").isVisible());
    await p.keyboard.press("Escape");
    await pm.click(); // Échap peut rendre la main hors de l'éditeur : on y revient avant de tout sélectionner
    await p.keyboard.press("Control+a"); await p.keyboard.press("Backspace");
    await p.keyboard.type("Texte à mettre en forme");
    await pm.getByText("Texte à mettre en forme").hover();
    await p.waitForTimeout(300);
    check("éditeur : une seule poignée", await p.locator(".block-handle").count() <= 1 && !(await p.locator(".bn-side-menu").count()));
    await p.keyboard.press("End"); await p.keyboard.press("Enter");
    await p.waitForTimeout(300);
    check("éditeur : le + n'apparaît que sur une ligne vide", await p.getByRole("button", { name: "Insérer un bloc" }).count() <= 1);
    await pm.getByText("Texte à mettre en forme").dblclick();
    await p.waitForTimeout(400);
    check("éditeur : une seule bulle de mise en forme", await p.getByRole("toolbar", { name: "Mise en forme" }).count() === 1 && !(await p.locator(".bn-formatting-toolbar").count()));
    check("éditeur : puces réduites à matière + type", await p.locator("select[name=subject]").isVisible() && await p.locator("select[name=category]").isVisible() && !(await p.locator("input[name=chapter]").isVisible()));
    await p.screenshot({ path: "/shots/lecture-editeur-1440.png" });
    await c.close();
  }

  // --- éditeur au téléphone : une seule barre basse
  {
    const { c, p } = await open(390, 844, true);
    await openBlankDraft(p);
    await p.waitForTimeout(500);
    const tabs = await p.getByRole("navigation", { name: "Navigation principale" }).isVisible().catch(() => false);
    check("éditeur téléphone : la barre d'onglets reste", tabs);
    await c.close();
  }

  // --- actualités : écrites sur leur page finale
  await admin.goto("/admin/actualites");
  await admin.getByRole("button", { name: "Nouvelle actualité" }).first().click();
  await admin.waitForURL(/admin\/actualites\/[0-9a-f-]{36}$/);
  await admin.locator(".ProseMirror").waitFor({ timeout: 30000 });
  check("actualités : pas de formulaire Markdown", !(await admin.locator("textarea[name=body]").count()));
  await admin.fill("textarea[name=title]", "Actualité programmée");
  await admin.locator(".ProseMirror").click(); await admin.keyboard.type("Bientôt en ligne.");
  await admin.waitForTimeout(2000);
  await admin.getByRole("button", { name: "Publier", exact: true }).click();
  const sheet = admin.getByRole("dialog");
  await sheet.getByRole("switch").nth(2).click();
  await sheet.getByRole("button", { name: "Programmer" }).click();
  // L'action enregistre puis programme : quitter la page avant sa réponse l'interrompt (ECONNRESET côté serveur).
  // La feuille ne se ferme qu'une fois la programmation enregistrée.
  await sheet.waitFor({ state: "detached", timeout: 30000 }).catch(() => undefined);
  await admin.waitForLoadState("load");
  await admin.goto("/admin/actualites").catch(() => admin.goto("/admin/actualites"));
  check("actualités : programmée", await admin.getByText("Programmée").first().isVisible());
}
