// Artefact HTML isolé, figure SVG nettoyée, graphe de fonctions, dans un cours.
export async function run({ admin, check, openBlankDraft, waitSaved }) {
  await openBlankDraft(admin);
  const draft = admin.url().split("/").pop();
  await admin.locator("input[name=title], textarea[name=title]").first().fill("Contenus riches").catch(() => {});
  const insert = async (name) => {
    // Un clic au centre de l'éditeur tombe dans le bloc déjà inséré (non éditable) : on vise le paragraphe vide de la fin
    await admin.locator('.ProseMirror .bn-block-content[data-content-type="paragraph"]').last().click();
    await admin.keyboard.type("/");
    await admin.getByRole("option", { name }).first().click();
    await admin.waitForTimeout(600);
  };
  await insert("Graphe de fonctions");
  await insert("Figure SVG");
  await insert("Artefact HTML");
  await admin.getByRole("textbox", { name: "Code de l’artefact" }).fill("<!doctype html><title>a</title><script>try { parent.document.title = 'pwned'; } catch (e) { document.title = 'isole'; }</script><p>Bonjour depuis l’artefact</p>");
  await admin.getByRole("button", { name: "Insérer le code" }).click();
  await admin.getByRole("textbox", { name: "Titre de l’artefact" }).waitFor({ timeout: 20000 });
  await waitSaved(admin);
  await admin.goto(`/d/${draft}`);
  const course = admin.locator("article.course");
  await course.waitFor();
  check("SVG : figure rendue dans le cours, sans script", await course.locator(".rich-svg svg circle").count() > 0 && !(await course.locator("script").count()));
  check("graphe : tracé présent (interactif ou statique)", await course.locator("figure.course-rich svg").count() >= 2);
  const frame = course.locator("figure.course-artifact iframe");
  check("artefact : cadre isolé, sans same-origin", (await frame.getAttribute("sandbox"))?.includes("allow-scripts") && !(await frame.getAttribute("sandbox"))?.includes("allow-same-origin"));
  check("artefact : servi par /embed", /\/embed\//.test(await frame.getAttribute("src") ?? ""));
  let seen = false;
  for (let i = 0; i < 30 && !seen; i++) {
    seen = await admin.frameLocator("figure.course-artifact iframe").getByText("Bonjour depuis l’artefact").isVisible().catch(() => false);
    if (!seen) { await admin.waitForTimeout(1500); await admin.reload(); await course.waitFor(); }
  }
  check("artefact : affiché après l'analyse antivirus", seen);
  check("artefact : aucun accès à la page qui l'affiche", (await admin.title()) !== "pwned");
  // L'artefact est servi par l'origine de contenu : un fetch de la page serait bloqué (CORS), on lit l'en-tête hors navigateur
  const csp = (await admin.context().request.get(await frame.getAttribute("src"))).headers()["content-security-policy"];
  check("artefact : CSP stricte (sandbox, connect-src 'none')", /^sandbox /.test(csp ?? "") && (csp ?? "").includes("connect-src 'none'"));
}
