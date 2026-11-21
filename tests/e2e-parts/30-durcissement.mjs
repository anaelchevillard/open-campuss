// En-têtes, security.txt, images extérieures et second facteur redemandé pour l'administration
export async function run({ admin, member, check, BASE, importedDoc, stepUpShown }) {
  const anonymous = await fetch(`${BASE}/.well-known/security.txt`, { redirect: "manual" });
  const text = await anonymous.text();
  check("security.txt : servi sans connexion", anonymous.status === 200 && (anonymous.headers.get("content-type") ?? "").startsWith("text/plain"));
  check("security.txt : champs de la RFC 9116", /^Contact: /m.test(text) && /^Expires: /m.test(text) && /^Canonical: /m.test(text));

  const home = await admin.goto("/admin");
  const headers = home.headers();
  const csp = headers["content-security-policy"] ?? "";
  const directive = (name) => csp.split("; ").find((d) => d.split(" ")[0] === name) ?? "";
  check("CSP : aucune image d'un site quelconque", !/\shttps:(\s|$)/.test(directive("img-src")));
  check("CSP : aucun média d'un site quelconque", directive("media-src") === "media-src 'self'");
  check("CSP : styles séparés en balises et attributs", Boolean(directive("style-src-elem")) && directive("style-src-attr") === "style-src-attr 'unsafe-inline'");
  if (BASE.startsWith("https:")) check("HSTS : envoyé", /max-age=\d+; includeSubDomains/.test(headers["strict-transport-security"] ?? ""));

  // Une image extérieure glissée dans une page ne se charge pas, et le reste du site s'affiche
  const blocked = await admin.evaluate(() => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(false);
    image.onerror = () => resolve(true);
    image.src = "https://example.com/pixel.png";
  }));
  check("CSP : image extérieure bloquée", blocked);

  if (importedDoc) {
    const seen = [];
    const listen = (request) => { if (request.resourceType() === "image" && request.frame() === member.mainFrame()) seen.push(request.url()); };
    member.on("request", listen);
    await member.goto(`/d/${importedDoc}`);
    await member.waitForTimeout(800);
    member.off("request", listen);
    check("cours : images servies par le site uniquement", seen.every((url) => url.startsWith(BASE) || url.startsWith("data:")));
    await member.screenshot({ path: "/shots/durcissement-cours.png" });
  }

  // Le parcours a déjà changé une licence et des rôles : la fenêtre a dû s'ouvrir au moins une fois, puis l'action repartir
  check("second facteur : redemandé pour une action sensible", stepUpShown() >= 1);
  await admin.goto("/admin/users");
  await admin.screenshot({ path: "/shots/durcissement-admin.png" });
}
