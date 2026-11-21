// Une erreur provoquée dans le navigateur apparaît dans Admin › Erreurs, nettoyée.
export async function run({ admin, member, check, BASE }) {
  // Erreur non rattrapée, lancée hors de React : window.onerror → sendBeacon → /api/errors
  // Le rapporteur s'abonne après l'hydratation : on attend que la page soit calme avant de provoquer l'erreur
  await member.goto(`${BASE}/accueil`);
  await member.waitForLoadState("networkidle").catch(() => undefined);
  await member.waitForTimeout(1000);
  const sent = member.waitForResponse((r) => r.url().endsWith("/api/errors"), { timeout: 10000 }).catch(() => null);
  await member.evaluate(() => { setTimeout(() => { throw new TypeError("Panne e2e provoquée pour alice@exemple.fr"); }, 0); });
  check("erreurs : le navigateur envoie l'erreur", (await sent)?.status() === 204);
  await member.waitForTimeout(1000);

  await admin.goto(`${BASE}/admin/erreurs`);
  const row = admin.getByTestId("error-list").getByRole("link").filter({ hasText: "Panne e2e provoquée" }).first();
  await row.waitFor({ timeout: 10000 }).catch(() => undefined);
  check("erreurs : l'erreur du navigateur apparaît dans Admin › Erreurs", await row.isVisible().catch(() => false));
  check("erreurs : l'adresse mail est retirée avant l'écriture", !(await admin.getByText("alice@exemple.fr").count()) && (await row.textContent().catch(() => "") ?? "").includes("[adresse]"));
  check("erreurs : origine et nombre affichés", /Navigateur/.test(await row.textContent().catch(() => "") ?? "") && /\d+ fois/.test(await row.textContent().catch(() => "") ?? ""));

  // Détail : pile, exemples, puis « résolue »
  await row.click().catch(() => undefined);
  await admin.waitForURL(/\/admin\/erreurs\/\d+$/).catch(() => undefined);
  check("erreurs : détail avec le message et les exemples", (await admin.getByTestId("error-message").textContent().catch(() => "") ?? "").includes("Panne e2e provoquée") && await admin.getByRole("heading", { name: "Derniers exemples" }).isVisible());
  await admin.getByRole("button", { name: "Marquer résolue" }).click().catch(() => undefined);
  await admin.getByRole("button", { name: "Rouvrir" }).waitFor({ timeout: 10000 }).catch(() => undefined);
  check("erreurs : marquée résolue", await admin.getByRole("button", { name: "Rouvrir" }).isVisible().catch(() => false));
  await admin.goto(`${BASE}/admin/erreurs?statut=resolved`);
  check("erreurs : rangée dans « Résolues »", await admin.getByTestId("error-list").getByText("Panne e2e provoquée").first().isVisible().catch(() => false));

  // Accès et garde-fous
  check("erreurs : réservé aux administrateurs", (await member.goto(`${BASE}/admin/erreurs`))?.status() === 404);
  const foreign = await member.evaluate(async () => (await fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status);
  check("erreurs : un envoi invalide reçoit la même réponse muette", foreign === 204, String(foreign));
}
