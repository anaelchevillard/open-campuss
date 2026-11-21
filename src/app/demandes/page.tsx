import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cn } from "cn";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { NeedCard } from "@/components/requests/need-card";
import { RequestList } from "@/components/requests/request-card";
import { RequestComposer } from "@/components/requests/request-composer";
import { SectionSwitch } from "@/components/requests/section-switch";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { SemesterSwitch } from "@/components/semester-switch";
import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { viewedTerm } from "@/lib/catalog";
import { listRequests, subjectsAuthoredBy } from "@/lib/course-requests";
import { missingBySubject } from "@/lib/coverage";
import { absoluteSemester, subjectsForSemester } from "@/lib/semester";
import { IconRequests } from "@/lib/icons";
import { inSentence } from "@/lib/subject-name";

export const metadata: Metadata = { title: "Demandes" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const VIEWS = { attendues: "Attendues", resolues: "Résolues", miennes: "Les miennes" } as const;
const NEED_LABELS = { cours: "Aucun cours", fiche: "Aucune fiche", partiel: "Aucun ancien partiel" } as const;

export default async function RequestsPage({ searchParams }: PageProps<"/demandes">) {
  const user = await requireUser();
  if (user.role === "teacher") redirect("/enseignant");
  const params = await searchParams;
  const view = (one(params.vue) in VIEWS ? one(params.vue) : "attendues") as keyof typeof VIEWS;
  const { level, parity, current } = await viewedTerm(user, params.semestre);
  const subjects = user.programId ? await subjectsForSemester(user.programId, level, parity) : [];
  const ids = subjects.map((s) => s.id);
  const picked = subjects.find((s) => String(s.id) === one(params.matiere));
  const scopeIds = picked ? [picked.id] : ids;
  const status = view === "resolues" ? "answered" : view === "miennes" ? "mine" : "open";
  const [requests, open, authored, missing] = await Promise.all([
    listRequests(user, { subjectIds: scopeIds, status, limit: 100 }),
    listRequests(user, { subjectIds: ids, status: "open", limit: 300 }),
    subjectsAuthoredBy(user.id),
    view === "attendues" && user.programId ? missingBySubject(user.programId, level, parity) : Promise.resolve([]),
  ]);
  // « Tu pourrais aider » : les demandes ouvertes des matières où la personne a déjà publié, en tête
  const helpable = view === "attendues" ? requests.filter((r) => authored.includes(r.subjectId)) : [];
  const others = requests.filter((r) => !helpable.includes(r));
  // Besoins détectés : un type attendu absent, sans demande ouverte qui le couvre déjà
  const needs = missing
    .filter((m) => !picked || m.subject.id === picked.id)
    .flatMap((m) => m.missing.map((category) => ({ subject: m.subject, category })))
    .filter((n) => !open.some((r) => r.subjectId === n.subject.id && r.category === n.category))
    .slice(0, 6);
  const label = `L${level} S${absoluteSemester(level, parity)}`;
  const base = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ vue: view === "attendues" ? null : view, matiere: picked ? String(picked.id) : null, semestre: one(params.semestre) || null, ...change })) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/demandes?${query}` : "/demandes";
  };
  const composerSubjects = subjects.map((s) => ({ id: s.id, name: s.name, shortName: s.shortName }));
  const initialSubject = Number(one(params.matiere)) || null;
  const nothing = !requests.length && !needs.length;

  return (
    <Shell user={user}>
      <SectionSwitch value="demandes" role={user.role} />
      <PageHeader title="Demandes"
        lead={<span className="tabular-nums">{open.length ? `${open.length} ${open.length > 1 ? "cours attendus" : "cours attendu"} en ${label}` : `Rien d’attendu en ${label}`}</span>}
        action={user.programId ? <SemesterSwitch level={level} value={parity} current={current} /> : undefined}
        tabs={<SegmentedTabs label="Demandes" value={view} items={Object.entries(VIEWS).map(([value, text]) => ({ value, label: text, href: base({ vue: value === "attendues" ? null : value }), count: value === "attendues" ? open.length : undefined }))} />} />
      <div className="grid max-w-3xl gap-6">
        {composerSubjects.length > 0 && <RequestComposer key={`${level}-${parity}`} subjects={composerSubjects} initialSubject={initialSubject} initialText={one(params.texte).slice(0, 160)} autoFocus={one(params.nouvelle) === "1"} />}
        {subjects.length > 1 && (
          <nav aria-label="Matières" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
            <ul className="flex w-max gap-1.5 md:w-auto md:flex-wrap">
              {[{ id: 0, name: "Toutes" }, ...subjects].map((s) => {
                const active = s.id ? picked?.id === s.id : !picked;
                return (
                  <li key={s.id}>
                    <Link href={base({ matiere: s.id ? String(s.id) : null })} scroll={false} aria-current={active ? "page" : undefined}
                      className={cn("flex min-h-9 items-center rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-(--dur-fast) coarse:min-h-11", active ? "border-transparent bg-brand-tint text-brand-text" : "border-border text-muted-foreground hover:text-foreground")}>
                      {"shortName" in s && s.shortName ? s.shortName : s.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
        {helpable.length > 0 && (
          <section aria-labelledby="aider" className="grid gap-3">
            <h2 id="aider" className="heading">Tu pourrais aider</h2>
            <RequestList requests={helpable} label="Tu pourrais aider" />
          </section>
        )}
        {others.length > 0 && (
          <section aria-label="Demandes de cours" className="grid gap-3">
            {helpable.length > 0 && <h2 className="heading">Toutes les demandes</h2>}
            <RequestList requests={others} label={VIEWS[view]} />
          </section>
        )}
        {needs.length > 0 && (
          <section aria-labelledby="besoins" className="grid gap-3">
            <h2 id="besoins" className="heading">Ce qui manque</h2>
            <ul className="stagger grid gap-2">
              {needs.map((n) => <NeedCard key={`${n.subject.id}-${n.category}`} subjectId={n.subject.id} subjectName={n.subject.name} category={n.category} label={`${NEED_LABELS[n.category]} en ${inSentence(n.subject.shortName || n.subject.name)}`} />)}
            </ul>
          </section>
        )}
        {nothing && (
          view === "miennes"
            ? <EmptyState icon={IconRequests} title="Aucune demande de ta part" description="Écris en haut le cours qui te manque" />
            : view === "resolues"
              ? <EmptyState icon={IconRequests} title="Aucune demande résolue ce semestre" />
              : <EmptyState icon={IconRequests} title="Tout est couvert ce semestre" />
        )}
      </div>
    </Shell>
  );
}
