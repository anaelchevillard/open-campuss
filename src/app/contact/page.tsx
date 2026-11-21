import type { Metadata } from "next";
import { sendReport } from "@/app/actions/reading";
import { ActionForm } from "@/components/action-form";
import { Field, selectClass, TextField } from "@/components/field";
import { JsonLd } from "@/components/json-ld";
import { LegalShell } from "@/components/legal-shell";
import { Submit } from "@/components/submit";
import { Label } from "@/components/ui/label";
import { currentUser } from "@/lib/auth";
import { breadcrumbLd, publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({ path: "/contact", title: "Signaler ou nous écrire", description: "Enseignant ou ayant droit : demande le retrait d’un document publié sur Campuss. Tu peux aussi signaler une erreur ou poser une question sur tes données, sans compte." });

export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  const user = await currentUser();
  const doc = (await searchParams).doc;
  return (
    <>
      <JsonLd data={breadcrumbLd("/contact", "Signaler ou nous écrire")} />
      <LegalShell title="Signaler ou nous écrire">
        <p>Enseignant ou ayant droit, indique le document concerné et ta qualité : le contenu sera retiré dès que possible. Inutile d’avoir un compte.</p>
        <ActionForm action={sendReport} hideOnOk className="mt-5 grid max-w-xl gap-4">
          {typeof doc === "string" && <input type="hidden" name="doc" value={doc} />}
          <div className="grid gap-1.5">
            <Label htmlFor="kind" className="text-[0.95rem]">Objet</Label>
            <select id="kind" name="kind" defaultValue={typeof doc === "string" ? "error" : "rights"} className={selectClass}>
              <option value="rights">Droit d’auteur : demande de retrait</option>
              <option value="error">Erreur dans un document</option>
              <option value="privacy">Mes données personnelles</option>
              <option value="other">Autre question</option>
            </select>
          </div>
          {!user && <>
            <Field label="Nom" hint=" (facultatif)" name="name" maxLength={120} autoComplete="name" />
            <Field label="Adresse mail" hint=", pour te répondre" name="email" type="email" required autoComplete="email" />
          </>}
          <TextField label="Ton message" name="message" required minLength={10} maxLength={4000} rows={6} />
          <div className="absolute -left-[9999px]" aria-hidden="true"><label>Site web<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <div><Submit >Envoyer</Submit></div>
        </ActionForm>
      </LegalShell>
    </>
  );
}
