import { headers } from "next/headers";

/** Données structurées sous le nonce de la page (CSP stricte) ; « < » échappé pour ne jamais fermer la balise. */
export async function JsonLd({ data }: { data: object | object[] }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
