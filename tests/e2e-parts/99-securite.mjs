// Audit de sécurité : le nom de famille caché d'un non-ami ne sert pas de critère de recherche.
export async function run({ check, freshStudent }) {
  const tag = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
  await freshStudent(`zoe_secu${tag}@etu.exemple.fr`);
  const seeker = await freshStudent(`yann_cherche${tag}@etu.exemple.fr`);
  await seeker.goto("/amis");
  const box = seeker.getByRole("searchbox", { name: "Rechercher une personne par son nom" });
  const found = () => seeker.getByText("Zoe S.").first().waitFor({ timeout: 8000 }).then(() => true, () => false);

  // Avant le correctif, « Secu… » listait « Zoe S. » : le nom complet se devinait recherche après recherche
  await box.fill(`Secu${tag}`);
  check("recherche : un non-ami ne se trouve pas par son nom de famille caché", !(await found()));
  await box.fill("Zoe S");
  check("recherche : un non-ami se trouve par ce qui s'affiche (prénom et initiale)", await found());
}
