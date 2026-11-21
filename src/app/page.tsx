import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { IndependenceNotice } from "@/components/independence";
import { JsonLd } from "@/components/json-ld";
import { landingData, type LandingData } from "@/components/landing/data";
import { FontSampler } from "@/components/landing/bento-demos";
import { Deck } from "@/components/landing/deck";
import { IPhoneFrame, SafariWindow, TabletFrame } from "@/components/landing/frames";
import { HeroPhone } from "@/components/landing/hero-phone";
import { AiDemos, Devices, type Demo } from "@/components/landing/interactive";
import { LandingFx } from "@/components/landing/landing-fx";
import { Shot } from "@/components/landing/shot";
import { Story } from "@/components/landing/story";
import { TopBar, type Cta } from "@/components/landing/top-bar";
import { Logo } from "@/components/logo";
import { ReadingSettings } from "@/components/reading-settings";
import { ConsentLink } from "@/components/tracker";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { buttonVariants } from "@/components/ui/button";
import { loadSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { HOME, homeOf } from "@/lib/home";
import { inCity, independenceText, ofOrganization, type Organization } from "@/lib/organization-text";
import { parsePrefs } from "@/lib/prefs";
import { organizationLd, publicMetadata, websiteLd } from "@/lib/seo";
import { IconAiPrivacy, IconChevronRight } from "@/lib/icons";
// Styles de la seule présentation : hors de la feuille commune, que chaque page du site charge
import "@/styles/landing.css";

const TITLE = "Campuss : les cours de ta licence, partagés entre étudiants";
const descriptionOf = (org: Organization) => `Cours, fiches, TD corrigés et anciens partiels${ofOrganization(org)}, écrits par les étudiants. Gratuit, sans pub, avec des fiches de révision.`;

// La présentation est l’adresse du site, « / », pour tout le monde (l’ancienne /presentation y redirige en 308).
// Page indexable (src/lib/indexable.ts) : le layout met le reste en noindex, next.config.ts y ajoute X-Robots-Tag
// Établissement lu à l’exécution (lib/env.ts), jamais figé au build
export async function generateMetadata(): Promise<Metadata> {
  return publicMetadata({ path: "/", title: TITLE, description: descriptionOf(env.organization), absolute: true });
}

/** La réponse à citer telle quelle (FAQ, données structurées, /llms.txt) : qui, quoi, où, et l'indépendance. */
const whatIsOf = (org: Organization) => `Un site web gratuit où les étudiants${ofOrganization(org)} partagent leurs cours, fiches, TD corrigés et anciens partiels, puis les révisent avec des fiches mémo. ${independenceText(org.university)} Le code de Campuss est open source.`;

const SECTION = "lp-anchor mx-auto w-full max-w-6xl px-4 md:px-8";
/** Largeur de la capture partielle de la section Lire (7/12 de la grille sur grand écran). */
const CASE_SIZES = "(max-width: 1023px) calc(100vw - 2rem), 640px";
const LINK = "font-semibold text-[var(--link)] underline-offset-4 hover:underline";

const DECK = [
  { subject: "Microéconomie", front: "Quand dit-on qu’une demande est élastique ?", back: "Quand la valeur absolue de l’élasticité-prix dépasse 1 : la quantité varie plus que le prix." },
  { subject: "Microéconomie", front: "Qu’est-ce que le prix d’équilibre ?", back: "Le prix pour lequel la quantité demandée égale la quantité offerte." },
  { subject: "Microéconomie", front: "Un bien inférieur, c’est…", back: "Un bien dont la demande baisse quand le revenu augmente." },
  { subject: "Statistiques", front: "La médiane d’une série, c’est…", back: "La valeur qui partage la série ordonnée en deux moitiés de même effectif." },
];

function ctaOf(registration: LandingData["registration"]): Cta {
  if (registration.mode === "open") return { href: "/register", label: "Créer mon compte" };
  if (registration.mode === "invite") return { href: "/register", label: "Tu as une invitation ?" };
  return null;
}

const list = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`);
const nf = (n: number) => n.toLocaleString("fr-FR");

function faqOf(data: LandingData, org: Organization): [string, string][] {
  const { registration, programs, ai, instantDomain } = data;
  const signup = registration.mode === "open"
    ? `Les étudiants${ofOrganization(org)}, avec leur adresse étudiante.${instantDomain ? ` Avec une adresse @${instantDomain}, ton compte est actif dès la confirmation du mail.` : ""}`
    : registration.mode === "invite" ? "Pour l’instant, sur invitation : ouvre le lien que tu as reçu." : registration.closedMessage;
  return [
    ["Qu’est-ce que Campuss ?", whatIsOf(org)],
    ["C’est gratuit ?", "Oui, et sans pub. Le projet est porté bénévolement par des étudiants."],
    ["Qui relit les cours ?", "Les délégués de ta licence et la modération, avant toute publication. Seuls eux, et les enseignants dans leurs matières, publient sans passer par cette relecture."],
    ["Qui peut s’inscrire ?", signup],
    ["Quelles licences sont ouvertes ?", programs.later.length ? `${list(programs.open)} d’abord. ${list(programs.later)} suivront.` : `${list(programs.open)}.`],
    ["C’est légal de partager des cours ?", "On publie ses propres notes, son travail personnel et des documents partagés avec l’accord écrit de l’enseignant. L’origine est déclarée à chaque dépôt, et un enseignant peut demander un retrait."],
    ["Qui voit ce que je fais ?", "Tes cours publiés sont visibles dans ta licence. Ceux qui ne sont pas tes amis voient ton prénom et l’initiale de ton nom. Tes révisions, seulement tes amis, si tu le choisis."],
    ...(ai ? [["Campuss IA lit mes cours ?", `Seulement ce que tu lui confies, et le texte des cours publiés pour en tirer un quiz. Elle passe par ${ai.provider.name}, qui ne reçoit jamais ton nom ni ton compte.`] as [string, string]] : []),
    ["Je peux partir avec mes données ?", "Oui : tu les télécharges depuis ton compte. Si tu le supprimes, tes cours publiés restent, sans ton nom."],
    ["C’est lié à l’université ?", `Non. ${independenceText(org.university)}`],
  ];
}

/** Les anciens liens de l'accueil connecté (« /?semestre=… », « /?q=… ») retrouvent leur page sous /accueil. */
const HOME_PARAMS = ["q", "licence", "semestre"];

/**
 * Rendue à la demande : figée au build, elle montrerait Campuss IA et les réglages tels qu’ils étaient ce jour-là. Elle
 * dépend aussi de la session (« Ouvrir Campuss ») : réponse privée, jamais en cache (proxy.ts, Cache-Control).
 */
export default async function LandingPage({ searchParams }: PageProps<"/">) {
  await connection();
  const session = await loadSession();
  const signedIn = Boolean(session);
  // Thème des réglages (compte ou cookie, comme le layout) : les captures suivent la page, pas seulement le système
  const theme = (session?.user.prefs ?? parsePrefs((await cookies()).get("campuss-prefs")?.value)).theme ?? null;
  if (signedIn) {
    const params = await searchParams;
    const kept = new URLSearchParams();
    for (const key of HOME_PARAMS) if (typeof params[key] === "string") kept.set(key, params[key]);
    if (kept.size) redirect(homeOf(`/?${kept}`));
  }
  const data = await landingData();
  const org = env.organization;
  const { shots, ai } = data;
  // Connecté : l'action principale ouvre l'application, à la place de l'inscription
  const cta: Cta = signedIn ? { href: HOME, label: "Ouvrir Campuss" } : ctaOf(data.registration);
  const shot = (name: string, alt: string, opts: { priority?: boolean; cover?: boolean; sizes?: string } = {}) => (shots[name] ? <Shot name={name} size={shots[name]} alt={alt} theme={theme} {...opts} /> : null);
  const phone = (name: string, alt: string) => (shots[name] ? <IPhoneFrame>{shot(name, alt, { cover: true })}</IPhoneFrame> : null);

  const proofLine = data.proofs.length >= 2
    ? data.proofs.slice(0, 3).map((p) => `${nf(p.value)}${p.more ? "+" : ""} ${p.label}`).join(" · ")
    : `${list(data.programs.open)} ${data.programs.open.length > 1 ? "ouvertes" : "ouverte"}${data.programs.later.length ? ` · ${list(data.programs.later)} ensuite` : ""}`;

  const candidates: (Demo | null)[] = ai ? [
    ai.imports && shots["ia-photo"] ? { value: "photo", label: "Photo → cours", text: "Tes notes manuscrites deviennent un cours propre, titres et formules compris.", visual: phone("ia-photo", "Une photo de notes transcrite en cours") } : null,
    shots["ia-classement"] ? { value: "classement", label: "Classement", text: "Titre, matière, type : remplis pour toi d’après ton fichier.", visual: phone("ia-classement", "Le titre et la matière proposés par Campuss IA") } : null,
    shots["ia-fiches"] ? { value: "fiches", label: "Fiches mémo", text: "Des fiches tirées du cours, que tu relis et corriges avant de les garder.", visual: phone("ia-fiches", "Les fiches à réviser sur téléphone") } : null,
    shots["ia-quiz"] ? { value: "quiz", label: "Quiz", text: "Un QCM sur le cours pour vérifier que c’est su.", visual: phone("ia-quiz", "Une question de quiz sur l’offre et la demande") } : null,
  ] : [];
  const demos = candidates.filter((d): d is Demo => d !== null);
  const provider = demos.length > 0 ? ai?.provider : undefined;

  const anchors = [
    { href: "#semaine", label: "Une semaine" },
    { href: "#partager", label: "Partager" },
    ...(provider ? [{ href: "#campuss-ia", label: "Campuss IA" }] : []),
    { href: "#vie-privee", label: "Confiance" },
    { href: "#questions", label: "Questions" },
  ];

  // Écrans du téléphone du héros : le premier est l'image prioritaire (LCP au téléphone)
  const heroScreens = [
    { key: "tel-cours", label: "Cours", alt: "Un cours de microéconomie sur téléphone, avec un passage surligné" },
    { key: "tel-accueil", label: "Accueil", alt: "L’accueil de Campuss sur téléphone : la séance du jour et les cours à reprendre" },
    { key: "ia-fiches", label: "Fiches", alt: "Les fiches de révision : à revoir, nouvelles, prévision de la semaine" },
    { key: "tel-partiels", label: "Partiels", alt: "Le partiel de statistiques dans 12 jours, avec son plan de révision" },
  ].filter((s) => shots[s.key]).map((s, i) => ({ key: s.key, label: s.label, shot: shot(s.key, s.alt, { priority: i === 0, cover: true }) }));

  // Une semaine d'étudiant, du lundi au partiel : ce que Campuss fait vraiment, écran par écran
  const story = [
    { key: "tel-accueil", kicker: "Lundi matin", title: "Tu sais par où reprendre.", text: "L’accueil te montre la séance du jour et les cours que tu as commencés. Tout est rangé par licence, année, semestre et matière : deux clics jusqu’au bon chapitre.", alt: "L’accueil : la séance du jour et les cours à reprendre" },
    { key: "tel-cours", kicker: "Mardi, après l’amphi", title: "Tu as manqué le CM ? Lis celui de ta promo.", text: "Si quelqu’un de ta licence a publié le cours, il est dans la matière, au bon chapitre. Tu surlignes, tu écris tes questions dans la marge : le cours reste intact, tes notes restent à toi.", alt: "Un cours avec un passage surligné" },
    { key: "ia-fiches", kicker: "Jeudi soir", title: "Tes fiches reviennent juste avant l’oubli.", text: "Recto, verso, formules si besoin. La révision espacée te les ressort au bon moment. Tu as déjà des fiches ailleurs ? Importe un export d’Anki, de Quizlet ou un tableur.", alt: "Les fiches : à revoir, nouvelles, prévision de la semaine" },
    { key: "tel-partiels", kicker: "Trois semaines avant", title: "Le partiel a une date, et toi un plan.", text: "Les partiels et les CC sont annoncés dans ta matière. Campuss compte les jours, te les rappelle et répartit tes révisions jour par jour. Un partiel blanc te dit où tu en es.", alt: "Le partiel de statistiques dans 12 jours et son plan de révision" },
    { key: "tel-amis", kicker: "Le soir", title: "Tu révises avec tes amis.", text: "Ajoute-les par leur code ou leur nom, lancez-vous des défis, suivez vos séries. Tes révisions ne sont visibles que d’eux, et seulement si tu le veux.", alt: "La page Amis et une demande d’ami" },
  ].filter((s) => shots[s.key]).map((s) => ({ ...s, screen: shot(s.key, s.alt, { cover: true }) }));

  const faq = faqOf(data, org);
  const jsonLd = [
    organizationLd(),
    websiteLd(),
    {
      "@context": "https://schema.org", "@type": "WebApplication", "@id": `${env.baseUrl}/#application`, name: "Campuss", url: `${env.baseUrl}/`,
      description: descriptionOf(org), abstract: whatIsOf(org), inLanguage: "fr", applicationCategory: "EducationalApplication", operatingSystem: "Web",
      isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "EUR" }, publisher: { "@id": `${env.baseUrl}/#organisation` },
      audience: { "@type": "EducationalAudience", educationalRole: "student", audienceType: `Étudiants de licence${ofOrganization(org)}` },
      featureList: [
        "Cours, fiches, TD corrigés et anciens partiels partagés par les étudiants, rangés par licence, année, semestre et matière",
        "Relecture de chaque cours d’étudiant avant sa publication",
        "Surlignage et notes en marge",
        "Fiches mémo en révision espacée, import depuis Anki, Quizlet ou un tableur",
        "Partiels et contrôles continus : compte à rebours, rappels, plan de révision et partiel blanc",
        "Révision entre amis",
        ...(ai ? ["Campuss IA : transcription de notes photographiées, fiches mémo et quiz tirés des cours"] : []),
        "Lecture adaptée : polices OpenDyslexic et Atkinson Hyperlegible, taille, interligne, mode sombre",
      ],
    },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];

  const primary = (big?: boolean) => cta
    ? <Link href={cta.href} data-slot="button" className={cn(buttonVariants(), `lp-cta rounded-full px-7 text-base ${big ? "h-14 px-8 text-lg" : "h-12"}`)}>{cta.label}<Icon icon={IconChevronRight} /></Link>
    : null;

  return (
    <div className="lp-root">
      <JsonLd data={jsonLd} />
      <LandingFx />
      <TopBar cta={cta} anchors={anchors} signedIn={signedIn} />
      <main className="flex-1">
        {/* Héros : colonnes décalées, le titre en très grand ; le texte ne bouge pas (LCP) */}
        <section className={`${SECTION} grid items-center gap-x-10 gap-y-12 pt-24 pb-16 md:pt-28 lg:min-h-[min(100svh,56rem)] lg:grid-cols-12 lg:pb-20`}>
          <div className="lg:col-span-7">
            {org.short && <p className="lp-kicker">{org.short}</p>}
            <h1 className="lp-h1 mt-5 text-balance">Les cours de ta licence, écrits par <em>ta promo</em>.</h1>
            <p className="lp-lede mt-8">Le CM de mardi que tu as manqué, le TD corrigé, le sujet du partiel de l’an dernier : sur Campuss, les étudiants de ta licence les publient, rangés par semestre et par matière, relus avant d’être en ligne. Toi, tu les lis, tu les annotes et tu les révises.</p>
            <div id="hero-cta" className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              {cta ? primary() : <><p className="w-full lp-muted">{data.registration.closedMessage}</p><Link href="/login" data-slot="button" className={cn(buttonVariants(), "lp-cta h-12 rounded-full px-7 text-base")}>Se connecter</Link></>}
              <a className="lp-ghost" href="#semaine">Une semaine avec Campuss</a>
            </div>
            <p className="mt-6 text-sm lp-muted">Gratuit et sans pub.{data.instantDomain && ` Avec ton adresse @${data.instantDomain}, ton compte est actif dès la confirmation du mail.`}</p>
            <p className="mt-2 text-sm font-semibold tabular-nums text-[var(--brand-text)]">{proofLine}</p>
          </div>
          {heroScreens.length > 0 && (
            <div className="mx-auto w-full max-w-[26rem] lg:col-span-5 lg:max-w-none">
              <HeroPhone screens={heroScreens} />
            </div>
          )}
        </section>

        {story.length > 0 && (
          <section id="semaine" className={`${SECTION} py-16 md:py-24`}>
            <p className="lp-rubric"><span>01</span><span>Une semaine avec Campuss</span></p>
            <h2 className="lp-h2 lp-reveal mt-8 max-w-[14ch] text-balance">Du lundi matin au jour du partiel.</h2>
            <div className="mt-12 md:mt-16"><Story steps={story} /></div>
          </section>
        )}

        {shots["ordi-accueil"] && (
          <section className={`${SECTION} py-16 md:py-24`}>
            <p className="lp-rubric"><span>02</span><span>Sur ordinateur</span></p>
            <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:items-end">
              <h2 className="lp-h2 lp-reveal text-balance lg:col-span-7">Toute ta licence dans une fenêtre.</h2>
              <p className="lp-reveal lp-lede lp-muted lg:col-span-5">Ctrl K cherche un cours, une fiche ou une matière sans lâcher le clavier. Les cours longs ont leur sommaire à côté du texte.</p>
            </div>
            <div className="lp-reveal mt-12 lg:-mr-24 xl:-mr-40">
              <SafariWindow>{shot("ordi-accueil", "L’accueil de Campuss sur ordinateur : les cours de la licence rangés par matière")}</SafariWindow>
            </div>
          </section>
        )}

        <section className={`${SECTION} py-16 md:py-24`}>
          <p className="lp-rubric"><span>03</span><span>Essaie</span></p>
          <div className="mt-8 grid items-center gap-12 lg:grid-cols-12">
            <div className="lp-reveal lg:col-span-5">
              <h2 className="lp-h2 text-balance">Une fiche, ça se retourne.</h2>
              <p className="lp-lede lp-muted mt-6">Comme dans Réviser : retourne la fiche, puis lance-la à droite si tu la savais, à gauche sinon. Au clavier : Espace, puis les flèches.</p>
            </div>
            <div className="lp-reveal lg:col-span-6 lg:col-start-7"><Deck cards={DECK} /></div>
          </div>
        </section>

        <section className={`${SECTION} py-16 md:py-24`}>
          <p className="lp-rubric"><span>04</span><span>Lire</span></p>
          <div className="mt-8 grid gap-12 lg:grid-cols-12">
            <div className="lp-reveal lg:col-span-5">
              <h2 className="lp-h2 text-balance">Lis comme tu lis le mieux.</h2>
              <p className="lp-lede lp-muted mt-6">Police adaptée à la dyslexie, taille du texte, interligne, mode sombre : tes réglages valent pour tous les cours. Essaie sur un vrai passage :</p>
              <div className="mt-8"><FontSampler /></div>
            </div>
            {shots["case-annote"] && (
              <figure className="lp-reveal lg:col-span-7 lg:mt-24">
                <div className="lp-crop">{shot("case-annote", "Un passage surligné dans un cours, avec une note en marge", { sizes: CASE_SIZES })}</div>
                <figcaption className="mt-3 text-sm lp-muted">Tes surlignages et tes notes en marge restent face au texte, et ne sont qu’à toi.</figcaption>
              </figure>
            )}
          </div>
        </section>

        {provider && (
          <section id="campuss-ia" className={`${SECTION} py-16 md:py-24`}>
            <p className="lp-rubric"><span>05</span><span>Campuss IA</span></p>
            <h2 className="lp-h2 lp-reveal mt-8 max-w-[18ch] text-balance">Prends tes notes en photo, Campuss IA en fait un cours.</h2>
            <p className="lp-lede lp-muted lp-reveal mt-6">Elle propose, tu choisis. Rien n’est publié sans toi, ni sans relecture.</p>
            <div className="lp-reveal mt-12">
              <AiDemos
                demos={demos}
                privacy={
                  <span className="flex items-start gap-2">
                    <Icon icon={IconAiPrivacy} className="mt-0.5 shrink-0" />
                    <span>
                      Campuss IA passe par {provider.name}{provider.host && provider.host !== provider.name ? ` (${provider.host})` : ""}. Il reçoit seulement ce que tu lui confies, une photo ou le texte d’un cours, jamais ton nom ni ton compte.
                      {provider.host.endsWith("googleapis.com") && " Son offre gratuite peut réutiliser ce qu’elle reçoit : n’y mets pas de données personnelles."}
                    </span>
                  </span>
                }
              />
            </div>
          </section>
        )}

        <section id="partager" className={`${SECTION} py-16 md:py-24`}>
          <p className="lp-rubric"><span>{provider ? "06" : "05"}</span><span>Partager</span></p>
          <h2 className="lp-h2 lp-reveal mt-8 max-w-[16ch] text-balance">Tes notes peuvent servir à toute ta licence.</h2>
          <ol className="lp-steps lp-reveal mt-12">
            <li><h3 className="lp-h3">Écris sur la page du cours, ou importe tes notes.</h3><p className="mt-2 lp-muted">Ce que tu vois en écrivant est ce que ta promo lira. L’enregistrement est automatique.</p></li>
            <li><h3 className="lp-h3">Un délégué de ta licence le relit.</h3><p className="mt-2 lp-muted">Rien n’est en ligne avant. Tu déclares l’origine : tes notes, ton travail, ou un document de l’enseignant avec son accord écrit.</p></li>
            <li><h3 className="lp-h3">Il est publié pour toute ta licence.</h3><p className="mt-2 lp-muted">On peut te dire merci. Tes paquets de fiches, eux, se publient pour ta promo en un bouton.</p></li>
          </ol>
        </section>

        {shots["tel-accueil"] && shots["tablette-cours"] && shots["ordi-cours"] && (
          <section className={`${SECTION} py-16 md:py-24`}>
            <p className="lp-rubric"><span>{provider ? "07" : "06"}</span><span>Partout</span></p>
            <h2 className="lp-h2 lp-reveal mt-8 text-balance">Sur ton téléphone, ta tablette, ton ordi.</h2>
            <div className="lp-reveal mt-10">
              <Devices panels={[
                { value: "phone", label: "Téléphone", text: "Installe Campuss sur ton écran d’accueil et garde un cours pour le lire sans réseau, dans le tram ou à la BU.", visual: <div className="mx-auto w-64">{phone("tel-accueil", "L’accueil de Campuss sur téléphone")}</div> },
                { value: "tablet", label: "Tablette", text: "Le cours en grand, tes surlignages et tes notes à côté.", visual: <TabletFrame className="mx-auto max-w-md">{shot("tablette-cours", "Un cours de microéconomie sur tablette", { sizes: "(max-width: 480px) 90vw, 420px" })}</TabletFrame> },
                { value: "laptop", label: "Ordinateur", text: "Tout au clavier. Ctrl K pour chercher.", visual: <SafariWindow className="mx-auto max-w-4xl">{shot("ordi-cours", "Un cours de microéconomie sur ordinateur, avec son sommaire", { sizes: "(max-width: 960px) 100vw, 896px" })}</SafariWindow> },
              ]} />
            </div>
          </section>
        )}

        {/* Preuves : seulement des chiffres réels, au-dessus de leur seuil et arrondis vers le bas */}
        {data.proofs.length >= 3 && (
          <section className={`${SECTION} py-16 md:py-24`}>
            <p className="lp-rubric"><span>·</span><span>Aujourd’hui sur Campuss</span></p>
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
              {data.proofs.slice(0, 4).map((p, i) => (
                <div key={p.key} className="lp-reveal flex flex-col-reverse gap-2" style={{ "--i": i } as CSSProperties}>
                  <dt className="lp-muted">{p.label}</dt>
                  <dd className="lp-number">{nf(p.value)}{p.more && "+"}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section id="vie-privee" className={`${SECTION} py-16 md:py-24`}>
          <p className="lp-rubric"><span>·</span><span>Confiance</span></p>
          <h2 className="lp-h2 lp-reveal mt-8 text-balance">Ce que Campuss n’est pas.</h2>
          <dl className="lp-not lp-reveal mt-12">
            <div><dt>Un site de l’université.</dt><dd>{independenceText(org.university)} Il est fait bénévolement par des étudiants{inCity(org)}.</dd></div>
            <div><dt>Une vitrine à pub.</dt><dd>Pas de publicité, pas de pisteur publicitaire, rien à vendre. La mesure d’audience est interne, et le suivi lié à ton compte n’a lieu que si tu l’acceptes.</dd></div>
            <div><dt>Un dépôt sans contrôle.</dt><dd>Un cours proposé par un étudiant est relu avant sa publication et déclare son origine. Un enseignant peut demander un retrait.</dd></div>
            <div><dt>Une boîte noire.</dt><dd>Campuss est open source et hébergé sur notre serveur. Tes données se téléchargent depuis ton compte.</dd></div>
          </dl>
          <p className="lp-reveal mt-8 lp-muted"><Link className={LINK} href="/confidentialite">Lire la politique de confidentialité</Link> · Enseignant ? <Link className={LINK} href="/contact">Écris-nous</Link></p>
        </section>

        <section id="questions" className={`${SECTION} grid gap-10 py-16 md:py-24 lg:grid-cols-12`}>
          <div className="lg:col-span-4 lg:sticky lg:top-24 lg:self-start">
            <p className="lp-rubric"><span>·</span><span>Questions</span></p>
            <h2 className="lp-h2 mt-8">On nous demande souvent.</h2>
          </div>
          <Accordion className="lp-reveal lg:col-span-8">
            {faq.map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="py-5 text-lg">{q}</AccordionTrigger>
                <AccordionContent keepMounted className="text-base text-muted-foreground">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section id="final-cta" className="lp-final mt-8">
          <div className={`${SECTION} grid gap-10 py-20 md:py-28 lg:grid-cols-12 lg:items-end`}>
            <h2 className="lp-h1 text-balance lg:col-span-8">{data.examDays !== null ? `Premiers partiels dans ${data.examDays} jours.` : "Ta licence, tes cours, ta promo."}</h2>
            <div className="lg:col-span-4">
              {data.examDays !== null && <p className="text-xl text-[var(--muted-foreground)]">Commence à réviser maintenant.</p>}
              <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-4">
                {primary(true)}
                {!signedIn && <Link className="lp-ghost" href="/login">{cta ? "J’ai déjà un compte" : "Se connecter"}</Link>}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border pb-20 md:pb-0">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm md:grid-cols-3 md:px-8">
          <div>
            <Logo className="h-6 w-auto" />
            <p className="mt-3 text-muted-foreground">Fait{inCity(org)} par des étudiants.</p>
          </div>
          <nav aria-label="Le site">
            <p className="font-semibold">Le site</p>
            <ul className="mt-2 grid gap-1 text-muted-foreground [&_a]:inline-block [&_a]:py-1 [&_a:hover]:text-foreground">
              {anchors.filter((a) => a.href !== "#vie-privee").map((a) => <li key={a.href}><a href={a.href}>{a.label}</a></li>)}
              <li>{signedIn ? <Link href={HOME}>Ouvrir Campuss</Link> : <Link href="/login">Se connecter</Link>}</li>
            </ul>
          </nav>
          <nav aria-label="Informations">
            <p className="font-semibold">Informations</p>
            <ul className="mt-2 grid gap-1 text-muted-foreground [&_a]:inline-block [&_a]:py-1 [&_a:hover]:text-foreground">
              <li><Link href="/cgu">Conditions</Link></li>
              <li><Link href="/confidentialite">Confidentialité</Link></li>
              <li><Link href="/credits">Mentions et crédits</Link></li>
              <li><Link href="/contact">Signaler ou nous écrire</Link></li>
              <li><ConsentLink /></li>
            </ul>
          </nav>
          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6 text-muted-foreground md:col-span-3">
            <ReadingSettings />
            <IndependenceNotice className="min-w-0 flex-1" />
          </div>
        </div>
      </footer>
    </div>
  );
}
