/**
 * Captures de l'interface pour la page de présentation, prises sur le jeu de démonstration (scripts/seed-demo.ts).
 * Mode d'emploi complet : scripts/capture-showcase.md.
 *
 *   node scripts/capture-showcase.mjs shoot   (conteneur Playwright, BASE_URL et RAW_DIR)  → PNG bruts en 2x
 *   node scripts/capture-showcase.mjs encode  (node + sharp, RAW_DIR)                       → public/presentation/*.avif|webp + manifest.json
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const RAW = process.env.RAW_DIR ?? "/tmp/vitrine-raw";
const OUT = process.env.OUT_DIR ?? "public/presentation";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = "lina_morel@etu.exemple.fr";
const PASSWORD = "vitrine-demo-campuss-2026";

/**
 * iPhone 15/16 (et Pro) : écran de 393 × 852 points en 3x. Zone sûre émulée (Chrome DevTools Protocol) : 59 points en
 * haut (barre d'état et île), 34 en bas (indicateur d'accueil). L'application s'y range d'elle-même (pt-safe, pb-safe) :
 * la barre d'onglets reste entière au-dessus de l'indicateur. La barre d'état (heure, réseau, batterie) et
 * l'indicateur sont ensuite dessinés dans la capture, sans rien masquer : le haut de l'écran est la marge de l'île.
 */
const PHONE = { width: 393, height: 852 };
const PHONE_SCALE = 3;
const SAFE_AREA = { top: 59, bottom: 34, left: 0, right: 0 };
/** Captures prises en téléphone (3x) : le reste est en 2x. */
const PHONE_SHOTS = new Set(["tel-cours", "tel-accueil", "ia-quiz", "ia-fiches", "etape-reviser", "tel-partiels", "tel-amis"]);
const TABLET = { width: 820, height: 1180 };
const DESKTOP = { width: 1280, height: 800 };

/** Plus petit ancêtre assez large du texte cherché : une carte, une grille, un bloc. */
async function blockOf(page, text, minWidth, minHeight = 0) {
  const handle = await page.getByText(text, { exact: false }).first().elementHandle({ timeout: 8000 });
  return handle.evaluateHandle((el, [w, h]) => {
    let node = el;
    while (node.parentElement && (node.getBoundingClientRect().width < w || node.getBoundingClientRect().height < h)) node = node.parentElement;
    return node;
  }, [minWidth, minHeight]);
}

async function signIn(browser, scheme, viewport, deviceScaleFactor) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, isMobile: viewport === PHONE, hasTouch: viewport === PHONE, colorScheme: scheme, reducedMotion: "reduce", locale: "fr-FR", timezoneId: "Europe/Paris" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Adresse mail").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
  await page.locator('a[href^="/d/"]').first().waitFor({ timeout: 30000 });
  return page;
}

/** Zone sûre de l'iPhone : env(safe-area-inset-*) vaut alors ce que vaudrait l'appareil. Vérifiée sur la page. */
async function emulateSafeArea(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: SAFE_AREA });
  await page.reload();
  const top = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.paddingTop = "env(safe-area-inset-top)";
    document.body.append(probe);
    const value = getComputedStyle(probe).paddingTop;
    probe.remove();
    return value;
  });
  if (top !== `${SAFE_AREA.top}px`) throw new Error(`Zone sûre non émulée (env(safe-area-inset-top) = ${top})`);
}

/**
 * Barre d'état d'iOS dessinée par-dessus la page, dans la marge du haut (jamais sur l'application) : 9:41 à gauche de
 * l'île, réseau, Wi-Fi et batterie à droite, dans la couleur du texte de la page. Indicateur d'accueil en bas.
 */
async function drawStatusBar(page) {
  await page.evaluate(({ top }) => {
    const color = getComputedStyle(document.body).color;
    const bar = document.createElement("div");
    bar.setAttribute("aria-hidden", "true");
    bar.style.cssText = `position:fixed;inset:0 0 auto;height:${top}px;z-index:2147483647;pointer-events:none;display:flex;align-items:center;justify-content:space-between;padding:0 30px 0 52px;color:${color};font:600 17px/1 -apple-system,"SF Pro Text",system-ui,sans-serif;letter-spacing:-0.02em`;
    bar.innerHTML = '<span style="padding-top:2px">9:41</span><svg width="77" height="13" viewBox="0 0 77 13" fill="currentColor"><rect x="0" y="8.5" width="3.2" height="4.3" rx="1"/><rect x="5" y="6.2" width="3.2" height="6.6" rx="1"/><rect x="10" y="3.6" width="3.2" height="9.2" rx="1"/><rect x="15" y="1" width="3.2" height="11.8" rx="1"/><path d="M32 2.6a10.6 10.6 0 0 1 7.5 3.1l-1.4 1.4a8.6 8.6 0 0 0-12.2 0l-1.4-1.4A10.6 10.6 0 0 1 32 2.6Zm0 4a6.6 6.6 0 0 1 4.6 1.9l-1.4 1.4a4.6 4.6 0 0 0-6.4 0l-1.4-1.4A6.6 6.6 0 0 1 32 6.6Zm0 4 1.8 1.8L32 12.8l-1.8-1.8Z"/><rect x="47.5" y="1" width="25" height="12" rx="3.8" fill="none" stroke="currentColor" opacity=".35"/><rect x="49.5" y="3" width="21" height="8" rx="2.2"/><path d="M74 5v4a2.2 2.2 0 0 0 0-4Z" opacity=".4"/></svg>';
    const home = document.createElement("div");
    home.setAttribute("aria-hidden", "true");
    home.style.cssText = `position:fixed;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:${color};z-index:2147483647;pointer-events:none`;
    document.body.append(bar, home);
  }, SAFE_AREA);
}

async function shoot() {
  const { chromium } = await import("playwright");
  await mkdir(RAW, { recursive: true });
  const browser = await chromium.launch();
  const failures = [];
  for (const scheme of ["light", "dark"]) {
    const desktop = await signIn(browser, scheme, DESKTOP, 2);
    const phone = await signIn(browser, scheme, PHONE, PHONE_SCALE);
    await emulateSafeArea(phone);
    const page = desktop;
    const course = await page.locator('a[href^="/d/"]', { hasText: "L’offre, la demande" }).first().getAttribute("href");

    const take = async (name, size, path, action) => {
      // ONLY=nom1,nom2 : ne refaire que ces captures
      if (process.env.ONLY && !process.env.ONLY.split(",").includes(name)) return;
      const page = PHONE_SHOTS.has(name) ? phone : desktop;
      try {
        if (page === desktop) await page.setViewportSize(size);
        await page.goto(`${BASE}${path}`, { waitUntil: "load" });
        await page.waitForTimeout(1500);
        await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important} [data-sonner-toaster],nextjs-portal{display:none!important}" });
        if (page === phone) await drawStatusBar(page);
        await page.waitForTimeout(400);
        await action(join(RAW, `${name}-${scheme}.png`), page);
      } catch (error) {
        failures.push(`${name}-${scheme} : ${error.message.split("\n")[0]}`);
        console.warn(failures.at(-1));
      }
    };
    const screen = (file, p) => p.screenshot({ path: file });
    const block = (text, minWidth, minHeight) => async (file, p) => (await blockOf(p, text, minWidth, minHeight)).screenshot({ path: file });

    // Appareils entiers : héros et onglets par appareil
    await take("ordi-accueil", DESKTOP, "/accueil", screen);
    await take("tel-cours", PHONE, course, screen);
    await take("tel-accueil", PHONE, "/accueil", screen);
    await take("tablette-cours", TABLET, course, screen);
    await take("ordi-cours", DESKTOP, course, screen);
    // Captures partielles du bento et des démonstrations
    await take("case-range", DESKTOP, "/accueil", async (file) => {
      const heading = page.getByRole("heading", { name: "Reprendre" }).first();
      await heading.scrollIntoViewIfNeeded();
      const box = await heading.boundingBox();
      await page.screenshot({ path: file, clip: { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: 620, height: 300 } });
    });
    await take("case-annote", DESKTOP, course, async (file) => {
      const passage = page.getByText("quantité demandée égale la quantité offerte").first();
      await passage.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      const box = await passage.boundingBox();
      const x = Math.max(0, box.x - 24);
      await page.screenshot({ path: file, clip: { x, y: Math.max(0, box.y - 110), width: Math.min(DESKTOP.width - x, 960), height: 340 } });
    });
    await take("case-amis", DESKTOP, "/accueil", block("A3F9C", 240, 150));
    await take("case-partiel", DESKTOP, "/reviser/partiels", block("Partiel de statistiques", 560));
    await take("ia-quiz", PHONE, `${course}/quiz`, screen);
    await take("ia-fiches", PHONE, "/reviser/fiches", screen);
    await take("etape-reviser", PHONE, "/reviser", screen);
    // Écrans du récit épinglé et du téléphone 3D
    await take("tel-partiels", PHONE, "/reviser/partiels", screen);
    await take("tel-amis", PHONE, "/amis", screen);
    await desktop.context().close();
    await phone.context().close();
  }
  await browser.close();
  if (failures.length) console.warn(`Captures manquées (la page s'en passe) :\n- ${failures.join("\n- ")}`);
  console.log(`Captures brutes dans ${RAW}`);
}

async function encode() {
  const sharp = (await import("sharp")).default;
  await mkdir(OUT, { recursive: true });
  const manifest = {};
  for (const file of (await readdir(RAW)).filter((f) => f.endsWith(".png")).sort()) {
    const base = file.replace(/\.png$/, "");
    const { width, height } = await sharp(join(RAW, file)).metadata();
    // Capturé en 3x (téléphone) ou en 2x : la largeur CSS s'en déduit ; on livre du 1x et du 2x
    const scale = PHONE_SHOTS.has(base.replace(/-(light|dark)$/, "")) ? PHONE_SCALE : 2;
    const css = { width: Math.round(width / scale), height: Math.round(height / scale) };
    for (const [suffix, w] of [["", css.width], ["@2x", css.width * 2]]) {
      const img = sharp(join(RAW, file)).resize({ width: w });
      await img.clone().avif({ quality: 55, effort: 4 }).toFile(join(OUT, `${base}${suffix}.avif`));
      await img.clone().webp({ quality: 78, effort: 6 }).toFile(join(OUT, `${base}${suffix}.webp`));
    }
    const name = base.replace(/-(light|dark)$/, "");
    manifest[name] = { ...css, themes: [...(manifest[name]?.themes ?? []), base.endsWith("-dark") ? "dark" : "light"] };
  }
  // Une capture n'est montrée que si elle existe dans les deux thèmes
  for (const [name, entry] of Object.entries(manifest)) if (entry.themes.length < 2) delete manifest[name];
  for (const entry of Object.values(manifest)) delete entry.themes;
  await writeFile(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await ogImage(sharp);
  console.log(`${Object.keys(manifest).length} captures encodées dans ${OUT}`);
}

/** Image de partage 1200×630 : l'icône Campuss et une vraie capture de l'accueil, sur le bordeaux de la marque. */
async function ogImage(sharp) {
  const source = join(RAW, "ordi-accueil-light.png");
  const width = 1000, height = 470, radius = 18;
  const mask = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height + radius}" rx="${radius}"/></svg>`);
  const capture = await sharp(source).resize({ width }).extract({ left: 0, top: 0, width, height }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const icon = await sharp("public/icon-512.png").resize(88).png().toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: "#A10E2F" } })
    .composite([{ input: icon, left: 56, top: 40 }, { input: capture, left: 100, top: 160 }])
    .png({ compressionLevel: 9 }).toFile("public/og.png");
}

const step = process.argv[2];
if (step === "shoot") await shoot();
else if (step === "encode") await encode();
else { console.error("Usage : node scripts/capture-showcase.mjs shoot|encode"); process.exit(1); }
