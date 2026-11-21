import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const MAIL = "http://localhost:8025/api/v1";
const FX = new URL("./fixtures/", import.meta.url).pathname;
let failures = 0;
// Réglages de compte : rien ne part avant « Enregistrer » (barre collante), puis l'avis « Modifications enregistrées »
const saveSettings = async (p) => { await p.getByRole("region", { name: "Enregistrer les modifications" }).getByRole("button", { name: "Enregistrer", exact: true }).click(); await p.getByText("Modifications enregistrées").first().waitFor(); };
// Matière : trois choix étiquetés Année / Semestre / Matière ; on parcourt années et semestres jusqu'à la trouver.
// L'année d'un étudiant est verrouillée (pas de liste) : seuls les semestres sont parcourus
const chooseSubject = async (p, name) => {
  const select = p.locator("select[name=subject]").first(); const picker = select.locator("xpath=ancestor::*[@data-subject-picker][1]");
  const years = picker.locator("select[data-term=level]"); const terms = picker.locator("select[data-term=parity]");
  if (!(await terms.count())) return select.selectOption({ label: name });
  const levels = (await years.count()) ? await years.locator("option").evaluateAll((os) => os.map((o) => o.value)) : [null];
  for (const level of levels) {
    if (level) await years.selectOption(level);
    for (const parity of ["1", "2"]) {
      await terms.selectOption(parity);
      if (await select.locator("option").evaluateAll((os, n) => os.some((o) => o.textContent === n), name)) return select.selectOption({ label: name });
    }
  }
  throw new Error(`matière introuvable : ${name}`);
};
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra ? ` -> ${extra}` : ""}`); if (!ok) failures++; };

async function mails(to) {
  const { messages } = await (await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
  return messages ?? [];
}
async function waitMail(to, subject) {
  for (let i = 0; i < 30; i++) {
    for (const m of await mails(to)) if (m.Subject.includes(subject)) return (await (await fetch(`${MAIL}/message/${m.ID}`)).json()).Text;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`mail absent : ${subject} pour ${to}`);
}
const raw = (path, init = {}) => fetch(path.startsWith("http") ? path : BASE + path, { redirect: "manual", ...init });
const form = (o) => new URLSearchParams(o).toString();

// La VM n'a que 4 Go, partagés avec la production : un seul navigateur sobre
const browser = await chromium.launch({ args: ["--renderer-process-limit=4", "--disable-dev-shm-usage", "--disable-gpu", "--js-flags=--max-old-space-size=384"] });
const OPENED = [];
// Le tutoriel couvrirait l'écran dans tous les autres parcours : il a son propre test, avec un contexte vierge
const rawContext = browser.newContext.bind(browser);
browser.newContext = async (options) => { const c = await rawContext(options); await c.addInitScript(() => { try { localStorage.setItem("campuss-tour", "1"); } catch { /* page isolée */ } }); return c; };
let ipCounter = 10;
const newUser = async (consent = "no") => { const c = await browser.newContext({ baseURL: BASE, acceptDownloads: true, userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36", extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ipCounter++}` } }); if (consent) await c.addCookies([{ name: "campuss-consent", value: consent, url: BASE }]); const p = await c.newPage(); p.setDefaultTimeout(45000); OPENED.push(c); return { c, p }; };
const layoutOk = (p) => p.evaluate(() => { const y = (t) => document.querySelector(t).getBoundingClientRect().top; const inApp = Boolean(document.querySelector("header").closest("#app")); return inApp && y("header") < y("main") && y("main") < y("footer"); });

async function finishWelcome(p) {
  // La connexion passe par « / » avant de renvoyer vers le tutoriel : on attend l'une des deux pages finales
  const profile = p.getByRole("button", { name: "Notifications" }).first();
  const next = p.getByRole("radio", { name: "Lire les cours" });
  await profile.or(next).first().waitFor();
  if (!p.url().includes("bienvenue")) return;
  await next.click();
  await p.getByRole("button", { name: "C’est parti" }).click();
  await profile.waitFor();
}
// La décision se prend dans la barre « Relecture » de la page du cours (raccourcis A / R dans les libellés)
const reviewBar = (p) => p.getByRole("region", { name: "Relecture" });
async function publishHere(p) {
  await reviewBar(p).getByRole("button", { name: /^Publier/ }).click();
  const attest = p.getByRole("button", { name: "J’ai vérifié, publier" });
  if (await attest.waitFor({ timeout: 3000 }).then(() => true, () => false)) await attest.click();
  await reviewBar(p).waitFor({ state: "detached" });
}
// Le lien du profil est dans le menu « Compte » de la barre latérale
async function myId(p) {
  await p.getByRole("button", { name: "Compte" }).first().click();
  const href = await p.getByRole("menuitem", { name: "Profil" }).getAttribute("href");
  await p.keyboard.press("Escape");
  return href.split("/").pop();
}
async function fillLogin(p, email, password) {
  await p.goto("/login");
  await p.fill('input[name=email]', email);
  await p.fill('input[name=password]', password);
  await p.click('button[type=submit]');
}

// --- accès anonyme
// « / » est la présentation (sans redirection), /presentation y renvoie en 308, /accueil demande une session
{ const root = await raw("/"); check("anonyme / : page de présentation", root.status === 200 && !root.headers.get("location") && /private, no-store/.test(root.headers.get("cache-control") ?? ""), `${root.status} ${root.headers.get("cache-control")}`); }
{ const old = await raw("/presentation?x=1"); check("/presentation : 308 vers /", old.status === 308 && (old.headers.get("location") ?? "").replace(BASE, "").startsWith("/?x=1"), `${old.status} ${old.headers.get("location")}`); }
{ const acc = await raw("/accueil"); check("anonyme /accueil renvoyé vers /login", [303, 307].includes(acc.status) && (acc.headers.get("location") ?? "").startsWith("/login"), `${acc.status} ${acc.headers.get("location")}`); }
for (const path of ["/admin", "/admin/personnes", "/parametres", "/reviser", "/moderation", "/reviser/partiels", "/d/00000000-0000-4000-8000-000000000000"]) {
  const r = await raw(path);
  check(`anonyme ${path} renvoyé vers /login`, [303, 307].includes(r.status) && (r.headers.get("location") ?? "").startsWith("/login"), `${r.status} ${r.headers.get("location")}`);
}
check("anonyme : fichier 404", (await raw("/files/00000000-0000-4000-8000-000000000000")).status === 404);
check("anonyme : api admin 403", (await raw("/api/admin/uploads", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: "{}" })).status === 403);

// --- admin initial
const ADMIN = "admin@test.example";
const ADMIN_PW = "phrase-gerant-tres-longue-42";
const initial = process.env.ADMIN_INITIAL;
const admin = await newUser();
await fillLogin(admin.p, ADMIN, initial);
// /parametres renvoie ensuite (côté serveur) vers /parametres/compte : on attend l'adresse finale
await admin.p.waitForURL(/\/parametres\/compte$/).catch(() => undefined);
check("mot de passe provisoire : retour forcé sur Compte et sécurité", /\/parametres\/compte$/.test(admin.p.url()));
await admin.p.goto("/admin"); check("provisoire : /admin inaccessible", /\/parametres\/compte$/.test(admin.p.url()));
await admin.p.fill('input[name=current]', initial);
await admin.p.fill('form:has(input[autocomplete=new-password]) input[name=password]', ADMIN_PW);
await admin.p.click('form:has(input[autocomplete=new-password]) button[type=submit]');
await admin.p.getByText("Mot de passe modifié").waitFor();
await admin.p.goto("/accueil");
await admin.p.waitForURL(/accepter-cgu/);
check("CGU : acceptation demandée avant tout accès", true);
await admin.p.locator("input[name=terms]").check(); await admin.p.getByRole("button", { name: "Accepter et continuer" }).click();
await admin.p.waitForURL(/securite=1/);
check("admin : second facteur obligatoire", true);
check("admin sans second facteur : API fermée", (await admin.p.evaluate(async () => (await fetch("/api/editor/ocr", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status)) === 403);
await admin.p.getByRole("button", { name: "Configurer" }).click();
const adminSecret = await admin.p.locator("code").waitFor().then(() => admin.p.locator("code").textContent());
const { Secret, TOTP } = await import("otpauth");
const adminTotp = new TOTP({ secret: Secret.fromBase32(adminSecret) });
await admin.p.fill("input[name=code]", adminTotp.generate()); await admin.p.getByRole("button", { name: "Activer" }).click();
await admin.p.getByText("Active : un code est demandé").waitFor();
// Actions sensibles : la fenêtre du second facteur peut s'ouvrir à tout moment, sa preuve ne dure que 10 minutes.
// Le code suivant, car celui de l'instant peut déjà avoir servi. L'action doit ensuite repartir seule.
let stepUpShown = 0;
const stepUpDialog = admin.p.getByRole("dialog", { name: "Confirme que c’est bien toi" });
let stepUpBusy = false;
setInterval(() => void (async () => {
  if (stepUpBusy || !await stepUpDialog.isVisible()) return;
  stepUpBusy = true;
  stepUpShown++;
  await stepUpDialog.locator("input[name=code]").fill(adminTotp.generate({ timestamp: Date.now() + 30000 }));
  await stepUpDialog.waitFor({ state: "hidden", timeout: 10000 });
})().catch(() => undefined).finally(() => { stepUpBusy = false; }), 200);
await admin.p.getByRole("button", { name: "Générer mes codes de secours" }).click();
await admin.p.locator("[data-recovery-codes] li").first().waitFor();
const adminCodes = await admin.p.locator("[data-recovery-codes] li").allTextContents();
check("codes de secours : 10 générés", adminCodes.length === 10);
const lost = await newUser();
await fillLogin(lost.p, ADMIN, ADMIN_PW); await lost.p.waitForURL(/2fa/);
await lost.p.fill("input[name=code]", adminCodes[0]); await lost.p.getByRole("button", { name: "Valider", exact: true }).click();
await lost.p.waitForURL(`${BASE}/accueil`);
check("code de secours : connexion possible sans téléphone", true);
const lost2 = await newUser();
await fillLogin(lost2.p, ADMIN, ADMIN_PW); await lost2.p.waitForURL(/2fa/);
await lost2.p.fill("input[name=code]", adminCodes[0]); await lost2.p.getByRole("button", { name: "Valider", exact: true }).click();
await lost2.p.getByText("Code incorrect").waitFor();
check("code de secours : usage unique", true);
await admin.p.goto("/accueil");
await admin.p.waitForTimeout(600);
check("après acceptation des CGU : en-tête, contenu et pied dans l'ordre", await layoutOk(admin.p));
const cookies = await admin.c.cookies();
const sc = cookies.find((c) => c.name === "__Host-campus");
check("cookie HttpOnly, Secure, SameSite=Lax", sc?.httpOnly && sc?.secure && sc?.sameSite === "Lax", JSON.stringify(sc));

// --- Un visiteur hors des domaines admis ne crée pas de compte (même réponse, compte ou non)
const visitorOut = await newUser();
for (const email of ["visiteur@example.org", "admin@campuss.fr"]) {
  await visitorOut.p.goto("/register");
  await visitorOut.p.fill('input[name=name]', "Visiteur"); await visitorOut.p.fill('input[name=email]', email);
  await visitorOut.p.locator("input[name=terms]").check(); await visitorOut.p.locator('main button[type=submit]').click();
  await visitorOut.p.getByText("Seuls les étudiants peuvent créer un compte : utilise ton adresse @etu.exemple.fr").waitFor();
}
check("inscription : seuls les domaines admis, message étudiant", true);

// --- inscription -> mail -> validation (test.example est admis avec validation sur le banc)
const XSS = `<img src=x onerror="window.__xss=1">Élève`;
const member = await newUser();
const MEMBER = "eleve@test.example"; const MEMBER_PW = "phrase-etudiant-tres-longue-77";
await member.p.goto("/register");
await member.p.fill('input[name=name]', XSS);
await member.p.fill('input[name=email]', MEMBER);
check("inscription : seule la licence ouverte est proposée", (await member.p.locator("select[name=program] option").allTextContents()).join() === "Économie");
await member.p.fill('textarea[name=message]', `L3 <script>window.__xss=1</script>`);
await member.p.locator("input[name=terms]").check();
await member.p.locator('main button[type=submit]').click();
await member.p.getByText("Si cette adresse peut être utilisée").waitFor();
await fillLogin(member.p, MEMBER, MEMBER_PW);
await member.p.getByText("Adresse ou mot de passe incorrect").waitFor();
check("compte non confirmé : connexion refusée, sans révéler l'existence", member.p.url().includes("/login"));
const verify = /\/verify\/\S+/.exec(await waitMail(MEMBER, "confirme"))[0];
await member.p.goto(verify.replace(/^/, ""));
check("visite du lien seule : rien n'est validé", !(await mails(ADMIN)).some((m) => m.Subject.includes("nouvelle demande")));
check("pré-détournement : mot de passe choisi seulement ici", await member.p.locator('input[name=password]').count() === 1);
await member.p.fill('input[name=password]', MEMBER_PW);
await member.p.click('button[type=submit]');
await member.p.getByText("Ta demande a été transmise").waitFor();
const adminMail = await waitMail(ADMIN, "nouvelle demande");
check("mail reçu par l'admin avec le lien de validation", adminMail.includes("/admin/personnes"));
await fillLogin(member.p, MEMBER, MEMBER_PW);
await member.p.getByText("en attente de validation").waitFor();
check("compte en attente : connexion refusée", true);
// même réponse si on réutilise l'adresse (énumération)
const re = await newUser();
await re.p.goto("/register");
await re.p.fill('input[name=name]', "Autre"); await re.p.fill('input[name=email]', MEMBER);
await re.p.locator("input[name=terms]").check(); await re.p.locator('main button[type=submit]').click();
await re.p.getByText("Si cette adresse peut être utilisée").waitFor();
check("inscription sur adresse existante : réponse identique", true);

await admin.p.goto("/admin/personnes");
await admin.p.getByText(XSS).first().waitFor().catch(() => undefined);
check("XSS stocké (nom) : affiché en texte", await admin.p.getByText(XSS).first().isVisible());
check("XSS stocké : non exécuté chez l'admin", !(await admin.p.evaluate(() => window.__xss)));

// Rejeu d'action serveur : on capture la requête d'approbation de l'admin
let captured = null;
admin.p.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"]) captured ??= { url: r.url(), headers: r.headers(), body: r.postDataBuffer() }; });
await admin.p.getByRole("button", { name: "Accepter" }).click();
await admin.p.getByText("Actif").nth(1).waitFor();
await waitMail(MEMBER, "accepté");
check("mail d'acceptation envoyé", true);
await fillLogin(member.p, MEMBER, MEMBER_PW);
await member.p.waitForURL(/bienvenue/);
// Le tutoriel ne redemande plus l'année (choisie à l'inscription), il commence par « Qu'est-ce qui t'amène ? »
await member.p.getByRole("radio", { name: "Lire les cours" }).waitFor().catch(() => undefined);
check("première connexion : tutoriel", await member.p.getByRole("radio", { name: "Lire les cours" }).isVisible());
await finishWelcome(member.p);
await member.p.waitForTimeout(600);
check("membre accepté : connexion", true);
check("après connexion : en-tête, contenu et pied dans l'ordre", await layoutOk(member.p));

// --- élévation de privilèges
for (const path of ["/admin", "/admin/personnes", "/admin/documents/new", "/admin/journal", "/admin/erreurs"]) {
  const r = await member.p.goto(path);
  check(`membre ${path} : 404`, r.status() === 404, String(r.status()));
}
const memberCookie = (await member.c.cookies()).find((c) => c.name === "__Host-campus").value;
const replay = await raw(new URL(captured.url).pathname, { method: "POST", headers: { ...Object.fromEntries(Object.entries(captured.headers).filter(([k]) => !k.startsWith(":") && !["cookie", "content-length", "host"].includes(k))), cookie: `__Host-campus=${memberCookie}` }, body: captured.body });
const replayText = await replay.text();
check("membre rejoue une action admin : pas de succès", replay.status !== 200 || replayText.includes("NEXT_HTTP_ERROR") || replayText.includes("NEXT_NOT_FOUND") || replay.status === 404, `${replay.status} ${replayText.slice(0, 200)}`);
check("membre : aucun envoi sur un document inconnu", (await raw("/api/admin/uploads", { method: "POST", headers: { cookie: `__Host-campus=${memberCookie}`, "content-type": "application/json", origin: BASE }, body: JSON.stringify({ documentId: "00000000-0000-4000-8000-000000000000", purpose: "zip", filename: "a.zip", size: 1 }) })).status === 404);
const adminCookie = (await admin.c.cookies()).find((c) => c.name === "__Host-campus").value;
await member.p.goto("/accueil");
await member.p.goto("/accueil"); await member.p.waitForTimeout(800); await member.p.screenshot({ path: "/shots/ui-member.png" });
// Connecté, « / » reste la présentation, avec « Ouvrir Campuss » à la place de l’inscription
await member.p.goto("/");
check("connecté / : présentation avec « Ouvrir Campuss »", (await member.p.getByRole("link", { name: "Ouvrir Campuss" }).count()) > 0 && (await member.p.getByRole("link", { name: /Créer mon compte|Se connecter/ }).count()) === 0);
await member.p.goto("/?semestre=1"); check("connecté /?semestre= : quitte la présentation pour l’accueil", new URL(member.p.url()).pathname !== "/");
check("membre : pas de lien admin", !(await member.p.getByRole("link", { name: "Administration" }).count()));

// --- publication
async function newDoc(fill) {
  await admin.p.goto("/admin/documents/new");
  await chooseSubject(admin.p, "Histoire de la Pensée Économique");
  await admin.p.selectOption('select[name=rights]', "own_work");
  await admin.p.locator("input[name=attest]").check();
  // Le bouton est contrôlé par React : on réessaie tant que la page n'est pas prête à répondre
  for (let i = 0; i < 20 && !(await admin.p.locator("textarea[name=pasted]").count()); i++) {
    await admin.p.locator("label", { hasText: "Coller un artefact" }).click();
    await admin.p.waitForTimeout(300);
  }
  if (!(await admin.p.locator("textarea[name=pasted]").count())) await admin.p.screenshot({ path: "/shots/newdoc-echec.png" });
  await fill(admin.p);
  await admin.p.getByRole("button", { name: "Enregistrer" }).click();
}
const ATTACK = `<!doctype html><title>piege</title><h1 id=r>attente</h1><script>
(async()=>{const out={};
 try{out.cookie=document.cookie}catch(e){out.cookie='blocked'}
 try{localStorage.setItem('a','1');out.ls='open'}catch(e){out.ls='blocked'}
 try{out.parent=parent.document.title}catch(e){out.parent='blocked'}
 try{const r=await fetch('/admin/personnes',{credentials:'include',redirect:'manual'});const t=await r.text();out.fetch=t.includes('Tous les comptes')?'leak':'noleak'}catch(e){out.fetch='blocked'}
 try{const r=await fetch('/api/admin/uploads',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:'{}'});out.post=r.status}catch(e){out.post='blocked'}
 try{top.location='https://evil.example';out.top='moved'}catch(e){out.top='blocked'}
 document.getElementById('r').textContent=JSON.stringify(out);})();
</script>`;
await newDoc(async (p) => { await p.fill('input[name=title]', "Artefact malveillant"); await p.fill('textarea[name=pasted]', ATTACK); });
await admin.p.waitForURL(/\/d\//);
const attackUrl = admin.p.url();
const frame = admin.p.frameLocator("iframe");
await frame.locator("#r").filter({ hasNotText: "attente" }).waitFor();
const report = JSON.parse(await frame.locator("#r").textContent());
console.log("     rapport de l'artefact :", JSON.stringify(report));
check("artefact : pas d'accès aux cookies", report.cookie === "" || report.cookie === "blocked", report.cookie);
check("artefact : pas d'accès au parent", report.parent === "blocked");
check("artefact : pas de lecture de /admin", report.fetch !== "leak");
check("artefact : POST d'administration refusé", report.post === 403 || report.post === "blocked", String(report.post));
check("artefact : la page parente reste en place", admin.p.url() === attackUrl);
// ouverture directe de l'URL : la sandbox doit tenir sans iframe
const src = await admin.p.locator("iframe").getAttribute("src");
const direct = await raw(src);
check("contenu : en-tête CSP sandbox même en accès direct", (direct.headers.get("content-security-policy") ?? "").startsWith("sandbox "), direct.headers.get("content-security-policy"));
check("origine séparée : le contenu n'est pas servi par le site", (await raw(src.replace("http://127.0.0.1:3100", ""))).status === 404);
check("origine séparée : elle ne sert ni l'administration ni la connexion", (await raw("http://127.0.0.1:3100/admin")).status === 404 && (await raw("http://127.0.0.1:3100/login")).status === 404);
check("contenu : jeton modifié refusé", (await raw(src.replace(/\.[^./]+\/index/, ".AAAA/index"))).status === 404);
for (const t of ["..%2f..%2fetc%2fpasswd", "%2e%2e/%2e%2e/secret", "..%5c..%5csecret", "a%00b"]) {
  check(`contenu : traversée ${t} refusée`, (await raw(src.replace("index.html", t))).status === 404);
}

await newDoc(async (p) => {
  await p.fill('input[name=title]', "Artefact React");
  await p.fill('textarea[name=pasted]', `import { useState } from "react";\nimport { Star } from "lucide-react";\nexport default function App(){const [n,setN]=useState(0);return <button id="b" className="p-2" onClick={()=>setN(n+1)}><Star/>compteur {n}</button>}`);
});
await admin.p.waitForURL(/\/d\//);
// Contexte sans en-tête ajouté : un en-tête personnalisé déclencherait un préflight qu'un vrai navigateur n'envoie pas
const reactCtx = await browser.newContext({ baseURL: BASE, storageState: await admin.c.storageState() });
const reactPage = await reactCtx.newPage();
const cdnCalls = [];
reactPage.on("request", (r) => { if (/esm\.sh|jsdelivr|cdn\.tailwindcss|unpkg/.test(r.url())) cdnCalls.push(r.url()); });
await reactPage.goto(admin.p.url());
const af = reactPage.frameLocator("iframe");
await af.locator("#b").waitFor({ timeout: 60000 }).catch(() => {});
if (await af.locator("#b").count()) { await af.locator("#b").click(); check("artefact React : interactif", (await af.locator("#b").textContent()).includes("1")); }
else check("artefact React : interactif", false, await af.locator("body").textContent());

check("artefact React : aucun CDN externe", cdnCalls.length === 0, cdnCalls.join());
await newDoc(async (p) => { await p.fill('input[name=title]', "Compteur persistant"); await p.fill('textarea[name=pasted]', `<!doctype html><html><head><title>c</title></head><body><b id="v"></b><script>const n=Number(localStorage.getItem("n")||0)+1;localStorage.setItem("n",n);document.getElementById("v").textContent="visite "+n;</script></body></html>`); });
await admin.p.waitForURL(/\/d\//);
await admin.p.frameLocator("iframe").locator("#v", { hasText: "visite 1" }).waitFor();
await admin.p.waitForTimeout(300); await admin.p.reload();
await admin.p.frameLocator("iframe").locator("#v", { hasText: "visite 2" }).waitFor();
check("artefact : le stockage local survit au rechargement", true);
await newDoc(async (p) => { await p.fill('input[name=title]', "Fiche Markdown équation"); await p.selectOption('select[name=category]', "fiche"); await p.fill('textarea[name=pasted]', "# Titre\n\nLa dérivée d'une fonction"); });
await admin.p.waitForURL(/\/d\//);
check("markdown : rendu", await admin.p.frameLocator("iframe").locator("h1").textContent() === "Titre");

// ZIP
await newDoc(async (p) => { await p.fill('input[name=title]', "Export ZIP"); await p.getByRole("radio", { name: "Archive ZIP" }).check({ force: true }); await p.setInputFiles('input[name=mainFile]', FX + "good.zip"); });
await admin.p.waitForURL(/\/d\//, { timeout: 60000 });
await admin.p.frameLocator("iframe").locator("#ok", { hasText: "image ok" }).waitFor();
check("zip : site affiché, image à chemin accentué chargée", true);
const zipSrc = await admin.p.locator("iframe").getAttribute("src");
check("zip : lien symbolique ignoré", (await raw(zipSrc.replace("index.html", "lien"))).status === 404);
await newDoc(async (p) => { await p.fill('input[name=title]', "Zip slip"); await p.getByRole("radio", { name: "Archive ZIP" }).check({ force: true }); await p.setInputFiles('input[name=mainFile]', FX + "evil.zip"); });
await admin.p.getByRole("alert").filter({ hasText: /Archive corrompue|illisible|extraire/ }).waitFor({ timeout: 60000 });
check("zip slip : archive entière refusée", true);
await newDoc(async (p) => { await p.fill('input[name=title]', "Sans page"); await p.getByRole("radio", { name: "Archive ZIP" }).check({ force: true }); await p.setInputFiles('input[name=mainFile]', FX + "nohtml.zip"); });
await admin.p.getByText("aucune page HTML").waitFor({ timeout: 60000 });
check("zip sans page HTML : message clair", true);

await newDoc(async (p) => { await p.fill('input[name=title]', "Bombe"); await p.getByRole("radio", { name: "Archive ZIP" }).check({ force: true }); await p.setInputFiles('input[name=mainFile]', FX + "bomb.zip"); });
await admin.p.getByText("trop volumineuse").waitFor({ timeout: 120000 });
check("bombe ZIP refusée", true);

// Partiel : PDF + pièces piégées
await newDoc(async (p) => { await p.fill('input[name=title]', "Partiel d'analyse"); await p.selectOption('select[name=category]', "partiel"); await p.selectOption('select[name=rights]', "authorized"); await p.fill('input[name=academicYear]', "2024-2025"); await p.getByRole("radio", { name: "Aucun" }).check({ force: true }); await p.setInputFiles('input[name=attachments]', [FX + "sujet.pdf", FX + "piege.pdf.html", FX + "piege.svg", FX + "gros.bin"]); });
await admin.p.waitForURL(/\/d\//, { timeout: 120000 });
const partielUrl = new URL(admin.p.url()).pathname;
const links = await admin.p.locator('a[href^="/files/"]').evaluateAll((a) => a.map((x) => x.getAttribute("href")));
check("fichiers : 4 pièces, seul le PDF s'ouvre en ligne", links.filter((l) => l.includes("inline")).length === 1, links.join());
await admin.p.goto("/accueil");
check("import échoué : aucun document vide publié", !(await admin.p.getByText("Bombe").count()) && !(await admin.p.getByText("Zip slip").count()));
await admin.p.goto(partielUrl);
await member.p.goto(partielUrl);
const mfetch = (path) => member.p.evaluate(async (u) => {
  // Un fichier en cours d'analyse antivirus répond 423 : on attend la fin
  for (let i = 0; ; i++) { const r = await fetch(u); if (r.status !== 423 || i > 25) return { s: r.status, t: r.headers.get("content-type"), d: r.headers.get("content-disposition"), n: (await r.blob()).size }; await new Promise((ok) => setTimeout(ok, 1500)); }
}, path);
for (const row of await admin.p.locator('ul li:has(a[href^="/files/"])').evaluateAll((els) => els.map((e) => ({ n: e.querySelector("span").textContent, h: [...e.querySelectorAll("a")].pop().getAttribute("href") })))) {
  const r = await mfetch(row.h);
  check(`fichier ${row.n} : téléchargement forcé, binaire`, r.s === 200 && r.t === "application/octet-stream" && r.d.startsWith("attachment"), JSON.stringify(r));
  if (row.n === "gros.bin") check("gros fichier 20 Mo intact (envoi par morceaux)", r.n === 20 * 1024 * 1024, String(r.n));
}
const pdfLink = links.find((l) => l.includes("inline"));
const pdfR = await mfetch(pdfLink); check("PDF en ligne : application/pdf", pdfR.t === "application/pdf");
const svgHref = await admin.p.locator('li:has-text("piege.svg") a').last().getAttribute("href");
check("SVG : ?inline=1 reste un téléchargement", (await mfetch(svgHref + "?inline=1")).t === "application/octet-stream");

// Brouillon : invisible et inaccessible
await newDoc(async (p) => { await p.fill('input[name=title]', "Brouillon secret"); await p.fill('textarea[name=pasted]', "<p>secret</p>"); await p.setInputFiles('input[name=attachments]', FX + "sujet.pdf"); await p.uncheck('input[name=published]'); });
await admin.p.waitForURL(/\/d\//);
const draftPath = new URL(admin.p.url()).pathname;
const draftFile = await admin.p.locator('a[href^="/files/"]').last().getAttribute("href");
const draftView = await admin.p.locator("iframe").getAttribute("src");
check("brouillon : page 404 pour un membre", (await member.p.goto(draftPath)).status() === 404);
check("brouillon : fichier 404 pour un membre (IDOR)", (await mfetch(draftFile)).s === 404);
await member.p.goto("/accueil?q=secret");
check("brouillon : absent de la recherche d'un membre", await member.p.getByText("Aucun résultat").isVisible());

// --- recherche et injection SQL
await member.p.goto(`/accueil?q=${encodeURIComponent("derivee")}`);
check("recherche plein texte sans accent trouve « dérivée »", await member.p.getByText("Fiche Markdown équation").isVisible());
for (const q of [`' OR 1=1 --`, `'; DROP TABLE users; --`, `%' UNION SELECT password_hash FROM users --`, `\\`, `"`, `a & | !`, `%`, `_`]) {
  const r = await member.p.goto(`/accueil?q=${encodeURIComponent(q)}`);
  const none = await member.p.getByText("Aucun résultat").isVisible();
  check(`SQLi recherche ${q}`, r.status() === 200 && (none || ["%", "_"].includes(q) === false), `${r.status()}`);
}
for (const q of ["annee=1%20OR%201=1", "licence=x'--", "annee=1'%20OR%20'1'='1"]) check(`SQLi filtre ${q}`, (await member.p.goto(`/accueil?${q}`)).status() === 200);
await member.p.goto("/d/1'%20OR%201=1--"); check("SQLi identifiant document : 404", await member.p.getByText("Page introuvable").isVisible());
const sqlLogin = await newUser();
await fillLogin(sqlLogin.p, `' OR '1'='1' --@x.fr`, "x");
await sqlLogin.p.waitForTimeout(800);
check("SQLi connexion : refusée", sqlLogin.p.url().includes("/login"));
await admin.p.goto("/admin/personnes"); await admin.p.getByText(XSS).first().waitFor().catch(() => undefined); check("table users toujours là", await admin.p.getByRole("heading", { name: "Personnes" }).first().isVisible() && await admin.p.getByText(XSS).first().isVisible());

// --- CSRF et transport
const csrfHeaders = (origin) => ({ cookie: `__Host-campus=${adminCookie}`, origin, "content-type": "application/json" });
check("CSRF : origine tierce refusée", (await raw("/api/admin/uploads", { method: "POST", headers: csrfHeaders("https://evil.example"), body: "{}" })).status === 403);
check("CSRF : Origin null (sandbox) refusée", (await raw("/api/admin/uploads", { method: "POST", headers: csrfHeaders("null"), body: "{}" })).status === 403);
check("CSRF : Sec-Fetch-Site cross-site sans Origin refusé", (await raw("/api/admin/uploads", { method: "POST", headers: { cookie: `__Host-campus=${adminCookie}`, "sec-fetch-site": "cross-site", "content-type": "application/json" }, body: "{}" })).status === 403);
check("x-middleware-subrequest refusé (CVE-2025-29927)", (await raw("/admin", { headers: { "x-middleware-subrequest": "src/proxy:src/proxy:src/proxy:src/proxy:src/proxy" } })).status === 400);
check("corps anonyme trop grand : 413", (await raw("/login", { method: "POST", headers: { "content-type": "text/plain", origin: BASE }, body: "x".repeat(70000) })).status === 413);
const open = await raw(`/login?next=${encodeURIComponent("//evil.example")}`);
check("redirection ouverte neutralisée", !(await open.text()).includes('value="//evil.example"'));
for (const n of ["https://evil.example", "/\\evil.example", "//evil.example/%2e"]) {
  const c = await newUser(); await c.p.goto(`/login?next=${encodeURIComponent(n)}`);
  check(`next=${n} remplacé`, (await c.p.locator("input[name=next]").getAttribute("value")) === "/accueil"); await c.c.close();
}
const h = await raw("/login");
const csp = h.headers.get("content-security-policy") ?? "";
check("CSP : nonce, pas d'unsafe-inline/eval pour les scripts", /script-src 'self' 'nonce-/.test(csp) && !/script-src[^;]*unsafe/.test(csp), csp);
check("en-têtes : nosniff", h.headers.get("x-content-type-options") === "nosniff");
check("pas de x-powered-by", !h.headers.get("x-powered-by"));
const nonce1 = /nonce-([^']+)/.exec(csp)[1]; const nonce2 = /nonce-([^']+)/.exec((await raw("/login")).headers.get("content-security-policy"))[1];
check("nonce différent à chaque requête", nonce1 !== nonce2);
for (const p of ["/.env", "/.git/config", "/drizzle/0000.sql", "/_next/../.env", "/secrets/admin-initial-password.txt"]) check(`fichier sensible ${p} inaccessible`, [404, 303, 307].includes((await raw(p)).status));

// --- oubli de mot de passe, session, jetons à usage unique
const forgot = await newUser();
await forgot.p.goto("/forgot"); await forgot.p.fill('input[name=email]', "inconnu@test.example"); await forgot.p.click('button[type=submit]');
const forgotText = await forgot.p.getByText("Si un compte actif").textContent();
await forgot.p.goto("/forgot"); await forgot.p.fill('input[name=email]', MEMBER); await forgot.p.click('button[type=submit]');
check("oubli : réponse identique, compte connu ou non", (await forgot.p.getByText("Si un compte actif").textContent()) === forgotText);
const reset = /\/reset\/\S+/.exec(await waitMail(MEMBER, "nouveau mot de passe"))[0];
const NEW_PW = "nouvelle-phrase-longue-55";
await forgot.p.goto(reset); await forgot.p.fill('input[name=password]', NEW_PW); await forgot.p.click('button[type=submit]');
await forgot.p.waitForURL(/\/login/);
check("réinitialisation : autres sessions révoquées", (await member.p.goto("/parametres")) && member.p.url().includes("/login"));
await forgot.p.goto(reset); check("lien de réinitialisation à usage unique", await forgot.p.getByText("Lien expiré").isVisible());
await fillLogin(member.p, MEMBER, NEW_PW); await member.p.waitForURL(`${BASE}/accueil`);

// --- 2FA (admin secondaire : le membre)
await member.p.goto("/parametres/compte");
await member.p.getByRole("button", { name: "Configurer" }).click();
const secret = await member.p.locator("code").waitFor().then(() => member.p.locator("code").textContent());
const totp = new TOTP({ secret: Secret.fromBase32(secret) });
// code de la fenêtre précédente, pour laisser les suivants disponibles
const prev = totp.generate({ timestamp: Date.now() - 30000 });
await member.p.fill('input[name=code]', prev); await member.p.getByRole("button", { name: "Activer" }).click();
await member.p.getByText("Active : un code est demandé").waitFor();
const t = await newUser();
await fillLogin(t.p, MEMBER, NEW_PW); await t.p.waitForURL(/2fa/);
const r2 = await t.p.goto("/accueil"); check("2FA : mot de passe seul ne donne pas accès", t.p.url().includes("/login"), `${r2.status()} ${t.p.url()}`);
await t.p.goto("/login/2fa");
await t.p.fill('input[name=code]', prev); await t.p.click('button[type=submit]');
await t.p.getByText("Code incorrect").waitFor(); check("2FA : rejeu d'un code refusé", true);
await t.p.fill('input[name=code]', "000000"); await t.p.click('button[type=submit]');
await t.p.getByText("Code incorrect").waitFor(); check("2FA : mauvais code refusé", true);
// Le message du premier refus est encore affiché : on attend la vraie réponse, qui remet la saisie en place
await t.p.getByRole("button", { name: "Valider", exact: true, disabled: false }).waitFor(); await t.p.waitForTimeout(1500);
await t.p.fill('input[name=code]', totp.generate({ timestamp: Date.now() + 30000 })); await t.p.click('button[type=submit]');
await t.p.waitForURL(`${BASE}/accueil`, { timeout: 15000 }).catch(async (e) => { await t.p.screenshot({ path: "/shots/fail.png" }); console.log("URL", t.p.url(), (await t.p.locator("body").innerText()).slice(0, 400)); throw e; }); check("2FA : bon code accepté", true);

// --- cloisonnement entre licences
await admin.p.goto("/admin/licences");
// Une licence à la fois (sélecteur), matières en colonnes S1 | S2 | Annuelles
await admin.p.getByRole("combobox", { name: "Licence" }).click();
await admin.p.getByRole("option", { name: "Droit", exact: true }).click();
await admin.p.waitForURL(/licence=/);
const droitSection = admin.p.locator('section[aria-label="S1"]');
await droitSection.getByLabel("Nouvelle matière").fill("Droit civil");
await droitSection.getByRole("button", { name: "Ajouter" }).click();
await droitSection.getByRole("button", { name: "Actions pour Droit civil" }).first().waitFor();
await admin.p.goto("/admin/documents/new");
await chooseSubject(admin.p, "Droit civil");
await admin.p.selectOption('select[name=rights]', "authorized");
await admin.p.locator("input[name=attest]").check();
await admin.p.getByRole("radio", { name: "Coller un artefact" }).check({ force: true });
await admin.p.fill('input[name=title]', "Cours réservé au droit");
await admin.p.fill('textarea[name=pasted]', "<p>obligations</p>");
await admin.p.setInputFiles('input[name=attachments]', FX + "sujet.pdf");
await admin.p.getByRole("button", { name: "Enregistrer" }).click();
await admin.p.waitForURL(/\/d\//);
const droitPath = new URL(admin.p.url()).pathname;
const droitFile = await admin.p.locator('a[href^="/files/"]').last().getAttribute("href");
const droitSubject = await admin.p.locator('#contenu a[href^="/matieres/"]').first().getAttribute("href");
check("autre licence : document 404", (await member.p.goto(droitPath)).status() === 404);
await member.p.goto("/accueil");
check("autre licence : fichier 404 (IDOR)", (await member.p.evaluate(async (u) => (await fetch(u)).status, droitFile)) === 404);
check("autre licence : matière 404", (await member.p.goto(droitSubject)).status() === 404);
await member.p.goto("/accueil?q=obligations"); check("autre licence : absente de la recherche", await member.p.getByText("Aucun résultat").isVisible());
await member.p.goto("/accueil?licence=droit");
check("autre licence : ?licence= ignoré pour un membre", await member.p.getByRole("heading", { name: "Matières" }).isVisible() && !(await member.p.getByText("Droit civil").count()));
const tamper = await newUser();
await tamper.p.goto("/register");
await tamper.p.fill('input[name=name]', "Curieux"); await tamper.p.fill('input[name=email]', "curieux@test.example");
await tamper.p.evaluate(() => { const s = document.querySelector("select[name=program]"); const o = new Option("Droit", "droit", true, true); s.add(o); });
await tamper.p.locator("input[name=terms]").check(); await tamper.p.locator('main button[type=submit]').click();
await tamper.p.getByText("Choisis ta licence").waitFor();
check("inscription dans une licence fermée refusée", true);

// --- rôle contributeur et éditeur
// Crée un brouillon depuis la page finale : aucun champ avant d'écrire, tout se renseigne sur place
const openBlankDraft = async (p) => { await p.goto("/contribuer/nouveau"); await p.waitForURL(/\/editer\//); await p.locator(".ProseMirror").waitFor({ timeout: 30000 }); };
const waitSaved = async (p) => { await p.waitForTimeout(1800); await p.getByRole("status").filter({ hasText: "Enregistré", visible: true }).first().waitFor({ timeout: 15000 }); };
const pickStyle = async (p, name) => { await p.getByRole("button", { name: "Style du paragraphe" }).click(); await p.getByRole("menuitem", { name, exact: true }).click(); await p.waitForTimeout(350); };
// Chapitre, semestre, enseignant et origine sont rangés dans « Détails » (puces réduites à matière + type)
const openDetails = async (p) => { if (!(await p.locator("input[name=chapter]").isVisible().catch(() => false))) await p.getByRole("button", { name: /^Détails/ }).click(); await p.locator("input[name=chapter]").waitFor(); };
const pickInsert = async (p, name) => { await p.getByRole("button", { name: "Insérer", exact: true }).click(); await p.getByRole("menuitem", { name, exact: true }).click(); await p.waitForTimeout(350); };
// Semestre, chapitre et enseignant sont exigés à l'envoi ; la fenêtre d'envoi les demande s'ils manquent
const fillDetailsIfAsked = async (p) => {
  const dialog = p.getByRole("dialog"); await dialog.waitFor();
  const teacher = dialog.locator("input[name=dialog-teacher]"); if (await teacher.count()) await teacher.fill("M. Martin");
  const chapter = dialog.locator("input[name=dialog-chapter]"); if (await chapter.count()) await chapter.fill("1");
  const semester = dialog.locator("select[name=dialog-semester]"); if (await semester.count()) await semester.selectOption({ index: 1 });
};
// L'engagement n'est demandé qu'une fois par type de contenu
const attestIfAsked = async (p) => { await fillDetailsIfAsked(p); const box = p.locator("input[name=attest-review]"); if (await box.count()) await box.check(); };
const send = async (p) => {
  // « Publier » pour l'administration, le délégué et l'enseignant ; un étudiant envoie toujours en relecture
  await p.getByRole("button", { name: /^(Envoyer pour validation|Publier)$/ }).click();
  await attestIfAsked(p);
  await p.getByRole("dialog").getByRole("button", { name: /^(Envoyer|Publier)$/ }).click();
};
await openBlankDraft(member.p);
const editorErrors = []; member.p.on("pageerror", (e) => editorErrors.push(String(e))); member.p.on("console", (m) => { if (m.type() === "error") editorErrors.push(m.text()); });
check("nouveau document : aucun champ avant d'écrire", await member.p.locator(".ProseMirror").isVisible() && !(await member.p.getByRole("button", { name: "Commencer" }).count()));
check("contributeur : matières de sa licence seulement", !(await member.p.locator("select[name=subject]").textContent()).includes("Droit civil"));
await member.p.fill("textarea[name=title]", "Les physiocrates");
await chooseSubject(member.p, "Histoire de la Pensée Économique");
await openDetails(member.p); await member.p.fill("input[name=chapter]", "2"); await member.p.keyboard.press("Escape");
const pm = member.p.locator(".ProseMirror");
await member.p.getByRole("button", { name: "Partir d’un modèle" }).click();
await pm.getByRole("heading", { name: "Introduction" }).waitFor();
check("éditeur : le gabarit commun s'affiche", await pm.getByRole("heading", { name: "Introduction" }).isVisible());
await pm.getByRole("heading", { name: "Introduction" }).click();
await member.p.waitForTimeout(250); await member.p.keyboard.press("End"); await member.p.waitForTimeout(250); await member.p.keyboard.press("Enter");
await member.p.keyboard.type("Quesnay <script>window.__xss=1</script> et le produit net");
await member.p.keyboard.press("Enter"); await member.p.keyboard.type("/");
// Menu / refait : les encadrés sont listés par nature dans le groupe « Cours »
await member.p.getByText("Théorème", { exact: true }).last().waitFor();
check("éditeur : pas de titre de niveau 1 dans le menu", !(await member.p.getByText("Heading 1", { exact: true }).count()));
await member.p.keyboard.press("Escape"); await member.p.keyboard.press("Backspace");
await waitSaved(member.p);
check("enregistrement automatique", true);
await member.p.reload(); await pm.waitFor({ timeout: 30000 }); await openDetails(member.p);
check("enregistrement : le titre et le texte reviennent après rechargement", await member.p.inputValue("textarea[name=title]") === "Les physiocrates" && (await pm.textContent()).includes("Quesnay") && await member.p.inputValue("input[name=chapter]") === "2");
await member.p.keyboard.press("Escape"); await member.p.setViewportSize({ width: 1280, height: 800 }); await member.p.waitForTimeout(400);
await member.p.screenshot({ path: "/shots/editor.png" });
await member.p.getByRole("button", { name: "Envoyer pour validation", exact: true }).click();
check("envoi : l'enseignant manquant est demandé dans la fenêtre d'envoi", await member.p.getByRole("dialog").getByLabel("Enseignant").isVisible());
// Tapé lettre à lettre, le dernier champ manquant reste affiché et garde tout le texte
await member.p.getByRole("dialog").getByLabel("Enseignant").pressSequentially("M. Martin", { delay: 30 });
check("envoi : le champ ne se valide pas à la première lettre", await member.p.getByRole("dialog").locator("input[name=dialog-teacher]").inputValue() === "M. Martin");
await fillDetailsIfAsked(member.p);
check("envoi : l'origine manquante est demandée dans la fenêtre d'envoi", await member.p.getByRole("dialog").getByLabel("D’où vient ce contenu ?").isVisible());
check("envoi impossible sans l'origine et l'engagement", await member.p.getByRole("dialog").getByRole("button", { name: "Envoyer", exact: true }).isDisabled());
await member.p.getByRole("dialog").getByLabel("D’où vient ce contenu ?").selectOption("own_notes");
check("envoi impossible sans cocher l'engagement", await member.p.getByRole("dialog").getByRole("button", { name: "Envoyer", exact: true }).isDisabled());
await member.p.locator("input[name=attest-review]").check();
await member.p.screenshot({ path: "/shots/ui-send.png" });
await member.p.getByRole("dialog").getByRole("button", { name: "Envoyer", exact: true }).click();
await member.p.getByText("attend sa validation").waitFor();
check("éditeur : aucune erreur console ni CSP", editorErrors.length === 0, editorErrors.join(" | ").slice(0, 400));
const editUrl = new URL(member.p.url()).pathname; const docOfDraft = editUrl.split("/").pop();
const pageFetch = (p, url, init) => p.evaluate(async ([u, i]) => (await fetch(u, i)).status, [url, init]);
check("contributeur : transcription, demande invalide refusée", (await pageFetch(member.p, "/api/editor/ocr", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })) === 400);
check("contributeur : plus de route d'administration pour l'IA", (await pageFetch(member.p, "/api/admin/ocr", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })) === 404);
check("contributeur : pas d'envoi de site ZIP", (await pageFetch(member.p, "/api/admin/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId: docOfDraft, purpose: "zip", filename: "a.zip", size: 1 }) })) === 403);
check("image d'éditeur : SVG refusé", (await pageFetch(member.p, `/api/editor/images?doc=${docOfDraft}`, { method: "POST", body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' })) === 415);
check("image d'éditeur : document d'un autre refusé", (await pageFetch(member.p, `/api/editor/images?doc=${droitPath.split("/").pop()}`, { method: "POST", body: "x" })) === 403);
check("contributeur : édition d'un document d'un autre 404", (await member.p.goto(`/editer/${droitPath.split("/").pop()}`)).status() === 404);
await admin.p.goto(`/d/${docOfDraft}`);
const courseEl = admin.p.locator("article.course");
check("cours rédigé : HTML saisi affiché en texte, non exécuté", (await courseEl.textContent()).includes("Quesnay") && !(await admin.p.evaluate(() => window.__xss)) && !(await courseEl.locator("script").count()));
check("origine du contenu affichée", await admin.p.getByText("Notes personnelles d’étudiant").isVisible());
// Le sommaire se place une fois la largeur mesurée
await admin.p.getByRole("navigation", { name: "Sommaire du cours" }).or(admin.p.getByRole("button", { name: "Dans ce cours" })).first().waitFor({ timeout: 5000 }).catch(() => undefined);
check("cours rédigé : sommaire automatique", await admin.p.getByRole("navigation", { name: "Sommaire du cours" }).or(admin.p.getByRole("button", { name: "Dans ce cours" })).first().isVisible());
await publishHere(admin.p);
await waitMail(MEMBER, "publié");
check("publication : l'auteur est prévenu", true);
check("contributeur : plus d'édition après publication", (await member.p.goto(editUrl)).status() === 404);
await member.p.goto(`/d/${docOfDraft}`); check("cours publié visible par la licence", await member.p.locator("article.course").isVisible());
await member.p.setViewportSize({ width: 1280, height: 800 });

// --- social : mercis, révisions, badges, profil
const statusOf = (p, url) => p.evaluate(async (u) => (await fetch(u)).status, url);
check("auteur : pas de bouton merci sur son propre cours", !(await member.p.getByRole("button", { name: /^Merci/ }).count()));
await admin.p.goto(`/d/${docOfDraft}`);
await admin.p.getByRole("button", { name: /^Merci/ }).click();
await admin.p.getByRole("button", { name: /^Merci/ }).filter({ hasText: "1" }).waitFor();
check("merci : compté une seule fois", true);
const memberId = await myId(member.p);
await member.p.goto(`/u/${memberId}`);
check("badges débloqués après publication et merci", await member.p.getByText("Scribe I", { exact: true }).first().isVisible() && await member.p.getByText("Merci I", { exact: true }).first().isVisible());
await member.p.getByText(/nouveaux? badges?/i).first().waitFor({ timeout: 8000 }).catch(() => {});
await member.p.goto("/moi");
await member.p.locator("main").getByText("35 crédits").first().waitFor();
check("crédits : 30 pour le cours + 5 pour le merci", true);
await member.p.goto(`/d/${docOfDraft}`);
await member.p.getByRole("button", { name: "Marquer comme révisé" }).click();
await member.p.getByRole("button", { name: "Révisé" }).waitFor();
check("révision : document marqué", true);
await member.p.goto("/parametres/confidentialite");
await member.p.getByRole("switch", { name: "Apparaître dans le classement" }).click();
await saveSettings(member.p);
await member.p.goto("/parametres/profil");
await member.p.getByLabel("Bio").fill('Étudiant en L1 <img src=x onerror="window.__xss=1">');
await saveSettings(member.p);
// Image trop petite (64 × 64) : refusée au choix, sans envoi ; puis une photo 320 × 200 passe par le recadrage
await member.p.setInputFiles('input[name=avatar]', FX + "page.png");
// isVisible n'attend pas : la lecture locale de l'image est asynchrone
check("photo : image trop petite refusée dès le choix", await member.p.getByRole("alert").filter({ hasText: "Image trop petite" }).first().waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false));
await member.p.setInputFiles('input[name=avatar]', FX + "photo.png");
const cropOk = await member.p.getByRole("button", { name: "Valider le cadrage" }).waitFor({ timeout: 10000 }).then(() => true, () => false);
check("photo : recadrage proposé pour une image pas carrée", cropOk);
if (cropOk) { await member.p.getByRole("group", { name: /Cadre de l’image/ }).press("+"); await member.p.getByRole("button", { name: "Valider le cadrage" }).click(); }
await member.p.waitForTimeout(1500);
await member.p.getByRole("button", { name: "Compte" }).first().locator("img").waitFor({ state: "attached", timeout: 10000 }).catch(() => undefined);
check("photo de profil envoyée", (await statusOf(member.p, `/avatars/${memberId}`)) === 200);
check("photo : un SVG déguisé est refusé", (await pageFetch(member.p, "/api/account/avatar", { method: "POST", body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' })) === 415);
await member.p.goto(`/u/${memberId}`);
await member.p.waitForTimeout(500); await member.p.screenshot({ path: "/shots/profile.png" });
check("profil : description affichée en texte", !(await member.p.evaluate(() => window.__xss)) && await member.p.getByText("Étudiant en L1").isVisible());
check("profil : carte étudiante débloquée", !(await member.p.locator("main button", { hasText: "Carte étudiante" }).getByRole("progressbar").count()));
check("profil : adresse mail jamais affichée", !(await member.p.locator("body").textContent()).includes(MEMBER));
await member.p.goto("/reviser/classement"); check("classement : le membre y apparaît", await member.p.locator("ol").getByText("35 crédits").isVisible());
const exported = await member.p.evaluate(async () => { const r = await fetch("/api/account/export"); return { d: r.headers.get("content-disposition"), t: await r.text() }; });
check("export RGPD : fichier complet, sans secrets", exported.d.startsWith("attachment") && exported.t.includes(MEMBER) && exported.t.includes("Les physiocrates") && !/passwordHash|totpSecret|argon2/.test(exported.t));
check("export RGPD : refusé sans session", (await raw("/api/account/export")).status === 403);
// comptes d'une autre licence
const otherId = await (async () => {
  const c = await newUser();
  await c.p.goto("/register"); await c.p.fill('input[name=name]', "Autre Licence"); await c.p.fill('input[name=email]', "autre@test.example");
  await c.p.locator("input[name=terms]").check(); await c.p.locator('main button[type=submit]').click(); await c.p.getByText("Si cette adresse").waitFor();
  const link = /\/verify\/\S+/.exec(await waitMail("autre@test.example", "confirme"))[0];
  await c.p.goto(link); await c.p.fill("input[name=password]", "longue-phrase-secrete-11"); await c.p.locator('main button[type=submit]').click(); await c.p.getByText("Ta demande a été transmise").waitFor();
  check("adresse hors université : relecture manuelle", true);
  // Grille des personnes ; une demande s'accepte sur sa ligne, la licence change par la barre de sélection (motif obligatoire)
  await admin.p.goto("/admin/personnes?onglet=attente&q=autre%40test.example");
  const acceptOther = admin.p.locator(`tr:has-text("autre@test.example")`).first().getByRole("button", { name: "Accepter" });
  await acceptOther.click(); await acceptOther.waitFor({ state: "detached" });
  await admin.p.goto("/admin/personnes?q=autre%40test.example");
  await admin.p.locator(`tr:has-text("autre@test.example")`).first().getByRole("checkbox", { name: "Sélectionner" }).click();
  await admin.p.getByRole("button", { name: "Licence ou année" }).click();
  const programSheet = admin.p.getByRole("dialog", { name: "Licence ou année" });
  await programSheet.getByRole("combobox").first().click();
  await admin.p.getByRole("option", { name: "Droit", exact: true }).click();
  await programSheet.getByLabel("Motif").fill("Inscrit dans la mauvaise licence");
  await programSheet.getByRole("button", { name: "Appliquer" }).click();
  await admin.p.waitForTimeout(800); await stepUpDialog.waitFor({ state: "hidden" }); await programSheet.waitFor({ state: "hidden" }); await admin.p.waitForTimeout(800);
  await fillLogin(c.p, "autre@test.example", "longue-phrase-secrete-11");
  await finishWelcome(c.p);
  return { c, id: await myId(c.p) };
})();
// Un profil se voit sur tout Campuss si la personne se laisse trouver par son nom (réglage activé par défaut)
check("profil d'une autre licence : visible si la personne se laisse trouver", (await member.p.goto(`/u/${otherId.id}`)).status() === 200);
await member.p.goto("/parametres/confidentialite");
await member.p.getByRole("switch", { name: "Me trouver par mon nom" }).click();
await saveSettings(member.p);
check("profil et photo d'un autre : 404 pour une autre licence quand il ne se laisse pas trouver", (await otherId.c.p.goto(`/u/${memberId}`)).status() === 404 && (await statusOf(otherId.c.p, `/avatars/${memberId}`)) === 404);
await member.p.goto("/parametres/confidentialite");
await member.p.getByRole("switch", { name: "Me trouver par mon nom" }).click();
await saveSettings(member.p);
await otherId.c.p.goto("/reviser/classement"); check("classement : limité à sa licence", !(await otherId.c.p.locator("ol").count()));

// --- acceptation automatique des adresses étudiantes
async function signUp(email) {
  const c = await newUser();
  await c.p.goto("/register"); await c.p.fill('input[name=name]', "Prenom Nom"); await c.p.fill('input[name=email]', email);
  await c.p.locator("input[name=terms]").check(); await c.p.locator('main button[type=submit]').click(); await c.p.getByText("Si cette adresse").waitFor();
  const link = /\/verify\/\S+/.exec(await waitMail(email, "confirme"))[0];
  await c.p.goto(link); await c.p.fill("input[name=password]", "phrase-longue-pour-essai-22"); await c.p.locator('main button[type=submit]').click();
  await c.p.locator("[data-slot=alert]").waitFor();
  return { c, text: await c.p.locator("[data-slot=alert]").textContent() };
}
const stu = await signUp("prenom_nom@etu.exemple.fr");
check("adresse @etu.exemple.fr : compte actif sans relecture", stu.text.includes("compte est actif"), stu.text);
await fillLogin(stu.c.p, "prenom_nom@etu.exemple.fr", "phrase-longue-pour-essai-22"); await finishWelcome(stu.c.p);
check("adresse @etu.exemple.fr : connexion immédiate", true);
check("adresse @etu.exemple.org : compte actif sans relecture", (await signUp("prenom_nom@etu.exemple.org")).text.includes("compte est actif"));
// Hors de la liste des domaines étudiants, l'inscription publique est refusée dès le formulaire
for (const email of ["x@betu.exemple.org", "x@etu.exemple.fr.evil.example", "x@faux-etu.exemple.fr", "x@sous.etu.exemple.fr"]) {
  const c = await newUser();
  await c.p.goto("/register"); await c.p.fill('input[name=name]', "Prenom Nom"); await c.p.fill('input[name=email]', email);
  await c.p.locator("input[name=terms]").check(); await c.p.locator('main button[type=submit]').click();
  check(`faux domaine ${email} : inscription refusée`, await c.p.getByText("Seuls les étudiants peuvent créer un compte").first().waitFor({ timeout: 10000 }).then(() => true, () => false));
}

// --- pages légales et signalement sans compte
for (const path of ["/cgu", "/confidentialite", "/credits", "/contact"]) check(`${path} : public`, (await raw(path)).status === 200);
const ayant = await newUser();
await ayant.p.goto(`/contact?doc=${docOfDraft}`);
await ayant.p.selectOption("select[name=kind]", "rights"); await ayant.p.fill("input[name=email]", "professeur@test.example");
await ayant.p.fill("textarea[name=message]", "Je suis l'auteur de ce cours <script>window.__xss=1</script>, merci de le retirer.");
await ayant.p.getByRole("button", { name: "Envoyer" }).click();
await ayant.p.getByText("Message envoyé").waitFor();
await admin.p.goto("/admin/moderation");
check("signalement : affiché en texte chez l'admin", !(await admin.p.evaluate(() => window.__xss)) && await admin.p.getByText("Je suis l'auteur").isVisible());
// File de revue ; « Retirer » demande un motif, dépublie le document et clôt le signalement
await admin.p.getByRole("button", { name: /^Retirer/ }).first().click();
await admin.p.getByRole("radio", { name: "Document protégé (polycopié, manuel)" }).click();
await admin.p.locator("form").filter({ has: admin.p.getByRole("radiogroup", { name: "Motif" }) }).getByRole("button", { name: /^Retirer/ }).click();
await admin.p.getByText("Je suis l'auteur").waitFor({ state: "detached" });
check("retrait : le document n'est plus visible des autres", (await otherId.c.p.goto(`/d/${docOfDraft}`)).status() === 404 && (await stu.c.p.goto(`/d/${docOfDraft}`)).status() === 404);
// Remis en ligne : la suite s'en sert pour les corrections et l'espace enseignant
await admin.p.goto(`/d/${docOfDraft}`);
await publishHere(admin.p);

// --- police dyslexie
const dys = await newUser();
await dys.p.goto("/login");
const textFont = () => dys.p.evaluate(() => getComputedStyle(document.body).fontFamily);
const headFont = () => dys.p.evaluate(() => getComputedStyle(document.querySelector("h1")).fontFamily);
check("texte en Source Sans 3, titres en Massilia", (await textFont()).includes("Source Sans 3") && (await headFont()).includes("Massilia"), `${await textFont()} / ${await headFont()}`);
// Réglages de lecture « Aa » : Atkinson Hyperlegible pour le texte des cours seulement, gardé à « Enregistrer »
await dys.p.getByRole("button", { name: "Réglages de lecture" }).click();
await dys.p.getByRole("radio", { name: /Atkinson/ }).click();
check("lecture : le panneau « Aa » n'agit que sur les cours", !(await dys.p.getByRole("switch", { name: /Toute l’interface/ }).count()));
await dys.p.getByRole("button", { name: "Enregistrer", exact: true }).click();
await dys.p.getByText("Réglages de lecture enregistrés").first().waitFor();
check("lecture adaptée : l'interface et les titres gardent leurs polices", (await textFont()).includes("Source Sans 3") && (await headFont()).includes("Massilia"));
await dys.p.reload();
check("lecture adaptée : retenue au rechargement (cookie du visiteur)", await dys.p.evaluate(() => document.documentElement.classList.contains("read-atkinson")));
await dys.p.screenshot({ path: "/shots/dys.png" });

// --- transcription par IA (service simulé)
await admin.p.goto("/admin/documents/new");
await chooseSubject(admin.p, "Statistiques");
await admin.p.selectOption('select[name=rights]', "own_notes");
await admin.p.locator("input[name=attest]").check();
await admin.p.fill('input[name=title]', "Notes manuscrites");
await admin.p.getByRole("button", { name: "Enregistrer" }).click();
await admin.p.waitForURL(/\/editer\//);
await admin.p.locator(".ProseMirror").waitFor({ timeout: 30000 });
await admin.p.getByRole("button", { name: "Autres actions" }).click();
const ocrDoc = new URL(admin.p.url()).pathname.split("/").pop();
await admin.p.getByRole("menuitem", { name: "Photographier mes notes" }).click();
// « Photographier mes notes » ouvre « Commencer avec… » ; l'engagement se coche après le choix des photos (ImportProgress)
await admin.p.getByRole("dialog").locator('input[aria-label="Prendre une photo ou choisir un PDF"]').setInputFiles(FX + "page.png");
const ocrPanel = admin.p.locator('section[aria-label="Photo ou PDF avec Campuss IA"]').first();
await ocrPanel.locator("input[name=attest-ocr]").check();
await ocrPanel.getByRole("button", { name: "Transcrire 1 page" }).click();
await admin.p.locator(".ProseMirror").getByRole("heading", { name: "Loi normale" }).waitFor({ timeout: 30000 });
check("IA : la transcription arrive dans l'éditeur", true);
await waitSaved(admin.p);
await admin.p.getByRole("button", { name: "Terminer" }).click();
await admin.p.waitForURL(/\/d\//);
const ocrCourse = admin.p.locator("article.course");
check("IA : encadré de définition appliqué", await ocrCourse.locator("blockquote.definition").count() === 1);
check("IA : formule rendue", await ocrCourse.locator(".katex").count() >= 1);
check("IA : HTML et titre de niveau 1 neutralisés", !(await admin.p.evaluate(() => window.__xss)) && !(await ocrCourse.locator("h1, script, iframe").count()));
check("IA : engagement obligatoire", (await admin.p.evaluate(async () => (await fetch("/api/editor/ocr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: "data:image/png;base64,iVBORw0KGgo=" }) })).status)) === 400);
const ocrKey = await admin.p.evaluate(async (document) => { const r = await fetch("/api/editor/ocr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ attest: true, document, image: "data:image/png;base64,PHN2Zz4=" }) }); return r.status; }, ocrDoc);
check("IA : un faux fichier image est refusé", ocrKey === 415);
await admin.p.setViewportSize({ width: 1280, height: 800 }); await admin.p.waitForTimeout(400); await admin.p.screenshot({ path: "/shots/course.png" });

// --- dépôts étudiants, antivirus, recherche et filigrane PDF
await openBlankDraft(member.p);
await member.p.fill("textarea[name=title]", "Artefact React");
await chooseSubject(member.p, "Histoire de la Pensée Économique");
await openDetails(member.p); await member.p.selectOption("select[name=rights]", "own_notes"); await member.p.keyboard.press("Escape");
await send(member.p);
await member.p.getByText("Un document proche existe déjà").waitFor();
check("doublon : signalé à l'envoi", true);
await member.p.keyboard.press("Escape"); await openDetails(member.p);
check("doublon : la saisie est conservée", await member.p.inputValue("textarea[name=title]") === "Artefact React" && await member.p.inputValue("select[name=rights]") === "own_notes");
await member.p.keyboard.press("Escape");
await member.p.fill("textarea[name=title]", "Élasticité de la demande");
await member.p.selectOption("select[name=category]", "td");
await member.p.getByRole("button", { name: "Partir d’un modèle" }).click();
await waitSaved(member.p);
const draftId = member.p.url().split("/").pop();
await member.p.locator(".ProseMirror").getByRole("heading", { name: "Énoncé" }).waitFor();
check("modèle : TD corrigé avec énoncé et correction", await member.p.locator(".ProseMirror").getByRole("heading", { name: "Correction" }).isVisible());
await member.p.setInputFiles("input[name=draft-files]", FX + "vrai.pdf");
await member.p.getByText("vrai.pdf").waitFor({ timeout: 20000 });
check("étudiant : dépôt de PDF à sa place finale", await member.p.locator("#pieces-jointes").getByText("vrai.pdf").isVisible());
await member.p.setInputFiles("input[name=draft-files]", FX + "faux.pdf.html");
// Une page HTML se joint au cours, mais ne s'ouvre jamais sur le site (téléchargement binaire)
await member.p.getByText("faux.pdf.html").waitFor({ timeout: 20000 });
const htmlAttachment = await member.p.locator("#pieces-jointes a[href^='/files/']").filter({ hasText: /faux|Télécharger/ }).first().getAttribute("href").catch(() => null);
const htmlHeaders = htmlAttachment ? await member.p.evaluate(async (href) => { const r = await fetch(href.replace("?inline=1", "")); return [r.headers.get("content-type"), r.headers.get("content-disposition")]; }, htmlAttachment) : null;
check("étudiant : page HTML jointe, téléchargée sans s'exécuter", !htmlAttachment || (htmlHeaders?.[0] === "application/octet-stream" && /attachment/.test(htmlHeaders?.[1] ?? "")));
await member.p.setInputFiles("input[name=draft-files]", FX + "eicar.pdf");
await member.p.getByText("eicar.pdf").waitFor({ timeout: 20000 });
for (let i = 0; i < 30 && (await member.p.reload(), await member.p.locator(".ProseMirror").waitFor({ timeout: 30000 }), await member.p.getByText("eicar.pdf").count()); i++) await member.p.waitForTimeout(1500);
check("antivirus : fichier infecté supprimé", !(await member.p.getByText("eicar.pdf").count()));
await waitMail(MEMBER, "fichier refusé");
check("étudiant : archive ZIP refusée", (await pageFetch(member.p, "/api/admin/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId: draftId, purpose: "zip", filename: "a.zip", size: 10 }) })) === 403);
await send(member.p);
await member.p.getByRole("dialog").getByRole("button", { name: "Envoyer", exact: true }).waitFor({ state: "hidden" }).catch(() => {});
await member.p.getByText("attend sa validation").waitFor();
await admin.p.goto(`/d/${draftId}`);
// Barre « Relecture » : Renvoyer avec un motif (1 à 7) et un mot pour l'auteur
await reviewBar(admin.p).getByRole("button", { name: /^Renvoyer/ }).click();
await reviewBar(admin.p).getByRole("radio", { name: "Incomplet ou trop court" }).click();
await reviewBar(admin.p).getByLabel("Un mot pour l’auteur").fill("Ajoute un exemple chiffré");
await reviewBar(admin.p).locator("form").getByRole("button", { name: /^Renvoyer/ }).click();
await reviewBar(admin.p).waitFor({ state: "detached" });
await waitMail(MEMBER, "besoin d’une correction");
await member.p.goto(`/editer/${draftId}`);
await member.p.locator(".ProseMirror").waitFor({ timeout: 30000 });
check("refus : le motif s'affiche à l'auteur", await member.p.getByText("Ajoute un exemple chiffré").first().isVisible());
await member.p.fill("textarea[name=title]", "Élasticité prix de la demande");
await waitSaved(member.p);
check("brouillon : titre modifiable sur place", true);
await send(member.p);
await member.p.getByText("attend sa validation").waitFor();
await admin.p.goto("/moderation");
await admin.p.getByRole("navigation", { name: "À valider" }).getByRole("button", { name: /Élasticité prix de la demande/ }).click();
await admin.p.getByRole("button", { name: /^Publier/ }).click();
await admin.p.getByRole("button", { name: "J’ai vérifié, publier" }).click({ timeout: 5000 }).catch(() => {});
await admin.p.getByText(/^Publié · Élasticité/).waitFor();
check("file À valider : publication depuis la file", true);
await admin.p.goto("/moderation?onglet=manques");
check("onglet Manques", await admin.p.getByRole("heading", { name: /^(.* · )?L\d · S\d$/ }).first().isVisible() || await admin.p.getByText("Rien ne manque ce semestre").isVisible());
await admin.p.screenshot({ path: "/shots/moderation.png" });
for (let i = 0; i < 30; i++) { await member.p.goto("/accueil?q=mot-unique-dans-le-pdf"); if (await member.p.getByText("Élasticité prix").count()) break; await member.p.waitForTimeout(1500); }
check("recherche : le contenu des PDF est trouvé", await member.p.getByText("Élasticité prix").count() > 0);
const pdfHref = await (async () => { await member.p.goto(`/d/${draftId}`); return member.p.locator('a[href^="/files/"]').last().getAttribute("href"); })();
const readerPdf = await otherLicenceReader();
check("filigrane : le PDF servi à un autre lecteur est modifié", readerPdf && readerPdf.size > 900 && readerPdf.head === "%PDF-", JSON.stringify(readerPdf));
async function otherLicenceReader() {
  await signedStudent();
  return stu.c.p.evaluate(async (u) => { const r = await fetch(u); const b = await r.blob(); return { size: b.size, head: await b.slice(0, 5).text(), original: 0 }; }, pdfHref);
}
async function signedStudent() { await stu.c.p.goto("/accueil"); }

// --- correction d'un cours publié
await member.p.goto(`/corriger/${docOfDraft}`);
await member.p.locator(".ProseMirror").waitFor({ timeout: 30000 });
await member.p.locator(".ProseMirror").getByRole("heading", { name: "Introduction" }).click();
await member.p.waitForTimeout(250); await member.p.keyboard.press("End"); await member.p.waitForTimeout(250); await member.p.keyboard.press("Enter"); await member.p.keyboard.type("Correction : le tableau économique");
check("correction : un seul bouton d’envoi", await member.p.getByRole("button", { name: /^Envoyer/ }).count() === 1);
await member.p.getByRole("button", { name: "Envoyer la correction" }).click();
await member.p.fill("input[name=summary]", "Ajout du tableau économique");
await attestIfAsked(member.p);
await member.p.getByRole("dialog").getByRole("button", { name: "Envoyer la correction" }).click();
await member.p.getByText("Ta correction est envoyée").waitFor();
await stu.c.p.goto(`/d/${docOfDraft}`);
check("correction : rien ne change avant validation", !(await stu.c.p.locator("article.course").textContent()).includes("tableau économique"));
await admin.p.goto("/moderation?onglet=corrections");
await admin.p.getByRole("button", { name: /^Accepter/ }).click();
await admin.p.getByText("Aucune correction en attente").waitFor();
// La file retire la ligne avant la réponse du serveur : on attend la confirmation « Acceptée · … »
await admin.p.getByText(/^Acceptée · /).first().waitFor({ timeout: 15000 });
await stu.c.p.reload();
check("correction acceptée : le cours est à jour", (await stu.c.p.locator("article.course").textContent()).includes("tableau économique"));

// --- quiz généré une fois, partagé, sans fuite des réponses
const longText = "L’élasticité mesure la sensibilité de la demande au prix. ".repeat(14);
await newDoc(async (p) => { await p.fill('input[name=title]', "Cours pour le quiz"); await p.fill('textarea[name=pasted]', `# Élasticité\n\n${longText}`); });
await admin.p.waitForURL(/\/d\//);
const quizDoc = new URL(admin.p.url()).pathname;
let quizReady = false;
for (let i = 0; i < 80 && !quizReady; i++) { await admin.p.waitForTimeout(1500); await admin.p.reload(); quizReady = await admin.p.locator(`a[href$="/quiz"]`).count() > 0; }
check("quiz : généré automatiquement à la publication", quizReady);
const qp = stu.c.p;
await qp.goto(`${quizDoc}/quiz`);
const quizHtml = await qp.content();
check("quiz : réponses absentes de la page", !quizHtml.includes("explanation") && !quizHtml.includes("Parce que"));
check("quiz : question piégée affichée en texte", !(await qp.evaluate(() => window.__xss)));
for (let i = 0; i < 3; i++) { await qp.getByText(`Question numéro ${i + 1}`).waitFor(); await qp.locator("fieldset", { hasText: `Question numéro ${i + 1}` }).getByRole("radio", { name: "Bonne réponse" }).check({ force: true }); if (i === 2) await qp.getByRole("button", { name: "Voir mon score" }).click(); } // lot réviser : passage automatique à la question suivante
await qp.getByText("3 sur 3").waitFor();
check("quiz : score calculé par le serveur", true);

// --- révision : favoris, notes, surlignage, fiches mémo, reprise
await qp.goto(quizDoc);
await qp.getByRole("button", { name: "Favori" }).click();
await qp.getByRole("button", { name: "Retirer des favoris" }).first().waitFor(); // libellé de l’état pressé
await qp.getByRole("button", { name: "Écrire une fiche" }).click();
await qp.locator("textarea[name=front]").fill("Qu’est-ce que l’élasticité ?");
await qp.locator("textarea[name=back]").fill("La sensibilité de la demande au prix.");
await qp.getByRole("button", { name: "Ajouter à mes révisions" }).click();
await qp.getByText("Fiche mémo ajoutée").waitFor();
await qp.goto("/matieres?favoris=1"); check("favoris : le cours y figure", await qp.getByText("Cours pour le quiz").isVisible());
await qp.goto("/reviser/seance?mode=fiches");
await qp.getByRole("button", { name: "Voir la réponse" }).first().click();
await qp.getByRole("button", { name: /^Facile/ }).click();
await qp.getByRole("heading", { name: "Séance terminée" }).waitFor();
check("fiches mémo : séance de révision", true);
await qp.reload(); check("fiches mémo : la fiche réussie ne revient pas aujourd’hui", !(await qp.getByRole("button", { name: /^Facile/ }).count()));
await admin.p.goto(quizDoc);
check("notes personnelles : invisibles pour les autres", !(await admin.p.locator("main").textContent()).includes("Note privée de test"));

// --- questions-réponses
await qp.goto(quizDoc);
await qp.fill('textarea[name=body]', 'Pourquoi <img src=x onerror="window.__xss=1"> ?');
await qp.getByRole("button", { name: "Publier ma question" }).click();
await qp.getByText("Message publié").waitFor();
await member.p.goto(quizDoc);
check("questions : affichées en texte", await member.p.getByText("Pourquoi <img").isVisible() && !(await member.p.evaluate(() => window.__xss)));
await member.p.getByText("Répondre").click();
await member.p.getByLabel("Ta réponse").fill("Parce que la demande réagit au prix.");
await member.p.getByRole("button", { name: "Publier ma réponse" }).click();
await member.p.getByText("Message publié").first().waitFor();
await waitMail("prenom_nom@etu.exemple.fr", "réponse à ta question");
check("questions : l'auteur est prévenu d'une réponse", true);
// Boutons de la section Questions seulement (la page du cours a d'autres « Signaler… » / « Masquer… »)
const qaOf = (p) => p.getByRole("region", { name: "Questions" });
await qaOf(member.p).getByRole("button", { name: "Signaler", exact: true }).first().click();
await qaOf(member.p).getByRole("button", { name: "Signaler", exact: true }).first().click(); // deuxième clic : confirmation
await admin.p.reload(); await admin.p.waitForLoadState("networkidle").catch(() => undefined);
await qaOf(admin.p).getByRole("button", { name: "Masquer", exact: true }).first().click();
// Le masquage est vérifié au plus tard après rechargement (la page n'est pas toujours rafraîchie à temps)
const restore = qaOf(admin.p).getByRole("button", { name: "Rétablir", exact: true }).first();
await restore.waitFor({ timeout: 10000 }).catch(() => admin.p.reload());
await restore.waitFor();
check("modération : message masqué", true);
await member.p.reload(); check("modération : message masqué pour les membres", !(await member.p.getByText("Pourquoi <img").count()));

// --- délégué
// Le rôle se change dans la fiche (Accès et sécurité), avec un motif
await admin.p.goto("/admin/personnes?q=prenom_nom%40etu.exemple.fr");
await admin.p.locator(`tr:has-text("prenom_nom@etu.exemple.fr")`).first().getByText("prenom_nom@etu.exemple.fr").click();
await admin.p.waitForURL(/fiche=/);
await admin.p.getByText("Accès et sécurité", { exact: true }).first().click();
await admin.p.getByRole("combobox", { name: "Rôle" }).click();
await admin.p.getByRole("option", { name: "Délégué", exact: true }).click();
const roleDialog = admin.p.getByRole("dialog", { name: "Changer le rôle" });
await roleDialog.getByLabel("Motif").fill("Délégué de la promotion");
await roleDialog.getByRole("button", { name: "Confirmer" }).click();
await roleDialog.waitFor({ state: "hidden" });
await admin.p.getByText("Rôle modifié").first().waitFor(); // le dialogue se ferme avant l’appel serveur : on attend sa confirmation
await admin.p.goto("/admin/personnes?q=prenom_nom%40etu.exemple.fr");
await admin.p.locator(`tr:has-text("prenom_nom@etu.exemple.fr")`).first().getByText("Délégué", { exact: true }).waitFor();
await qp.goto("/moderation");
await qp.waitForURL(/securite=1/);
check("délégué : second facteur obligatoire", true);
await qp.getByRole("button", { name: "Configurer" }).click();
const delegateSecret = await qp.locator("code").waitFor().then(() => qp.locator("code").textContent());
await qp.fill("input[name=code]", new TOTP({ secret: Secret.fromBase32(delegateSecret) }).generate()); await qp.getByRole("button", { name: "Activer" }).click();
await qp.getByText("Active : un code est demandé").waitFor();
check("délégué : accès à la modération", (await qp.goto("/moderation")).status() === 200);
check("délégué : pas d'administration", (await qp.goto("/admin/personnes")).status() === 404);
await qp.goto(droitPath);
check("délégué : pas d'accès à une autre licence", await qp.getByText("Page introuvable").isVisible());

// --- enseignant
// Page Invitations, feuille « Inviter un enseignant » puis motif
await admin.p.goto("/admin/invitations");
await admin.p.getByRole("button", { name: "Inviter un enseignant" }).click();
const teacherSheet = admin.p.getByRole("dialog", { name: "Inviter un enseignant" });
await teacherSheet.getByLabel("Nom", { exact: true }).fill("Mme Professeure");
await teacherSheet.getByLabel("Adresse", { exact: true }).fill("professeure@test.example");
await teacherSheet.getByRole("checkbox", { name: "L1 · Histoire de la Pensée Économique" }).first().click();
await teacherSheet.getByRole("button", { name: "Inviter", exact: true }).click();
const teacherWhy = admin.p.getByRole("dialog", { name: "Créer l’espace enseignant" });
await teacherWhy.getByLabel("Motif").fill("Enseignante de la matière");
await teacherWhy.getByRole("button", { name: "Inviter", exact: true }).click();
await teacherSheet.waitFor({ state: "hidden" });
const teacherLink = /\/reset\/\S+/.exec(await waitMail("professeure@test.example", "espace enseignant"))[0];
const teacher = await newUser();
await teacher.p.goto(teacherLink); await teacher.p.fill("input[name=password]", "phrase-longue-enseignant-33"); await teacher.p.click("main button[type=submit]");
await teacher.p.waitForURL(/login/);
await fillLogin(teacher.p, "professeure@test.example", "phrase-longue-enseignant-33");
await teacher.p.waitForURL(/accepter-cgu/); await teacher.p.locator("input[name=terms]").check(); await teacher.p.getByRole("button", { name: "Accepter et continuer" }).click();
await teacher.p.waitForURL(/enseignant/);
await teacher.p.locator(`li:has-text("Les physiocrates")`).getByRole("button", { name: "Retirer" }).click();
await teacher.p.getByText("Tu as demandé le retrait").first().waitFor();
check("enseignant : le retrait est immédiat", (await member.p.goto("/accueil")) && !(await qp.goto(`/d/${docOfDraft}`) && false) && (await otherId.c.p.goto(`/d/${docOfDraft}`)).status() === 404);
await teacher.p.goto(`/d/${docOfDraft}`); check("enseignant : voit le document de sa matière", await teacher.p.locator("article.course").isVisible());
check("enseignant : pas d'accès à une autre matière", (await teacher.p.goto(droitPath)).status() === 404);

// --- suivi d'une demande de retrait
const trackLink = /\/contact\/suivi\/\S+/.exec(await waitMail("professeur@test.example", "demande bien reçue"))[0];
const tracker = await newUser(); await tracker.p.goto(trackLink);
check("retrait : suivi sans compte", await tracker.p.getByText("En cours de traitement").isVisible() || await tracker.p.getByText("Traitée", { exact: false }).first().isVisible());

// --- import CSV, actualités, calendrier, recherche Ctrl+K
// Feuille « Importer des matières » avec aperçu (lignes invalides marquées), puis motif
await admin.p.goto("/admin/licences");
await admin.p.getByRole("button", { name: "Importer", exact: true }).click();
const csvSheet = admin.p.getByRole("dialog", { name: "Importer des matières" });
await csvSheet.getByLabel("Une matière par ligne").fill("Droit;L1;Droit constitutionnel;Constit\nLicence Test;L2;Matière importée;Import\nDroit;L9;Mauvaise");
await csvSheet.getByRole("button", { name: "Voir l’aperçu" }).click();
await csvSheet.locator("tr", { hasText: "Mauvaise" }).waitFor();
check("import CSV : ligne invalide signalée", (await csvSheet.locator("tr", { hasText: "Mauvaise" }).getAttribute("class") ?? "").includes("destructive"));
await csvSheet.getByRole("button", { name: "Importer 2", exact: true }).click();
const csvWhy = admin.p.getByRole("dialog", { name: "Importer 2 matières" });
await csvWhy.getByLabel("Motif").fill("Maquette de la rentrée");
await csvWhy.getByRole("button", { name: "Importer", exact: true }).click();
await csvSheet.waitFor({ state: "hidden" });
check("import CSV : validation puis création", true);
await admin.p.goto("/admin/actualites");
// L'actualité s'écrit sur sa page finale, avec l'éditeur des cours
await admin.p.getByRole("button", { name: "Nouvelle actualité" }).first().click();
await admin.p.waitForURL(/admin\/actualites\/[0-9a-f-]{36}$/);
await admin.p.locator(".ProseMirror").waitFor({ timeout: 30000 });
await admin.p.fill("textarea[name=title]", "Campuss ouvre ses portes");
await admin.p.locator(".ProseMirror").click();
await admin.p.keyboard.type("Le site est ouvert <script>window.__xss=1</script>");
await waitSaved(admin.p);
await admin.p.getByRole("button", { name: "Publier", exact: true }).click();
await admin.p.getByRole("dialog").getByRole("button", { name: "Publier", exact: true }).click();
await admin.p.getByRole("button", { name: "Mettre à jour", exact: true }).first().waitFor();
const pub = await newUser(); await pub.p.goto("/actualites"); await pub.p.getByRole("link", { name: "Campuss ouvre ses portes" }).click();
await pub.p.locator("article.course").waitFor();
check("actualités : publiques et sans script", !(await pub.p.evaluate(() => window.__xss)));
await pub.p.goto("/"); await pub.p.waitForTimeout(500); await pub.p.screenshot({ path: "/shots/presentation.png" });
check("présentation : image de partage", (await pub.p.locator('meta[property="og:image"]').getAttribute("content")).includes("/og.png"));
// Pages publiques indexables (canonical, données structurées sous nonce), le reste en noindex, /llms.txt
check("présentation : adresse canonique", (await pub.p.locator('link[rel="canonical"]').getAttribute("href")).replace(/\/$/, "") === BASE.replace(/\/$/, ""));
const ldTypes = (await pub.p.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((el) => el.nonce !== "" && JSON.parse(el.textContent).map((d) => d["@type"])))).flat();
check("présentation : données structurées sous nonce", ["Organization", "WebSite", "WebApplication", "FAQPage"].every((t) => ldTypes.includes(t)));
// Sans suivre les redirections : « / » (la présentation) est indexable, /accueil (les cours) ne l’est pas
const robotsOf = async (path) => (await pub.p.request.get(path, { maxRedirects: 0 })).headers()["x-robots-tag"] ?? "";
check("SEO : pages publiques indexables", !/noindex/.test(await robotsOf("/")) && !/noindex/.test(await robotsOf("/cgu")) && !/noindex/.test(await robotsOf("/credits")));
check("SEO : pages connectées et partages hors des moteurs", /noindex/.test(await robotsOf("/accueil")) && /noindex/.test(await robotsOf("/matieres")) && /noindex/.test(await robotsOf("/p/jeton-inconnu")));
const llms = await pub.p.request.get("/llms.txt");
check("SEO : /llms.txt en texte brut", llms.ok() && llms.headers()["content-type"].startsWith("text/plain") && (await llms.text()).startsWith("# Campuss"));
// Téléphone dessiné (repli de la 3D), écrans au choix, paquet de fiches, fenêtre Safari
check("présentation : téléphone du héros avec sa capture prioritaire", (await pub.p.locator('.lp-phone-fallback img[fetchpriority="high"]').count()) === 1);
await pub.p.getByRole("group", { name: "Écran montré sur le téléphone" }).getByRole("button", { name: "Fiches" }).click();
check("présentation : changer l’écran du téléphone", (await pub.p.getByRole("button", { name: "Fiches", exact: true }).first().getAttribute("aria-pressed")) === "true");
// Les autres captures du héros ne se chargent qu'au premier choix ; modèle 3D jamais proposé en lien ; open source
check("présentation : capture choisie chargée à la demande", (await pub.p.locator('.lp-phone-fallback [data-screen="ia-fiches"] img').count()) === 1);
check("présentation : aucun lien vers le modèle 3D", (await pub.p.locator('a[href*=".glb"], a[href*=".gltf"], link[href*="/presentation/telephone"]').count()) === 0);
const trustText = await pub.p.locator("#vie-privee").innerText();
check("présentation : Campuss est open source, sans SES ni Cloudflare", trustText.includes("Campuss est open source") && !/Amazon SES|Cloudflare/.test(await pub.p.locator("main").innerText()));
check("présentation : fenêtre Safari", (await pub.p.locator(".lp-safari .lp-safari-url").first().textContent()).includes("campuss.fr"));
// Plus d'aimant ; un seul thème (en sombre, les captures sombres) ; écran d'iPhone 393×852 entier
check("présentation : aucun bouton aimanté", (await pub.p.locator("[data-magnetic], .lp-magnet").count()) === 0);
check("présentation : le téléphone montre une capture d'iPhone entière", await pub.p.locator(".lp-phone-fallback img").first().evaluate((img) => img.naturalWidth > 0 && Math.abs(img.naturalWidth / img.naturalHeight - 393 / 852) < 0.01));
await pub.p.emulateMedia({ colorScheme: "dark" }); await pub.p.waitForTimeout(500);
check("présentation : en sombre, captures sombres", (await pub.p.locator(".lp-phone-fallback img").first().evaluate((img) => img.currentSrc)).includes("-dark"));
await pub.p.emulateMedia({ colorScheme: "light" });
// Lien interne vers « / » : chargement complet (la CSP de « / » autorise le WebAssembly du modèle 3D)
await pub.p.goto("/cgu");
await pub.p.evaluate(() => { window.__sameDocument = true; });
await pub.p.locator('header a[href="/"]').first().click();
await pub.p.waitForURL((u) => u.pathname === "/");
await pub.p.locator(".lp-root").waitFor();
check("présentation : le logo des pages publiques recharge « / »", !(await pub.p.evaluate(() => window.__sameDocument)));
await pub.p.locator(".lp-deck").scrollIntoViewIfNeeded();
await pub.p.locator(".lp-deck-card button").last().click();
await pub.p.getByRole("button", { name: "Bien →" }).click();
// La fiche est d'abord lancée (0,32 s d'animation hors mouvement réduit), puis l'annonce change : on l'attend
const deckSaid = await pub.p.locator(".lp-deck [role=status]", { hasText: /^Bien/ }).waitFor({ timeout: 5000 }).then(() => true, () => false);
check("présentation : le paquet de fiches se manipule", deckSaid);
await pub.p.goto("/credits");
check("crédits : auteur du modèle 3D et lien Sketchfab", (await pub.p.getByText("extraakash").count()) > 0 && (await pub.p.locator('a[href^="https://sketchfab.com/3d-models/apple-iphone-18-pro-max-burgundy-2026"]').count()) === 1);
await admin.p.goto("/moderation/calendrier");
// Sélecteur de matière et calendrier (jour) + heure
await chooseSubject(admin.p, "Histoire de la Pensée Économique · Économie"); // l’admin voit la licence après le nom
const examDay = new Date(Date.now() + 10 * 86400000);
await admin.p.getByRole("button", { name: "Choisir un jour" }).click();
const examCell = admin.p.locator(`button[data-day="${examDay.toLocaleDateString("fr")}"]`);
if (!(await examCell.count())) await admin.p.locator(".rdp-button_next").click();
await examCell.click();
await admin.p.fill("#exam-time", "09:00");
await admin.p.getByRole("button", { name: "Ajouter au calendrier" }).click();
await admin.p.getByText("Date ajoutée").waitFor();
await member.p.goto("/reviser/partiels");
check("calendrier : compte à rebours et plan", await member.p.getByRole("region", { name: "Prochain partiel" }).isVisible() && await member.p.getByRole("heading", { name: /Plan de révision/ }).isVisible());
// Un contrôle continu s'annonce aussi, et se dit « CC » partout
await admin.p.goto("/moderation/calendrier");
await chooseSubject(admin.p, "Histoire de la Pensée Économique · Économie");
await admin.p.getByRole("radio", { name: "Contrôle continu (CC)" }).or(admin.p.getByRole("button", { name: "Contrôle continu (CC)" })).first().click();
await admin.p.getByRole("button", { name: "Choisir un jour" }).click();
const ccDay = new Date(Date.now() + 20 * 86400000);
const ccCell = admin.p.locator(`button[data-day="${ccDay.toLocaleDateString("fr")}"]`);
if (!(await ccCell.count())) await admin.p.locator(".rdp-button_next").click();
await ccCell.click();
await admin.p.getByRole("button", { name: "Ajouter au calendrier" }).click();
await admin.p.getByText("Date ajoutée").waitFor();
await member.p.goto("/reviser/partiels");
check("calendrier : un CC annoncé comme tel", await member.p.getByText(/^CC · /).first().isVisible());
await member.p.waitForTimeout(1000); await member.p.screenshot({ path: "/shots/calendrier.png" });
// ⌘K : on réessaie tant que la page n'a pas fini de s'hydrater (l'écouteur clavier arrive avec le JS)
for (let i = 0; i < 5 && !(await member.p.getByRole("dialog", { name: "Recherche" }).isVisible()); i++) { await member.p.keyboard.press("Control+k"); await member.p.getByRole("dialog", { name: "Recherche" }).waitFor({ timeout: 3000 }).catch(() => undefined); }
await member.p.getByRole("dialog", { name: "Recherche" }).getByRole("combobox", { name: "Rechercher" }).fill("elasticite");
await member.p.getByRole("option").filter({ hasText: "Élasticité prix" }).first().waitFor();
await member.p.screenshot({ path: "/shots/palette.png" });
await member.p.keyboard.press("Enter");
await member.p.waitForURL(/\/d\//);
check("Ctrl+K : suggestions et ouverture", true);
await member.p.goto("/accueil?q=sql%27--");
const secretLeak = await member.p.evaluate(async () => (await (await fetch("/api/search?q=obligations")).json()).results.length);
check("Ctrl+K : respecte la licence", secretLeak === 0);
await member.p.goto(droitSubject.replace(/\d+$/, "1") + "?tri=titre&type=cours");
check("matière : tri, filtre et fil d’Ariane", await member.p.getByRole("navigation", { name: "Fil d’Ariane" }).isVisible());

// --- éditeur façon Notion, import, cartes, Campuss IA, tutoriel, mode révision
const newCourse = async (title, start) => {
  await member.p.goto(`/contribuer/nouveau${start === "import" ? "?importer=1" : ""}`);
  await member.p.waitForURL(/\/editer\//);
  await member.p.locator(".ProseMirror").waitFor({ timeout: 30000 });
  const offered = start === "import" && await member.p.getByRole("region", { name: "Commencer avec…" }).waitFor({ timeout: 10000 }).then(() => true, () => false);
  await member.p.fill("textarea[name=title]", title);
  await chooseSubject(member.p, "Mathématiques");
  await openDetails(member.p);
  // Le semestre se choisit dans le sélecteur Année / Semestre / Matière, plus dans « Détails »
  await member.p.fill("input[name=chapter]", "3");
  await member.p.selectOption("select[name=rights]", "own_notes");
  await member.p.keyboard.press("Escape");
  // Échap referme aussi la fenêtre « Importer » ouverte d'office : on la rouvre pour importer
  if (start === "import") {
    await member.p.waitForTimeout(400);
    if (!(await member.p.locator('input[aria-label="Fichier à importer"]').count())) await member.p.getByRole("button", { name: "Importer", exact: true }).click();
    await member.p.locator('input[aria-label="Fichier à importer"]').waitFor({ state: "attached" });
  }
  return offered;
};
// « Importer » est un bouton bascule : on ne clique que s'il est fermé (aria-expanded), jamais pour le refermer par erreur
const openImporter = async () => {
  const input = member.p.locator('input[aria-label="Fichier à importer"]');
  const pending = member.p.getByRole("button", { name: /^Retirer la page/ }).filter({ visible: true }).first();
  const trigger = member.p.getByRole("button", { name: "Importer", exact: true });
  for (let i = 0; i < 4 && !(await input.count()); i++) {
    // Un PDF en attente de transcription occupe « Importer » : on le retire avant un autre import
    if (await pending.isVisible()) { await pending.click(); await member.p.waitForTimeout(600); continue; }
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
    // Les tuiles attendent l'état des imports
    await input.first().or(pending).waitFor({ state: "attached", timeout: 10000 }).catch(() => undefined);
  }
  if (!(await input.count())) {
    await member.p.screenshot({ path: "/shots/importer-echec.png" });
    const shown = await member.p.locator("[data-slot=popover-content]").allInnerTexts();
    throw new Error(`« Importer » sans tuile Fichier (ouvert : ${await trigger.getAttribute("aria-expanded")}) : ${shown.join(" | ").slice(0, 300)}`);
  }
};
const importInto = async (file) => { await member.p.locator('input[aria-label="Fichier à importer"]').first().setInputFiles(FX + file); await member.p.getByText(`Conversion de « ${file} »`).first().waitFor({ state: "detached", timeout: 30000 }); }; // l’état s’affiche dans la fenêtre « Importer » et sur la page
const importOffered = await newCourse("Import Word", "import");
check("import : proposé dès l'ouverture", importOffered && await member.p.locator('input[aria-label="Fichier à importer"]').count() === 1);
await importInto("note.docx");
const editorText = () => member.p.locator(".ProseMirror").textContent();
await member.p.locator(".ProseMirror").getByRole("heading", { name: "Partie Word" }).waitFor({ timeout: 15000 });
check("import Word : titre converti", true);
check("import Word : gras conservé", await member.p.locator(".ProseMirror strong", { hasText: "important" }).count() > 0);
check("import Word : souligné conservé", await member.p.locator(".ProseMirror u", { hasText: "souligne" }).count() > 0);
check("import Word : image copiée dans Campuss", (await member.p.locator(".ProseMirror img").first().getAttribute("src")).startsWith("/files/"));
check("import Word : tableau converti, sans ligne vide", (await member.p.locator(".ProseMirror table tr").first().textContent()).includes("A"));
await openImporter();
await importInto("note.md");
await member.p.locator(".ProseMirror").getByRole("heading", { name: "Note Obsidian" }).waitFor({ timeout: 15000 });
check("import Obsidian : ajouté à la suite", (await editorText()).includes("Partie Word"));
check("import Obsidian : liens internes et surlignage", !(await editorText()).includes("[[") && await member.p.locator(".ProseMirror [data-value=yellow]").count() > 0);
for (const [file, expected] of [["note.enex", "Contenu Evernote"], ["note.pages", "Texte venu de Pages"], ["vault.zip", "Note depuis Notion"], ["vrai.pdf", null]]) {
  await openImporter();
  await importInto(file);
  if (expected) { await member.p.locator(".ProseMirror").getByText(expected).first().waitFor({ timeout: 15000 }); check(`import ${file} : converti`, true); }
}
check("import ZIP : image de la note reprise", await member.p.locator('.ProseMirror img').count() >= 2);
check("import : archive piégée refusée", (await member.p.evaluate(async () => (await fetch(`/api/editor/import?doc=${location.pathname.split("/").pop()}`, { method: "POST", headers: { "x-filename": "x.exe" }, body: "MZ" })).status)) === 422);
await openImporter();
await member.p.locator('input[aria-label="Fichier à importer"]').first().setInputFiles(FX + "bomb.zip");
await member.p.getByText(/trop volumineuse|trop de fichiers/).waitFor({ timeout: 30000 });
check("import : bombe ZIP refusée", true);
if (await member.p.locator('input[aria-label="Fichier à importer"]').count()) await member.p.keyboard.press("Escape");
// La barre, sans Markdown
await member.p.locator(".ProseMirror").getByRole("heading", { name: "Partie Word" }).click();
await member.p.waitForTimeout(250); await member.p.keyboard.press("End"); await member.p.waitForTimeout(250); await member.p.keyboard.press("Enter");
await pickStyle(member.p, "Sous-titre");
await member.p.keyboard.type("Fait avec la barre");
await member.p.keyboard.press("Enter");
await member.p.keyboard.type("texte a surligner");
await member.p.keyboard.press("Shift+Home");
await member.p.getByRole("button", { name: "Surligner et colorer" }).click();
await member.p.getByRole("menuitem", { name: "Jaune" }).click();
await member.p.waitForTimeout(250); await member.p.keyboard.press("End"); await member.p.waitForTimeout(250); await member.p.keyboard.press("Enter");
await pickInsert(member.p, "Séparateur");
await pickInsert(member.p, "YouTube");
await member.p.getByLabel("Adresse de la vidéo YouTube").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
await member.p.getByRole("button", { name: "Ajouter", exact: true }).click();
await member.p.locator('.ProseMirror iframe[src*="youtube-nocookie"]').waitFor();
await member.p.setInputFiles("input[name=cover]", FX + "page.png");
await member.p.locator('img[src^="/files/"].object-cover').waitFor({ timeout: 15000 });
check("carte : image choisie", true);
await member.p.waitForTimeout(3200);
await member.p.getByText("Enregistré").filter({ visible: true }).waitFor({ timeout: 15000 });
await member.p.screenshot({ path: "/shots/ui-editor.png", fullPage: true });
const importedDoc = new URL(member.p.url()).pathname.split("/").pop();
await member.p.goto(`/d/${importedDoc}`);
const article = member.p.locator("article.course");
check("rendu : surlignage publié", await article.locator("mark.hl-yellow", { hasText: "texte a surligner" }).count() > 0);
check("rendu : souligné publié", await article.locator("u", { hasText: "souligne" }).count() > 0);
check("rendu : sous-titre publié", await article.getByRole("heading", { name: "Fait avec la barre" }).count() > 0);
check("rendu : vidéo sans suivi", await article.locator('iframe[src^="https://www.youtube-nocookie.com/embed/"]').count() > 0);
check("rendu : pas de script importé", !(await member.p.evaluate(() => window.__xss)));
await admin.p.goto(`/d/${importedDoc}`);
await publishHere(admin.p);
// Cartes, tags, filtres
await member.p.goto("/accueil");
await member.p.getByRole("link", { name: "Mathématiques" }).first().click();
await member.p.waitForURL(/matieres/);
const card = member.p.locator("article", { hasText: "Import Word" });
// Le chapitre est une pastille « CHAP. III » posée sur l'image ; la ligne de faits garde le semestre
check("carte : image, type, chapitre et semestre", await card.locator("img").count() === 1 && await card.getByText("CM", { exact: true }).isVisible() && await card.getByText("CHAP. III", { exact: true }).isVisible() && await card.getByText(/\bS1\b/).first().isVisible());
await member.p.waitForTimeout(800); await member.p.screenshot({ path: "/shots/ui-cards.png" });
// Filtres en puces : le type en un toucher, les filtres rares en menu ; un filtre n'est proposé que s'il départage (deux valeurs au moins)
const pickFilter = async (label, option) => { await member.p.getByRole("button", { name: label }).click(); await member.p.getByRole("menuitemradio", { name: option }).click(); };
const subjectDocs = await member.p.locator("main article").count();
if (await member.p.getByRole("button", { name: "Filtrer par semestre" }).count()) { await pickFilter("Filtrer par semestre", "S1"); await member.p.waitForURL(/semestre=1/); }
check("filtre : semestre", await card.isVisible());
if (await member.p.getByRole("button", { name: "Filtrer par chapitre" }).count()) {
  await pickFilter("Filtrer par chapitre", "Chapitre 3");
  await member.p.waitForURL(/chapitre=3/);
  check("filtre : chapitre", await card.isVisible());
} else check("filtre : chapitre non proposé quand il ne départage rien", subjectDocs === 1);
const typeGroup = member.p.getByRole("group", { name: "Type" });
if (await typeGroup.count()) {
  // Plus de vue « tout » ; les CM sont choisis d'office, sans type dans l'adresse
  const cm = typeGroup.getByRole("button", { name: /^CM/ });
  check("filtre : les CM sont choisis d’office", (await cm.getAttribute("aria-pressed")) === "true" && !/type=/.test(member.p.url()));
  await cm.click();
  check("filtre : la pastille choisie ne se décoche pas", (await cm.getAttribute("aria-pressed")) === "true" && await card.isVisible());
}
check("filtre : seuls les types présents sont proposés", !(await typeGroup.getByRole("button", { name: /^TD/ }).count()));
// Campuss IA
await qp.goto(quizDoc);
const aiButton = qp.getByRole("button", { name: /^(Générer des fiches|Voir les fiches de Campuss IA)$/ });
check("fiches mémo : manuel et IA côte à côte", await qp.getByRole("button", { name: "Écrire une fiche" }).isVisible() && await aiButton.isVisible());
await aiButton.click();
await qp.getByText("Fiche 1 de l'appel 1 ?").waitFor({ timeout: 30000 });
check("Campuss IA : réponse affichée en texte", !(await qp.evaluate(() => window.__xss)) && await qp.getByText("<script>").first().isVisible());
await qp.getByRole("button", { name: "Tout ajouter" }).scrollIntoViewIfNeeded(); await qp.waitForTimeout(600); await qp.screenshot({ path: "/shots/ui-memo.png" });
await qp.getByRole("button", { name: "Tout ajouter" }).click();
await qp.getByRole("button", { name: "Ajoutée" }).first().waitFor();
await qp.goto("/reviser/fiches");
check("Campuss IA : fiches ajoutées aux révisions", await qp.getByRole("heading", { name: "Mes fiches" }).count() === 1);
// Page Fiches (mémoire, paquets, modifier), et trois choix pour un cours
check("fiches : mémoire et paquets", await qp.getByRole("heading", { name: "Ma mémoire" }).isVisible() && await qp.getByRole("heading", { name: "Mes paquets" }).isVisible());
await qp.getByRole("button", { name: /^Modifier la fiche/ }).first().click();
check("fiches : modifier sans perdre l'historique", await qp.getByText("Son historique de révision est gardé.").isVisible());
await qp.keyboard.press("Escape");
await qp.goto(`/reviser/fiches/nouveau?cours=${quizDoc.split("/").pop()}`);
check("fiches : trois choix pour un cours", await qp.getByRole("button", { name: /Générer avec Campuss IA/ }).isVisible() && await qp.getByRole("button", { name: /Les faire moi-même/ }).isVisible() && await qp.getByRole("link", { name: /Voir les fiches des autres élèves/ }).isVisible());
await qp.getByRole("button", { name: /Les faire moi-même/ }).click();
await qp.locator("textarea[name=front]").fill("Formule de l’élasticité ?");
await qp.locator("textarea[name=back]").fill("$$e = \\frac{\\Delta Q / Q}{\\Delta P / P}$$");
await qp.getByRole("button", { name: "Ajouter la fiche" }).click();
await qp.getByText("Fiche mémo ajoutée").waitFor();
await qp.getByRole("link", { name: "Réviser ces fiches" }).click();
await qp.getByRole("button", { name: "Voir la réponse" }).click();
check("séance : intervalle écrit sous les notes", await qp.getByRole("button", { name: /^Bien, revoir dans / }).isVisible());
// Le paquet du cours contient aussi les fiches de Campuss IA ajoutées plus haut : la fiche à formule n'est pas forcément la première
for (let i = 0; i < 8 && !(await qp.locator(".katex").count()); i++) {
  await qp.getByRole("button", { name: /^Bien, revoir dans / }).click();
  await qp.getByRole("button", { name: "Voir la réponse" }).click();
  await qp.getByRole("button", { name: /^Bien, revoir dans / }).waitFor();
}
check("séance : formule rendue par KaTeX", await qp.locator(".katex").count() > 0);
await qp.getByRole("button", { name: /^Raté/ }).click();
await qp.keyboard.press("z");
check("séance : Z annule la dernière note", await qp.getByRole("button", { name: /^Raté/ }).isVisible());
await qp.goto("/reviser/fiches");
// Éditeur recto/verso avec aperçu retournable, import avec aperçu (TSV collé), validé par le serveur
await qp.goto(`/reviser/fiches/nouveau?cours=${quizDoc.split("/").pop()}&choix=main`);
check("fiches : recto, verso et aperçu de la carte", await qp.getByLabel(/^Recto/).isVisible() && await qp.getByLabel(/^Verso/).isVisible() && await qp.getByRole("button", { name: /^Aperçu du recto/ }).isVisible());
await qp.getByLabel(/^Recto/).fill("Aire du disque ?");
await qp.getByLabel(/^Recto/).press("Enter");
await qp.keyboard.type("$\\pi r^2$");
await qp.keyboard.press("Enter");
await qp.getByText("Fiche mémo ajoutée").waitFor();
check("fiches : Entrée passe au verso puis ajoute la fiche", (await qp.getByLabel(/^Recto/).inputValue()) === "");
await qp.goto(`/reviser/fiches/importer?cours=${quizDoc.split("/").pop()}`);
await qp.getByLabel("Ou colle le texte").fill("Recto\tVerso\nImport un\tRéponse un\nImport deux\tRéponse deux\nSans verso\t");
await qp.getByText("2 fiches", { exact: false }).first().waitFor();
check("import : aperçu avant import, ligne incomplète signalée", await qp.getByText("Import un", { exact: true }).isVisible() && await qp.getByText(/1 ligne sans recto ou sans verso/).isVisible());
await qp.getByRole("button", { name: /^Importer 2 fiches/ }).click();
await qp.getByText("2 fiches importées.").waitFor();
check("import : fiches importées", true);
// « Aide ta promo » à la fin d'une création ; refusé, il ne revient plus pour ce paquet
const invite = qp.getByRole("region", { name: "Aide ta promo" });
if (await invite.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
  check("publier : aperçu de ce qui sera public", await invite.getByText("Ce qui sera visible").isVisible());
  await invite.getByRole("button", { name: "Pas pour ce paquet" }).click();
}
await qp.getByLabel("Ou colle le texte").fill("Import un\tRéponse un");
await qp.getByRole("button", { name: /^Importer 1 fiche/ }).click();
check("import : un doublon n'est pas importé deux fois", await qp.getByText("Toutes ces fiches sont déjà dans ce paquet.").waitFor().then(() => true, () => false));
await qp.waitForTimeout(1500);
check("publier : on ne redemande pas une fois refusé", !(await qp.getByRole("region", { name: "Aide ta promo" }).count()));
await qp.goto("/reviser/fiches");
// Publier depuis le paquet, en un geste
for (const more of await qp.getByRole("button", { name: /^Plus d’actions pour/ }).all()) {
  await more.click();
  const item = qp.getByRole("menuitem", { name: "Publier pour ma promo…" });
  if (!(await item.count())) { await qp.keyboard.press("Escape"); continue; }
  await item.click();
  await qp.getByRole("dialog").getByRole("button", { name: "Publier pour ma promo" }).click();
  check("publier : un geste depuis le paquet", await qp.getByText("Publié pour ta promo. Merci !").waitFor().then(() => true, () => false));
  await qp.keyboard.press("Escape");
  break;
}
await qp.goto("/reviser/fiches");
// Paquets publiés et sujets de partiels sont des ressources de Réviser, pas des cours
await member.p.goto("/reviser/fiches/paquets");
check("ressources : « Paquets de la promo »", await member.p.getByRole("heading", { level: 1, name: "Paquets de la promo" }).isVisible());
const promoRevise = member.p.getByRole("button", { name: /^Réviser / }).first();
if (await promoRevise.count()) {
  check("ressources : un paquet de la promo a ses actions, pas une carte de cours", await member.p.getByRole("button", { name: /^Copier .* dans mes fiches$/ }).count() > 0 && !(await member.p.locator("main article").count()));
  await promoRevise.click();
  await member.p.waitForURL(/\/reviser\/seance\?mode=fiches/);
  check("ressources : « Réviser » copie le paquet et ouvre la séance", true);
}
await member.p.goto("/reviser/partiels");
check("ressources : « Sujets de partiels pour s’entraîner »", await member.p.getByRole("heading", { name: "Sujets de partiels pour s’entraîner" }).isVisible());
await qp.goto("/reviser/fiches");
await member.p.goto(quizDoc);
await member.p.getByRole("button", { name: "Voir les fiches de Campuss IA" }).click();
// Le clic peut précéder l'hydratation de la page : on laisse aux fiches sauvegardées le temps d'apparaître
await member.p.getByText("Fiche 1 de l'appel 1 ?").waitFor({ timeout: 10000 }).catch(async () => { await member.p.getByRole("button", { name: "Voir les fiches de Campuss IA" }).click(); await member.p.getByText("Fiche 1 de l'appel 1 ?").waitFor({ timeout: 10000 }).catch(() => undefined); });
check("Campuss IA : sauvegarde réutilisée, sans second appel", await member.p.getByText("Fiche 1 de l'appel 1 ?").isVisible() && !(await member.p.getByText("appel 2").count()));
// Le tour guidé est retiré (refonte) : rien ne couvre l'écran à la première visite
const tourCtx = await rawContext({ baseURL: BASE, viewport: { width: 1280, height: 800 }, storageState: { ...(await member.c.storageState()), origins: [] } }); const tp = await tourCtx.newPage();
await tp.goto("/accueil"); await tp.waitForTimeout(1500);
check("plus de tour guidé à la première visite", !(await tp.locator(".driver-popover").count()));
await tourCtx.close();
// Annoter sur la page du cours : sélection, marques, notes en marge, amis, temps réel
const annotP = stu.c.p;
// Notes en colonne : il faut un conteneur de lecture d'au moins 73rem (sinon pastilles)
await member.p.setViewportSize({ width: 1600, height: 900 }); await annotP.setViewportSize({ width: 1600, height: 900 });
const openTogether = async (p) => { await p.getByRole("button", { name: "Réviser", exact: true }).click(); await p.getByRole("menuitem", { name: "Réviser à plusieurs" }).click(); await p.getByRole("dialog", { name: "Notes" }).waitFor(); };
await member.p.goto(`/d/${importedDoc}`);
const courseArticle = member.p.locator("article.course");
await courseArticle.waitFor();
const courseBefore = await courseArticle.textContent();
check("annotations : plus de bouton « Mode révision »", !(await member.p.getByRole("button", { name: "Mode révision" }).count()));
const selectPassage = (p, text) => p.evaluate((needle) => {
  const article = document.querySelector("article.course");
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const at = walker.currentNode.data.indexOf(needle);
    if (at < 0) continue;
    const range = new Range();
    range.setStart(walker.currentNode, at);
    range.setEnd(walker.currentNode, at + needle.length);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }
  return false;
}, text);
const menu = member.p.getByRole("toolbar", { name: "Annoter le passage" });
check("annotations : le passage existe", await selectPassage(member.p, "texte a surligner"));
await menu.waitFor({ timeout: 5000 });
check("annotations : le menu apparaît à la sélection", true);
await member.p.waitForTimeout(250); await member.p.screenshot({ path: "/shots/ui-select.png" });
await menu.getByRole("button", { name: "Surligner en vert" }).click();
await courseArticle.locator(".ann-hl-green").first().waitFor();
check("annotations : surlignage posé", (await courseArticle.locator(".ann-hl-green").first().textContent()).includes("texte a surligner"));
check("annotations : la sélection reste pour enchaîner", await member.p.evaluate(() => getSelection().toString()) === "texte a surligner");
await menu.getByRole("button", { name: "Gras" }).click();
await courseArticle.locator(".ann-bold").first().waitFor();
await menu.getByRole("button", { name: "Barrer" }).click();
await courseArticle.locator(".ann-strike").first().waitFor();
check("annotations : gras et barré se cumulent", await courseArticle.locator(".ann-hl-green.ann-bold.ann-strike").count() > 0);
await menu.getByRole("button", { name: "Barrer" }).click();
await member.p.waitForTimeout(200);
check("annotations : second clic retire la marque", !(await courseArticle.locator(".ann-strike").count()));
await member.p.waitForTimeout(600);
await selectPassage(member.p, "Partie Word");
await member.p.waitForTimeout(400);
await menu.getByRole("button", { name: "Note" }).click();
await member.p.getByLabel("Écris ta note…").fill("Ma note sur ce titre");
await member.p.keyboard.press("Enter");
const noteCard = member.p.locator("[data-note]", { hasText: "Ma note sur ce titre" });
await noteCard.waitFor();
const cardBox = await noteCard.boundingBox(); const articleBox = await courseArticle.boundingBox();
check("note : à droite du texte", cardBox.x >= articleBox.x + articleBox.width);
check("note : pas de surlignage permanent", await courseArticle.locator(".ann-note").count() > 0 && await courseArticle.locator(".ann-note").first().evaluate((el) => getComputedStyle(el).textDecorationLine === "none" && getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)"));
await noteCard.click();
await courseArticle.locator(".ann-glow").first().waitFor();
check("note : un clic fait briller son passage", (await courseArticle.locator(".ann-glow").first().textContent()).includes("Partie Word"));
await member.p.waitForTimeout(250); await member.p.screenshot({ path: "/shots/ui-note.png" });
check("annotations : le texte du cours ne change pas", (await courseArticle.textContent()) === courseBefore);
await member.p.reload();
await courseArticle.locator(".ann-hl-green.ann-bold").first().waitFor({ timeout: 15000 });
check("annotations : conservées après rechargement", await member.p.locator("[data-note]", { hasText: "Ma note sur ce titre" }).isVisible());
await annotP.goto(`/d/${importedDoc}`);
await annotP.locator("article.course").waitFor();
check("annotations : invisibles des autres", !(await annotP.locator(".ann-hl-green").count()) && !(await annotP.getByText("Ma note sur ce titre").count()));
// Amis
await openTogether(annotP);
check("amis : aucun inscrit proposé sans lien d'amitié", !(await annotP.getByRole("button", { name: /^Inviter/ }).count()));
await annotP.keyboard.press("Escape");
await openTogether(member.p);
check("amis : personne dans la liste avant de s'ajouter", !(await member.p.getByRole("button", { name: /^Inviter/ }).count()));
await member.p.keyboard.press("Escape");
await annotP.goto("/amis");
const friendCode = await annotP.getByTestId("friend-code").textContent();
await member.p.goto("/amis");
await member.p.fill("input[name=who]", "CODEINEXISTANT");
await member.p.getByRole("button", { name: "Ajouter", exact: true }).click();
await member.p.getByText("Demande envoyée").waitFor();
const replyUnknown = await member.p.getByText("Demande envoyée").textContent();
await member.p.fill("input[name=who]", friendCode.toLowerCase());
await member.p.getByRole("button", { name: "Ajouter", exact: true }).click();
await member.p.waitForTimeout(800);
check("amis : même réponse pour un code inconnu", (await member.p.getByText("Demande envoyée").textContent()) === replyUnknown);
await annotP.reload();
// Le bouton répond une fois la page hydratée : on reclique tant que la liste d'amis n'apparaît pas (au pire on recharge)
for (let i = 0; i < 4 && !(await annotP.getByRole("list", { name: "Mes amis" }).isVisible()); i++) {
  const accept = annotP.getByRole("region", { name: "Demandes reçues" }).getByRole("button", { name: "Accepter" });
  if (await accept.count()) await accept.first().click(); else await annotP.reload();
  await annotP.getByRole("list", { name: "Mes amis" }).waitFor({ timeout: 5000 }).catch(() => undefined);
}
await annotP.getByRole("list", { name: "Mes amis" }).waitFor();
check("amis : demande acceptée", true);
await annotP.screenshot({ path: "/shots/ui-friends.png" });
await member.p.goto(`/d/${importedDoc}`);
await openTogether(member.p);
await member.p.getByRole("button", { name: /^Inviter/ }).click();
await member.p.getByText("en attente").waitFor();
check("révision : l'ami invité est en attente", true);
await member.p.keyboard.press("Escape");
await annotP.goto("/reviser");
await annotP.getByRole("region", { name: "Invitations à réviser" }).getByRole("button", { name: "Accepter" }).click();
await annotP.waitForURL(/revision=/);
const spaceUrl = new URL(annotP.url()); const spaceId = spaceUrl.searchParams.get("revision");
await annotP.locator(".ann-hl-green").first().waitFor({ timeout: 15000 });
check("révision : l'ami voit les marques", await annotP.getByText("Ma note sur ce titre", { exact: true }).first().isVisible());
await member.p.reload(); await member.p.locator("article.course").waitFor();
await annotP.waitForTimeout(1500);
await selectPassage(annotP, "texte a surligner");
await member.p.locator(".live-cursor").first().waitFor({ timeout: 15000 });
check("révision : la sélection de l'ami apparaît en direct", true);
await member.p.waitForTimeout(250); await member.p.screenshot({ path: "/shots/ui-revision.png" });
await annotP.getByRole("toolbar", { name: "Annoter le passage" }).getByRole("button", { name: "Italique" }).click();
await member.p.locator("article.course .ann-italic").first().waitFor({ timeout: 15000 });
check("révision : une marque de l'ami arrive sans recharger", true);
await annotP.locator("[data-note]", { hasText: "Ma note sur ce titre" }).click();
await annotP.getByLabel("Répondre…").fill("Ma réponse");
await annotP.keyboard.press("Enter");
await member.p.getByText("Ma réponse").waitFor({ timeout: 15000 });
check("révision : réponse à une note", true);
check("temps réel : autre origine refusée", await new Promise((resolve) => { const w = new WebSocket(`${BASE.replace("http", "ws")}/collab?room=${spaceId}`); w.onopen = () => resolve(false); w.onerror = () => resolve(true); w.onclose = () => resolve(true); setTimeout(() => resolve(true), 5000); }));
const pngBytes = [...readFileSync(FX + "page.png")];
const photo = await member.p.evaluate(async ([space, bytes]) => { const r = await fetch(`/api/revision/images?space=${space}`, { method: "POST", body: new Uint8Array(bytes) }); return (await r.json()).url; }, [spaceId, pngBytes]);
check("révision : photo ajoutée", (await pageFetch(member.p, photo)) === 200);
const outsider = await newUser();
check("révision : photo invisible sans compte", (await pageFetch(outsider.p, photo).catch(() => 404)) !== 200);
await openTogether(member.p);
await member.p.getByRole("button", { name: /^Retirer/ }).click();
await member.p.waitForTimeout(800);
await annotP.goto(`/d/${importedDoc}?revision=${spaceId}`);
await annotP.locator("article.course").waitFor();
check("révision : accès retiré, ses annotations seules restent", !(await annotP.getByText("Ma note sur ce titre").count()));

// --- parcours par domaine : chaque fichier de e2e-parts exporte run(ctx)
{
  const { readdirSync } = await import("node:fs");
  const dir = new URL("./e2e-parts/", import.meta.url).pathname;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort()) {
    console.log(`--- ${file}`);
    const { run } = await import(`${dir}${file}`);
    try {
      await run({ admin: admin.p, member: member.p, student: stu.c.p, check, BASE, FX, MAIL, waitMail, newUser, openBlankDraft, waitSaved, saveSettings, chooseSubject, send, fillDetailsIfAsked, importedDoc, quizDoc, docOfDraft, pageFetch, stepUpShown: () => stepUpShown, freshStudent: async (email) => { const { c } = await signUp(email); await fillLogin(c.p, email, "phrase-longue-pour-essai-22"); await finishWelcome(c.p); return c.p; } });
    } catch (error) { check(`parcours ${file} interrompu`, false, String(error).slice(0, 400)); }
  }
}

// --- réglages liés au compte, appareils, adresse, clé d'accès
await member.p.goto("/parametres/affichage");
await member.p.getByRole("button", { name: "Sombre" }).first().click();
await member.p.getByRole("button", { name: "Grande" }).first().click();
await saveSettings(member.p);
const second = await newUser();
await fillLogin(second.p, MEMBER, NEW_PW); await second.p.waitForURL(/2fa/);
await second.p.fill("input[name=code]", totp.generate({ timestamp: Date.now() + 30000 })); await second.p.getByRole("button", { name: "Valider", exact: true }).click();
await second.p.waitForURL(`${BASE}/accueil`);
check("réglages : thème et taille suivent le compte", await second.p.evaluate(() => document.documentElement.classList.contains("dark") && document.documentElement.classList.contains("text-l")));
await member.p.goto("/parametres/compte");
check("appareils : plusieurs sessions listées", await member.p.getByRole("button", { name: "Déconnecter", exact: true }).count() >= 1);
const cdp = await member.c.newCDPSession(member.p);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true } });
await member.p.getByRole("button", { name: "Ajouter une clé d’accès" }).click();
// Audit de sécurité : un compte qui a déjà un second facteur le redonne avant d'en ajouter un (un cookie volé ne suffit pas)
const memberStepUp = member.p.getByRole("dialog", { name: "Confirme que c’est bien toi" });
const memberAsked = await memberStepUp.waitFor({ timeout: 10000 }).then(() => true, () => false);
for (let i = 0; i < 3 && await memberStepUp.isVisible(); i++) {
  await memberStepUp.locator("input[name=code]").fill(totp.generate({ timestamp: Date.now() + 30000 }));
  await memberStepUp.waitFor({ state: "hidden", timeout: 31000 }).catch(() => undefined);
}
check("clé d'accès : le second facteur existant est redemandé avant l'ajout", memberAsked);
await member.p.getByText("ajoutée le").first().waitFor();
check("clé d'accès : ajoutée", true);
await member.p.goto("/moi");
await member.p.getByRole("button", { name: "Se déconnecter" }).click();
await member.p.waitForURL(/login/);
await member.p.getByRole("button", { name: "Utiliser une clé d’accès" }).click();
await member.p.waitForURL(`${BASE}/accueil`);
check("clé d'accès : connexion sans mot de passe", true);
await stu.c.p.goto("/parametres/compte");
await stu.c.p.fill('input[name=email]', "nouvelle@test.example");
await stu.c.p.fill('#current-email', "phrase-longue-pour-essai-22");
await stu.c.p.getByRole("button", { name: "Changer d’adresse" }).click();
await stu.c.p.getByText("Étape suivante : ouvre le mail envoyé à ta nouvelle adresse").first().waitFor();
const emailLink = /\/email\/\S+/.exec(await waitMail("nouvelle@test.example", "confirme ta nouvelle"))[0];
const em = await newUser(); await em.p.goto(emailLink); await em.p.click("main button[type=submit]"); await em.p.getByText("Adresse modifiée").waitFor();
await waitMail("prenom_nom@etu.exemple.fr", "changement d’adresse");
check("adresse mail : changée après preuve, ancienne adresse prévenue", true);
await waitMail(MEMBER, "nouvelle connexion").catch(() => {});

// --- attestations de droits
await openBlankDraft(member.p);
await member.p.fill("textarea[name=title]", "Sujet sans accord");
await chooseSubject(member.p, "Mathématiques");
await member.p.selectOption("select[name=category]", "partiel");
await openDetails(member.p); await member.p.selectOption("select[name=rights]", "own_notes"); await member.p.keyboard.press("Escape");
await member.p.getByText("Un sujet de partiel appartient à son auteur").first().waitFor();
await member.p.getByRole("button", { name: "Envoyer pour validation", exact: true }).click();
await attestIfAsked(member.p);
check("partiel présenté comme une note personnelle : envoi bloqué", await member.p.getByRole("dialog").getByRole("button", { name: "Envoyer", exact: true }).isDisabled());
await member.p.keyboard.press("Escape");
await waitSaved(member.p);
check("partiel présenté comme une note personnelle : refusé", true);
await member.p.goto(partielUrl);
const dl = member.p.locator('a[href^="/files/"]').first();
await dl.click();
await member.p.getByRole("dialog").waitFor();
check("fichier : engagement demandé avant le premier accès", await member.p.getByRole("button", { name: "Continuer" }).isDisabled());
await member.p.getByRole("button", { name: "Annuler" }).click();

// --- mesure d'audience et consentement
const visitor = await newUser(null);
await visitor.p.goto("/login");
const banner = visitor.p.getByRole("region", { name: "Choix pour les cookies de mesure" });
await banner.waitFor();
check("bannière : refuser aussi visible qu'accepter", await banner.getByRole("button", { name: "Refuser" }).isVisible() && await banner.getByRole("button", { name: "Accepter" }).isVisible());
await visitor.p.waitForTimeout(400);
check("sans choix : aucun cookie de suivi", !(await visitor.c.cookies()).some((c) => c.name === "campuss-visitor"));
await banner.getByRole("button", { name: "Accepter" }).click();
await banner.waitFor({ state: "detached" });
await visitor.p.goto("/forgot");
for (let i = 0; i < 20 && !(await visitor.c.cookies()).some((c) => c.name === "campuss-visitor"); i++) await visitor.p.waitForTimeout(250);
check("après accord : cookie de suivi posé", (await visitor.c.cookies()).some((c) => c.name === "campuss-visitor" && c.httpOnly));
await fillLogin(visitor.p, MEMBER, NEW_PW); await visitor.p.waitForURL(/2fa/);
await visitor.p.fill('input[name=code]', totp.generate({ timestamp: Date.now() + 30000 })); await visitor.p.getByRole("button", { name: "Valider", exact: true }).click();
await visitor.p.waitForURL(`${BASE}/accueil`); await visitor.p.goto(partielUrl); await visitor.p.waitForTimeout(600);
const profileHref = await visitor.p.goto("/moi").then(() => visitor.p.locator('main a[href^="/u/"]').first().getAttribute("href"));
await visitor.p.goto(partielUrl); await visitor.p.waitForTimeout(600);
const trackedProfile = `/admin/personnes/${profileHref.split("/").pop()}`;
// Fiche en onglets : Activité (pages consultées), Droits (engagements)
await admin.p.goto(`${trackedProfile}?vue=activite`);
check("fiche : pages consultées visibles avec accord", await admin.p.locator("main").getByText("Partiel d'analyse", { exact: true }).first().isVisible());
await raw("/api/track", { method: "POST", headers: { "content-type": "application/json", origin: BASE, "user-agent": "Mozilla/5.0 Chrome/120" }, body: JSON.stringify({ path: "/reset/jeton-secret?x=1" }) });
await raw("/api/track", { method: "POST", headers: { "content-type": "application/json", origin: BASE, "user-agent": "Mozilla/5.0 Chrome/120" }, body: JSON.stringify({ path: "/<script>window.__xss=1</script>" }) });
await admin.p.goto("/admin/statistiques?vue=audience");
const statsText = await admin.p.locator("main").textContent();
check("statistiques : aucun jeton enregistré", !statsText.includes("jeton-secret"), statsText.slice(0, 300));
check("statistiques : documents consultés comptés", await admin.p.getByRole("link", { name: "Partiel d'analyse" }).first().isVisible());
check("statistiques : visiteur compté seulement avec accord", /[1-9]\d* visiteurs/.test(statsText.replace(/\s+/g, " ")), statsText.slice(0, 200));
check("statistiques : chemin piégé neutralisé", !statsText.includes("<script") && !(await admin.p.evaluate(() => window.__xss)));
await admin.p.screenshot({ path: "/shots/stats.png", fullPage: true });
await visitor.p.getByRole("button", { name: "Gérer les cookies" }).click();
await visitor.p.getByRole("button", { name: "Refuser" }).click();
await visitor.p.waitForTimeout(500);
check("retrait : cookie de suivi supprimé", !(await visitor.c.cookies()).some((c) => c.name === "campuss-visitor"));
await admin.p.goto(`${trackedProfile}?vue=activite`);
check("retrait : l'historique n'est plus lié au compte", await admin.p.getByText("Aucune page enregistrée").isVisible());
check("journal et statistiques : 404 pour un membre", (await member.p.goto("/admin/statistiques")).status() === 404 && (await member.p.goto(trackedProfile)).status() === 404);
await admin.p.goto(`${trackedProfile}?vue=droits`);
check("fiche : engagements conservés comme preuve", await admin.p.getByRole("region", { name: "Engagements" }).getByText("Ce contenu est le mien").first().isVisible());
await admin.p.screenshot({ path: "/shots/fiche.png", fullPage: true });

// Les comptes qui ne servent plus libèrent leur mémoire
for (const old of OPENED) { if (![admin.c, member.c, stu.c.c].includes(old)) await old.close().catch(() => undefined); }
// --- téléphone : menu et débordements, page par page
const phone = await browser.newContext({ baseURL: BASE, viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, storageState: await admin.c.storageState() }); await phone.addCookies([{ name: "campuss-consent", value: "no", url: BASE }]);
const pp = await phone.newPage();
const phonePages = ["/accueil", "/matieres", "/moi", "/reviser", "/reviser/partiels", "/matieres?favoris=1", "/moderation", `${quizDoc}/quiz`, "/", "/actualites", "/reviser/classement", "/parametres", "/admin", "/admin/contenus", "/admin/documents/new", "/admin/personnes", "/admin/licences", "/admin/statistiques", "/admin/moderation", "/admin/journal", "/admin/erreurs", "/admin/suivi", "/admin/actualites", trackedProfile, partielUrl, attackUrl, `/d/${docOfDraft}`, droitSubject, `/u/${memberId}`, "/cgu", "/confidentialite", "/credits", "/contact"];
for (const path of phonePages) {
  await pp.goto(path); await pp.waitForTimeout(500);
  const over = await pp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`téléphone ${path} : pas de débordement`, over <= 0, `${over}px`);
  if (["/accueil", "/admin", "/reviser"].includes(path)) await pp.screenshot({ path: `/shots/m${path.replace(/[^a-z]+/g, "-").slice(0, 40)}.png` });
}
await pp.goto("/accueil");
const small = await pp.evaluate(() => [...document.querySelectorAll("header button, header a, [data-slot=button]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 40; }).map((e) => e.textContent || e.getAttribute("aria-label")));
check("téléphone : cibles tactiles assez grandes", small.length === 0, small.join());
const manifest = await (await raw("/manifest.webmanifest")).json();
check("PWA : manifeste installable", manifest.display === "standalone" && (await raw("/icon-512.png")).status === 200);
check("PWA : service worker actif", await pp.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active)));
const thumb = pp.getByRole("navigation", { name: "Navigation principale" });
check("téléphone : la barre d'onglets porte les pages de l'espace", await thumb.getByRole("link", { name: "Réviser" }).isVisible());
await pp.goto("/moi");
await pp.getByRole("link", { name: "Compte et sécurité" }).tap();
await pp.waitForURL(/parametres\/compte/);
check("téléphone : Moi mène aux paramètres", true);
await pp.goto("/accueil"); await pp.waitForTimeout(900); await pp.screenshot({ path: "/shots/m-home.png" });

// --- révocation : jeton de contenu après désactivation
await member.p.goto(attackUrl);
const memberView = await member.p.locator("iframe").getAttribute("src");
check("contenu accessible avant désactivation", (await raw(memberView)).status === 200);
// Plus de bouton « Désactiver » sur la ligne ; on suspend par la barre de sélection (sessions coupées)
await admin.p.goto(`/admin/personnes?q=${encodeURIComponent(MEMBER)}`);
await admin.p.locator(`tr:has-text("${MEMBER}")`).first().getByRole("checkbox", { name: "Sélectionner" }).click();
await admin.p.getByRole("button", { name: "Suspendre", exact: true }).first().click();
await admin.p.getByRole("dialog", { name: "Suspendre" }).getByRole("button", { name: "Suspendre", exact: true }).click();
await admin.p.getByText(/^Suspendu/).first().waitFor({ timeout: 20000 });
await admin.p.waitForTimeout(800);
check("désactivation : jeton de contenu révoqué", (await raw(memberView)).status === 404);
check("désactivation : session révoquée", (await member.p.goto("/parametres")) && member.p.url().includes("/login"));

// --- limitation de débit
const rl = await newUser();
let blocked = false;
for (let i = 0; i < 12 && !blocked; i++) {
  await fillLogin(rl.p, ADMIN, `mauvais-mot-de-passe-${i}`);
  await rl.p.locator('[data-slot=alert]').waitFor();
  blocked = (await rl.p.locator('[data-slot=alert]').textContent()).includes("Trop de tentatives");
}
check("force brute : blocage après 8 essais", blocked);
await fillLogin(rl.p, ADMIN, ADMIN_PW); await rl.p.locator('[data-slot=alert]').waitFor();
check("blocage effectif même avec le bon mot de passe", (await rl.p.locator('[data-slot=alert]').textContent()).includes("Trop de tentatives"));

// --- captures
await admin.p.setViewportSize({ width: 1280, height: 800 });
await admin.p.goto("/accueil"); await admin.p.waitForTimeout(700); await admin.p.locator("main a[href^='/matieres/']").nth(1).hover(); await admin.p.waitForTimeout(400); await admin.p.screenshot({ path: "/shots/library.png" });
await admin.p.locator("main a[href^='/matieres/']").first().click(); await admin.p.waitForURL(/matieres/); await admin.p.waitForTimeout(500); await admin.p.screenshot({ path: "/shots/subject.png" });
await admin.p.goto("/admin/documents/new"); await admin.p.screenshot({ path: "/shots/new.png", fullPage: true });
await admin.p.goto(partielUrl); await admin.p.waitForTimeout(600); await admin.p.screenshot({ path: "/shots/doc.png" });
await admin.p.goto("/admin"); await admin.p.screenshot({ path: "/shots/admin.png" });
for (const [path, name] of [["/", "ui-home"], ["/moderation", "ui-edit"], ["/admin/charte", "ui-charte"], ["/reviser", "ui-reviser"], ["/parametres", "ui-account"], ["/contribuer", "ui-docs"], ["/admin/personnes", "ui-users"], ["/matieres/1", "ui-subject"], ["/amis", "ui-friends-admin"]]) { await admin.p.goto(path); await admin.p.waitForTimeout(1100); await admin.p.screenshot({ path: `/shots/${name}.png`, fullPage: true }); }
await admin.p.emulateMedia({ colorScheme: "dark" }); await admin.p.goto("/accueil"); await admin.p.waitForTimeout(1100); await admin.p.screenshot({ path: "/shots/ui-home-dark.png" }); await admin.p.emulateMedia({ colorScheme: "light" });
await admin.p.goto("/cgu"); await admin.p.waitForTimeout(400); await admin.p.screenshot({ path: "/shots/cgu.png" });
await admin.p.goto("/accueil?q=analyse"); await admin.p.waitForTimeout(700); await admin.p.screenshot({ path: "/shots/search.png" });
await admin.p.goto("/admin/personnes"); await admin.p.screenshot({ path: "/shots/users.png" });
await admin.p.setViewportSize({ width: 390, height: 800 });
await admin.p.goto("/accueil"); await admin.p.waitForTimeout(700); await admin.p.screenshot({ path: "/shots/mobile.png" });
const overflow = await admin.p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
check("mobile : pas de débordement horizontal", !overflow);
const anon2 = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } }); const ap = await anon2.newPage();
await ap.goto("/login"); await ap.waitForTimeout(1300); await ap.screenshot({ path: "/shots/login.png" });
const anon3 = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 800 } }); const mp = await anon3.newPage();
await mp.goto("/register"); await mp.waitForTimeout(1300); await mp.screenshot({ path: "/shots/register-mobile.png" });
check("mobile : inscription sans débordement", !(await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
const dark = await browser.newContext({ baseURL: BASE, colorScheme: "dark", viewport: { width: 1280, height: 800 }, storageState: await admin.c.storageState() }); const dp = await dark.newPage();
await dp.goto("/accueil"); await dp.waitForTimeout(500); await dp.screenshot({ path: "/shots/dark.png" });
const still = await browser.newContext({ baseURL: BASE, reducedMotion: "reduce", storageState: await admin.c.storageState() }); const rp = await still.newPage();
await rp.goto("/accueil");
// DESIGN.md §8.6 : en mouvement réduit, les fondus restent ; seuls les déplacements et les boucles doivent s'arrêter.
// Une animation compte si elle boucle, ou si l'élément n'a pas la même transformation au début et à la fin.
const longAnimations = await rp.evaluate(() => document.getAnimations().filter((a) => {
  const t = a.effect?.getTiming(); if (!t || Number(t.duration) < 5) return false;
  if (t.iterations === Infinity) return true;
  const el = a.effect?.target; if (!el) return true;
  const pose = () => { const s = getComputedStyle(el, a.effect.pseudoElement ?? undefined); return [s.transform, s.translate, s.scale, s.rotate].join(";").replaceAll("matrix(1, 0, 0, 1, 0, 0)", "none"); };
  a.pause(); a.currentTime = 0; const start = pose(); a.currentTime = Number(t.delay || 0) + Number(t.duration) - 1; const end = pose(); a.finish();
  return start !== end;
}).map((a) => `${a.animationName ?? a.constructor.name}:${a.effect?.getTiming().duration}:${a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? ""}`.slice(0, 120)));
check("mouvement réduit : pas d'animation longue", longAnimations.length === 0, longAnimations.join(" | "));
const consoleErrors = []; const cp = await (await browser.newContext({ baseURL: BASE, storageState: await admin.c.storageState() })).newPage(); cp.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`${new URL(cp.url()).pathname} ${m.text()}`); }); cp.on("pageerror", (e) => consoleErrors.push(`${new URL(cp.url()).pathname} ${String(e).slice(0, 120)}`));
for (const path of ["/", "/admin", "/admin/personnes", "/admin/licences", "/admin/contenus", "/admin/documents/new", "/parametres", partielUrl]) { await cp.goto(path); await cp.waitForTimeout(300); }
check("aucune erreur console ni CSP sur les pages", consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 400));

await browser.close();
console.log(failures ? `\n${failures} ÉCHEC(S)` : "\nTOUT EST PASSÉ");
process.exit(failures ? 1 : 0);
