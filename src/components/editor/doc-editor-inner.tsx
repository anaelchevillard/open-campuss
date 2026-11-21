"use client";

import { fr } from "@blocknote/core/locales";
import { locales as mathLocales } from "@blocknote/math-block";
import { useCreateBlockNote } from "@blocknote/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { addCoauthor, deleteDraft, finishDocument, proposeRevision, removeCoauthor, removeDraftFile, saveDocument, setCover, type FinishResult } from "@/app/actions/course";
import { Notice } from "@/components/action-form";
import { AiWorking } from "@/components/ai/ai-working";
import { Attest, AttestReminder } from "@/components/attest";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CoverPicker } from "@/components/cover-picker";
import type { TocItem } from "@/components/reading/doc-frame";
import { DraftFiles } from "@/components/draft-files";
import { Field } from "@/components/field";
import { StartTiles, useImportBusy, type ImportTarget } from "@/components/import/start-tiles";
import { useImportJob } from "@/components/import/import-jobs";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { FileType, getFileType } from "@/components/reui/file-type";
import { Submit } from "@/components/submit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SubjectPicker } from "@/components/subject-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserName } from "@/components/user-name";
import { markdownToBlocks } from "@/lib/blocks";
import { takeSharedFiles } from "@/lib/share-client";
import { keepPendingFiles } from "@/lib/pending-files";
import { courseTemplate } from "@/lib/course-template";
import { CATEGORIES, RIGHTS, RIGHTS_FOR_EXAMS, RIGHTS_SHORT, type RightsBasis } from "@/lib/db/categories";
import { REVIEW_PROMISE } from "@/lib/review-wait";
import { askedDetails, CHAPTERLESS, missingDetails, type DetailKey } from "@/lib/doc-details";
import { EditorSurface } from "./block-editor";
import { EditorDocContext } from "./editor-doc";
import { PageEditor, SaveStatus } from "./page-editor";
import { campussSchema, type CampussEditor } from "./schema";
import { Icon } from "@/components/icon";
import { IconAiIdea, IconAiScan, IconClose, IconCloudUpload, IconDelete, IconExpand, IconMore, IconToFix } from "@/lib/icons";

export const frenchDictionary = {
  ...fr,
  math: mathLocales.fr,
  placeholders: { ...fr.placeholders, default: "Tape / pour insérer", emptyDocument: "Tape / pour insérer" },
};

export function makeUploader(url: string, onError: (message: string) => void) {
  return async (file: File) => {
    const response = await fetch(url, { method: "POST", body: file, headers: { "x-filename": encodeURIComponent(file.name) } });
    const data = await response.json().catch(() => ({})) as { url?: string; error?: string };
    if (!response.ok || !data.url) { onError(data.error ?? "Le fichier n’a pas pu être envoyé."); throw new Error("envoi refusé"); }
    return data.url;
  };
}

/** Rien que le modèle de départ, sans texte : un import peut le remplacer sans rien perdre. */
const isUntouched = (editor: CampussEditor) => isBlank(editor.document as unknown[]);

function isBlank(blocks: unknown[]) {
  return (blocks as { type: string; content?: unknown }[]).every((block) => {
    if (block.type === "heading") return true;
    return block.type === "paragraph" && (!Array.isArray(block.content) || block.content.length === 0);
  });
}

type Person = { id: string; name: string; avatarKey: string | null };
type Fields = { title: string; subject: number | null; category: keyof typeof CATEGORIES; chapter: string; semester: string; rights: string; teacher: string };
type Attachment = { id: string; filename: string; size: string; scanning: boolean };

export type DocEditorProps = {
  docId: string; initial: unknown[]; fields: Fields; mode: "draft" | "proposal"; program: string; year: string; published: boolean; reviewRequested: boolean; reviewNote: string | null;
  coverFileId: string | null; author: Person; coauthors: Person[]; friends: Person[]; subjects: { id: number; name: string; level: number; semester?: number | null }[]; files: Attachment[];
  canPublish: boolean; canOcr: boolean; notionReady: boolean; startImport: boolean; startShare: boolean;
  aiReady: boolean; pagesLeft: number | null; ocrAccepted: boolean; acceptedCategories: string[]; reviewWait?: string | null;
  canDirect?: boolean; answering?: string | null; channel?: NotesChannel;
  /** Année fixée dans le choix de la matière (un étudiant rédige dans la sienne) */
  lockedLevel?: number | null;
  /** Enseignant : chapitre, semestre et nom de l'enseignant ne sont pas exigés à l'envoi */
  detailsOptional?: boolean;
  /** Fil auteur ↔ relecteur, rendu côté serveur (contrat ReviewThread) */
  reviewThread?: ReactNode;
  depart?: "photo" | "notion" | "google" | "fichier";
};

/** Ce que la prise de notes à plusieurs ajoute à l'éditeur. Yjs reste dans son propre morceau : voir notes-editor-inner. */
export type NotesChannel = {
  configure: (options: Record<string, unknown>) => unknown;
  ready: boolean;
  seeds: boolean;
  panel: ReactNode;
  locked: boolean;
  isEmpty: () => boolean;
  markSeeded: () => boolean;
  shareFields: (patch: Record<string, unknown>) => void;
  onFields: (listener: (patch: Partial<Fields>) => void) => () => void;
  announce: (what: "sent" | "published") => void;
  onAnnounce: (listener: (what: "sent" | "published") => void) => () => void;
};

type Suggestion = { title: string | null; subject: number | null; category: keyof typeof CATEGORIES; chapter: number | null };

const SUGGESTED_LABELS: Partial<Record<keyof Fields, string>> = { title: "Titre", subject: "Matière", category: "Type", chapter: "Chapitre" };

function Chip({ label, empty, missing, suggested, children }: { label: string; empty?: boolean; missing?: boolean; suggested?: boolean; children: ReactNode }) {
  return <label className={suggested ? "doc-field ai-border" : "doc-field"} data-empty={empty || undefined} data-missing={missing || undefined}><span className="sr-only">{label}</span>{suggested && <Icon icon={IconAiIdea} size={16} className="size-3.5 text-[var(--ai-3)]" />}{children}<Icon icon={IconExpand} size={16} className="size-3 shrink-0 opacity-60" /></label>;
}

function outlineOf(editor: CampussEditor): TocItem[] {
  const items: TocItem[] = [];
  for (const block of editor.document as { id: string; type: string; props?: { level?: number }; content?: unknown }[]) {
    if (block.type !== "heading" || !Array.isArray(block.content)) continue;
    const text = (block.content as { text?: string }[]).map((c) => c.text ?? "").join("").trim();
    if (text) items.push({ id: block.id, text, depth: (block.props?.level ?? 2) <= 2 ? 2 : 3 });
  }
  return items;
}

/** Écrire sur la page finale : le titre, la matière et les pièces jointes sont à leur place, et tout s'enregistre seul. */
export function DocEditorInner({ docId, initial, fields: initialFields, mode, year, published, reviewRequested, reviewNote, coverFileId, author, coauthors, friends, subjects, files, canPublish, canOcr, startImport, startShare, aiReady, acceptedCategories, reviewWait, canDirect = false, answering = null, channel, reviewThread, depart, lockedLevel = null, detailsOptional = false }: DocEditorProps) {
  const router = useRouter();
  const proposal = mode === "proposal";
  const [fields, setFields] = useState(initialFields);
  const latest = useRef(initialFields);
  const [state, setState] = useState<"saved" | "dirty" | "saving">("saved");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(reviewRequested);
  const [dialog, setDialog] = useState<"finish" | "delete" | null>(null);
  const [attested, setAttested] = useState(false);
  const [accepted, setAccepted] = useState(acceptedCategories);
  const [proposing, setProposing] = useState(false);
  const [suggested, setSuggested] = useState<ReadonlySet<keyof Fields>>(new Set());
  const edited = useRef(new Set<keyof Fields>());
  const fallbackTitle = useRef("");
  const shareTaken = useRef(false);
  const [notDuplicate, setNotDuplicate] = useState(false);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [missing, setMissing] = useState<DetailKey[]>([]);
  // Champs de la fenêtre d'envoi, fixés à l'ouverture (askedDetails) : un champ rempli reste affiché jusqu'à l'envoi
  const [asked, setAsked] = useState<DetailKey[]>([]);
  const [summary, setSummary] = useState("");
  const [finishing, setFinishing] = useState(false);
  // Un brouillon vide commence par la zone de dépôt ; elle s'efface dès qu'on écrit
  const [startsBlank] = useState(() => !startImport && mode === "draft" && !published && !initialFields.title && isBlank(initial));
  const autoImport = useRef(startsBlank);
  const [startDepart, setStartDepart] = useState(depart);
  // Les tuiles restent tant qu'un import avance : elles portent sa progression
  const importBusy = useImportBusy(docId);
  const [showImport, setShowImport] = useState(startImport);
  const [notes, setNotes] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef(false);
  const again = useRef(false);
  const title = useRef<HTMLTextAreaElement>(null);
  /** La règle du serveur (finishDocument), appliquée aux champs en cours : le bouton d'envoi attend qu'elle soit remplie */
  const missingOf = (f: Fields) => {
    const picked = subjects.find((s) => s.id === f.subject);
    return missingDetails({ title: f.title, subjectId: f.subject, rights: f.rights, category: f.category, chapter: f.chapter ? Number(f.chapter) : null,
      semester: picked?.semester ?? (f.semester ? Number(f.semester) : null), teacherName: f.teacher }, { teacher: detailsOptional });
  };

  const base = { schema: campussSchema, dictionary: frenchDictionary, uploadFile: makeUploader(`/api/editor/images?doc=${docId}`, setError) };
  // À plusieurs, le contenu vient de Yjs : un contenu initial se dupliquerait à chaque ouverture
  const editor = useCreateBlockNote((channel ? channel.configure(base) : { ...base, initialContent: initial.length ? initial : undefined }) as never) as unknown as CampussEditor;

  const [toc, setToc] = useState<TocItem[]>(() => outlineOf(editor));
  const [untouched, setUntouched] = useState(() => isUntouched(editor));

  const save = useCallback(async () => {
    if (proposal) return;
    clearTimeout(timer.current);
    // Avant la synchronisation, l'éditeur est vide : l'enregistrer effacerait le texte des autres
    if (channel && (!channel.ready || channel.locked || (channel.isEmpty() && initial.length))) return;
    if (inFlight.current) { again.current = true; return; }
    inFlight.current = true;
    setState("saving");
    // Une modification arrivée pendant l'envoi repart aussitôt : rien ne reste en attente
    do {
      again.current = false;
      try {
        const result = await saveDocument(docId, latest.current, editor.document);
        if (result.error) { setError(result.error); setState("dirty"); }
        else { setError(null); if (!again.current) setState("saved"); }
      } catch {
        setState("dirty");
        setError("L’enregistrement a échoué. Ton texte est encore là : on réessaie à ta prochaine modification.");
      }
    } while (again.current);
    inFlight.current = false;
  }, [docId, proposal, editor, channel, initial.length]);

  const touch = useCallback(() => {
    if (proposal) return;
    setState("dirty");
    clearTimeout(timer.current);
    // À plusieurs, chacun n'enregistre que ce qu'il a écrit, et moins souvent : le texte commun est déjà à l'abri dans Yjs
    timer.current = setTimeout(() => void save(), channel ? 4000 + Math.random() * 2000 : 1500);
  }, [proposal, save, channel]);

  const readBody = useCallback(() => {
    setToc((old) => { const next = outlineOf(editor); return JSON.stringify(old) === JSON.stringify(next) ? old : next; });
    const blank = isUntouched(editor);
    setUntouched(blank);
    if (!blank && autoImport.current) autoImport.current = false;
  }, [editor]);
  const onChange = useCallback((fromHere = true) => { readBody(); if (fromHere || !channel) touch(); }, [readBody, touch, channel]);

  const ready = channel?.ready;
  const seedable = channel?.seeds && channel.isEmpty() && initial.length > 0;
  useEffect(() => {
    // L'état Yjs a été perdu alors que le texte existe : seul l'initiateur le repose, pour ne pas le dupliquer
    if (ready && seedable && channel?.markSeeded()) editor.replaceBlocks(editor.document, initial as never);
  }, [ready, seedable, channel, editor, initial]);

  useEffect(() => {
    if (!channel) return;
    const stopFields = channel.onFields((patch) => { setFields((old) => ({ ...old, ...patch })); latest.current = { ...latest.current, ...patch }; });
    const stopAnnounce = channel.onAnnounce((what) => {
      if (what === "sent") return setSent(true);
      clearTimeout(timer.current);
      setState("saved");
      router.push(`/d/${docId}`);
    });
    return () => { stopFields(); stopAnnounce(); };
  }, [channel, docId, router]);


  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") { event.preventDefault(); void save(); }
    };
    const onLeave = (event: BeforeUnloadEvent) => { if (state !== "saved") event.preventDefault(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave); };
  }, [save, state]);

  useEffect(() => {
    const el = title.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [fields.title]);

  const fill = (patch: Partial<Fields>) => {
    setFields((old) => ({ ...old, ...patch }));
    latest.current = { ...latest.current, ...patch };
    channel?.shareFields(patch);
    // Un détail signalé manquant cesse de l'être dès qu'il est rempli
    const still = missingOf(latest.current);
    setMissing((all) => all.filter((m) => still.includes(m)));
    touch();
  };

  const change = (patch: Partial<Fields>) => {
    const keys = Object.keys(patch) as (keyof Fields)[];
    for (const key of keys) edited.current.add(key);
    setSuggested((old) => (keys.some((key) => old.has(key)) ? new Set([...old].filter((key) => !keys.includes(key))) : old));
    fill(patch);
  };

  /** Ne remplace jamais ce que l'étudiant a saisi. L'origine n'en fait pas partie : c'est à lui de la déclarer. */
  function applySuggestion(found: Suggestion) {
    const now = latest.current;
    const patch: Partial<Fields> = {};
    if (found.title && !edited.current.has("title") && (!now.title || now.title === fallbackTitle.current)) patch.title = found.title.slice(0, 200);
    if (found.subject && !edited.current.has("subject") && !now.subject && subjects.some((s) => s.id === found.subject)) patch.subject = found.subject;
    if (!edited.current.has("category")) patch.category = found.category;
    if (found.chapter && !edited.current.has("chapter") && !now.chapter) patch.chapter = String(found.chapter);
    fill(patch);
    setSuggested(new Set(Object.keys(patch) as (keyof Fields)[]));
  }

  /** Sans clé, sans quota ou en cas d'échec, rien ne se passe : le nom du fichier reste, et personne n'est dérangé. */
  async function propose(filename: string) {
    if (!aiReady || sent) return;
    setProposing(true);
    try {
      // La route lit le texte en base : il doit y être arrivé
      while (inFlight.current) await new Promise((resolve) => setTimeout(resolve, 100));
      await save();
      const response = await fetch(`/api/editor/suggest?doc=${docId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: filename.slice(0, 300) }) });
      const data = await response.json().catch(() => null) as { suggestion?: Suggestion | null } | null;
      if (response.ok && data?.suggestion) applySuggestion(data.suggestion);
    } catch { /* repli silencieux */ }
    setProposing(false);
  }

  function addBlocks(blocks: unknown[]) {
    if (!blocks.length) return;
    if (isUntouched(editor)) editor.replaceBlocks(editor.document, blocks as never);
    else editor.insertBlocks(blocks as never, editor.document[editor.document.length - 1], "after");
    onChange();
  }

  const importTarget: ImportTarget = {
    addBlocks,
    imported: ({ title, filename, notes: extra }) => {
      const blank = !latest.current.title;
      // Un document sans titre prend celui de l'import : une chose de moins à saisir
      if (title && blank) { fallbackTitle.current = title.slice(0, 200); fill({ title: fallbackTitle.current }); }
      if (extra?.length) setNotes(extra);
      setShowImport(false);
      autoImport.current = false;
      if (blank || filename === "") void propose(filename ?? "");
    },
  };

  /** Un fichier partagé vers Campuss passe par les tuiles, comme une photo choisie depuis « Commencer avec… ». */
  function receive(list: File[]) {
    keepPendingFiles(list);
    setStartDepart("photo");
    if (!startsBlank || !isUntouched(editor)) setShowImport(true);
  }
  const receiveShared = useRef(receive);
  useEffect(() => { receiveShared.current = receive; });
  useEffect(() => {
    if (!startShare || shareTaken.current) return;
    shareTaken.current = true;
    // Retire le paramètre : recharger la page ne doit pas chercher un nouveau partage
    window.history.replaceState(null, "", window.location.pathname);
    void takeSharedFiles().then((list) => { if (list.length) receiveShared.current(list); }).catch(() => undefined);
  }, [startShare]);

  /** La fenêtre d'envoi s'ouvre avec les champs qui manquent à cet instant ; ils y restent jusqu'à l'envoi. */
  function openFinish() {
    setAsked(missingOf(latest.current));
    setDialog("finish");
  }

  async function finish() {
    setFinishing(true);
    setError(null);
    if (proposal) {
      const result = await proposeRevision(docId, editor.document, summary, attested).catch(() => ({ error: "L’envoi a échoué." }));
      setFinishing(false);
      if (result.error) return setError(result.error);
      setSent(true);
      setAccepted((old) => [...old, fields.category]);
      return setDialog(null);
    }
    clearTimeout(timer.current);
    const result: FinishResult = await finishDocument(docId, latest.current, editor.document, { attested, notDuplicate }).catch(() => ({ error: "L’envoi a échoué. Ton texte est encore là." }));
    setFinishing(false);
    // Le texte a changé entre-temps : la case revient, le serveur a le dernier mot
    if (result.attest) return setAccepted((old) => old.filter((c) => c !== latest.current.category));
    if (result.missing) { setAsked((old) => askedDetails(old, result.missing!)); return setMissing(result.missing); }
    if (result.duplicate) return setDuplicate(result.duplicate);
    if (result.error) return setError(result.error);
    setState("saved");
    setAccepted((old) => [...old, latest.current.category]);
    setDialog(null);
    channel?.announce(result.published ? "published" : "sent");
    if (result.published) router.push(`/d/${docId}`);
    else setSent(true);
  }

  const leave = async () => {
    if (state !== "saved") await save();
    router.push(published || canPublish ? `/d/${docId}` : "/contribuer");
  };

  const direct = canDirect;
  const publishes = canPublish || direct;
  const exam = fields.category === "partiel" && fields.rights !== "unknown" && !RIGHTS_FOR_EXAMS.includes(fields.rights as RightsBasis);
  const primaryLabel = proposal ? "Envoyer la correction" : channel ? "Terminer et publier" : publishes ? "Publier" : "Envoyer pour validation";
  const canFinish = !proposal && !sent && !published;
  const subject = subjects.find((s) => s.id === fields.subject);
  const candidates = friends.filter((f) => !coauthors.some((c) => c.id === f.id));
  const chapterless = detailsOptional || CHAPTERLESS.includes(fields.category);

  const needed = missingOf(fields);
  // Affichés selon ce qui manquait à l'ouverture, pas à chaque frappe
  const needsTitle = asked.includes("title");
  const needsSubject = asked.includes("subject");
  const needsRights = asked.includes("rights");
  const needsChapter = asked.includes("chapter");
  const needsTeacher = asked.includes("teacher");
  // Le semestre se demande aussi quand la matière choisie dans la fenêtre n'en fixe pas un
  const needsSemester = asked.includes("semester") || (needsSubject && Boolean(subject) && !subject?.semester);
  const attestKind = !proposal && canPublish ? "publish" as const : "share" as const;
  const remembered = accepted.includes(fields.category);
  const attestOk = attested || remembered;
  const readyToSend = proposal ? attestOk : attestOk && !needed.length && !exam && (!duplicate || notDuplicate);
  const openOcr = canOcr ? () => setShowImport(true) : undefined;
  const blankStart = !proposal && ((untouched && startsBlank) || importBusy);
  // « Importer » se referme au départ d'un import : en cas d'échec (fichier refusé, archive trop lourde…), on le rouvre pour montrer pourquoi
  const importFailed = useImportJob(docId)?.phase === "error";
  const tilesOnPage = !proposal && untouched && startsBlank;
  // Ajusté pendant le rendu, à la bascule seulement (pas d'effet qui relance un rendu)
  const [wasFailed, setWasFailed] = useState(importFailed);
  if (importFailed !== wasFailed) { setWasFailed(importFailed); if (importFailed && !tilesOnPage) setShowImport(true); }
  // Les tuiles qui s'effacent remontent le texte : le menu « / » ouvert à la première frappe doit suivre la ligne
  useEffect(() => {
    // Le menu s'ouvre un instant après le changement : on attend qu'il soit posé pour le recaler
    const timer = setTimeout(() => {
      // Le positionnement écoute le défilement de chaque ancêtre de l'éditeur
      for (let node = editor.domElement?.parentElement; node; node = node.parentElement) node.dispatchEvent(new Event("scroll"));
      dispatchEvent(new Event("resize"));
    }, 120);
    return () => clearTimeout(timer);
  }, [blankStart, editor]);

  const actions = (
    <>
      {proposal
        ? !sent && <Button onClick={() => openFinish()}>{primaryLabel}</Button>
        : <>
          <Button variant={canFinish ? "ghost" : "default"} onClick={() => void leave()}>{channel ? "Quitter" : "Terminer"}</Button>
          {canFinish && <Button variant={suggested.size ? "outline" : "default"} onClick={() => openFinish()}>{primaryLabel}</Button>}
          {(canOcr || !published) && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Autres actions" />}><Icon icon={IconMore} /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {canOcr && <DropdownMenuItem onClick={() => setShowImport(true)}><Icon icon={IconAiScan} size={16} />Photographier mes notes</DropdownMenuItem>}
                {!published && <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}><Icon icon={IconDelete} size={16} />Supprimer ce brouillon</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>}
    </>
  );

  const importer = !proposal && (
    <Popover open={showImport} onOpenChange={setShowImport}>
      <PopoverTrigger className="flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors hover-ok:bg-muted data-popup-open:bg-muted coarse:min-h-11"><Icon icon={IconCloudUpload} size={16} />Importer</PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] gap-3 p-3">
        <StartTiles documentId={docId} depart={startDepart} subjectId={fields.subject ?? undefined} onStarted={() => setShowImport(false)} target={importTarget} category={fields.category} />
      </PopoverContent>
    </Popover>
  );

  const status = proposal
    ? <span className="ml-auto truncate px-1 text-sm text-muted-foreground">Correction de <em className="font-semibold text-foreground not-italic">{fields.title || "Sans titre"}</em></span>
    : <SaveStatus state={state} />;

  const detailCount = [fields.chapter, fields.teacher, fields.rights !== "unknown" && fields.rights, coauthors.length > 0].filter(Boolean).length;
  const detailsMissing = missing.some((m) => m === "rights" || m === "chapter" || m === "teacher");
  // Choisir la matière donne aussi le semestre d'un document de matière annuelle : un seul endroit pour l'année et le semestre
  const pickSubject = (subject: number | null, semester: number) => {
    const picked = subjects.find((s) => s.id === subject);
    change({ subject, semester: picked && picked.semester == null ? String(semester) : "" });
  };

  return (
    <>
      <EditorDocContext.Provider value={proposal ? null : docId}>
      <PageEditor editor={editor} toc={toc} importer={importer} status={status} actions={actions} onOcr={openOcr}>
        <header className="group/header">
          {!proposal && <CoverPicker src={coverFileId ? `/files/${coverFileId}?inline=1` : null} uploadUrl={`/api/editor/images?doc=${docId}&cover=1`} onRemove={() => setCover(docId, null)} />}
          {proposal ? (
            <p className="text-sm font-semibold text-brand-text">{CATEGORIES[fields.category]}<span className="font-normal text-muted-foreground">{subject ? ` · ${subject.name}` : ""}{fields.chapter ? ` · Chapitre ${fields.chapter}` : ""}</span></p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Trois choix distincts et étiquetés : Année, Semestre, Matière */}
              <SubjectPicker subjects={subjects} name="subject" variant="chips" value={fields.subject ?? null} onChange={pickSubject} lockedLevel={lockedLevel}
                semester={fields.semester ? Number(fields.semester) : null} missing={{ subject: missing.includes("subject"), semester: missing.includes("semester") }}
                selectClassName={suggested.has("subject") ? "text-brand-text" : undefined} />
              <Chip label="Type de document" suggested={suggested.has("category")}>
                <select name="category" value={fields.category} className="font-semibold text-brand-text" onChange={(event) => change({ category: event.target.value as Fields["category"] })}>
                  {Object.entries(CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </Chip>
              <Popover>
                <PopoverTrigger className="doc-field data-popup-open:border-input" data-empty={!detailCount || undefined} data-missing={detailsMissing || undefined}>
                  Détails{detailCount > 0 && <span className="tabular-nums text-muted-foreground">{detailCount}</span>}<Icon icon={IconExpand} size={16} className="size-3 opacity-60" />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 gap-3 p-3">
                  {/* L'année et le semestre sont choisis avec la matière ; ici le reste, demandé à l'envoi (sauf pour un enseignant) */}
                  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
                    <label className="grid gap-1 text-sm"><span className="font-semibold">Chapitre{chapterless && <span className="font-normal text-muted-foreground"> (facultatif)</span>}</span>
                      <Input name="chapter" inputMode="numeric" maxLength={3} value={fields.chapter} placeholder="–" aria-invalid={missing.includes("chapter") || undefined} onChange={(event) => change({ chapter: event.target.value.replace(/\D/g, "") })} />
                    </label>
                    <label className="grid gap-1 text-sm"><span className="font-semibold">Enseignant</span>
                      <Input name="teacher" maxLength={80} value={fields.teacher} placeholder="Nom de l’enseignant" aria-invalid={missing.includes("teacher") || undefined} onChange={(event) => change({ teacher: event.target.value })} />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm"><span className="font-semibold">D’où vient ce contenu ?</span>
                    <NativeSelect name="rights" value={fields.rights} onChange={(event) => change({ rights: event.target.value })} className="w-full" aria-invalid={missing.includes("rights") || undefined}>
                      <NativeSelectOption value="unknown">À préciser</NativeSelectOption>
                      {Object.keys(RIGHTS).map((key) => <NativeSelectOption key={key} value={key}>{RIGHTS_SHORT[key]}</NativeSelectOption>)}
                    </NativeSelect>
                  </label>
                  {candidates.length > 0 && (
                    <form action={addCoauthor} className="grid gap-1 text-sm">
                      <input type="hidden" name="id" value={docId} />
                      <span className="font-semibold">Co-auteurs</span>
                      <NativeSelect name="user" defaultValue="" onChange={(event) => event.currentTarget.form?.requestSubmit()} className="w-full">
                        <NativeSelectOption value="" disabled>Ajouter un ami</NativeSelectOption>
                        {candidates.map((f) => <NativeSelectOption key={f.id} value={f.id}>{f.name}</NativeSelectOption>)}
                      </NativeSelect>
                    </form>
                  )}
                  {year && <p className="text-sm text-muted-foreground">Année {year.replace("-", "–")}</p>}
                </PopoverContent>
              </Popover>
            </div>
          )}
          {proposal
            ? <h1 className="title mt-1 wrap-break-word">{fields.title}</h1>
            : <textarea ref={title} name="title" rows={1} maxLength={200} aria-label="Titre" placeholder="Sans titre" value={fields.title} data-missing={missing.includes("title") || undefined} data-suggested={suggested.has("title") || undefined}
              onChange={(event) => change({ title: event.target.value.replace(/\n/g, " ") })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); editor.focus(); } }}
              className="doc-title title mt-3 w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-muted-foreground/60" />}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span className="inline-flex items-center gap-2"><Avatar user={author} size={24} /><UserName user={author} variant="rich" /></span>
            {coauthors.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-2">
                <Avatar user={c} size={24} /><UserName user={c} variant="rich" />
                {!proposal && <form action={removeCoauthor}><input type="hidden" name="id" value={docId} /><input type="hidden" name="user" value={c.id} /><button type="submit" aria-label={`Retirer ${c.name}`} className="flex size-6 items-center justify-center rounded text-muted-foreground hover-ok:bg-muted hover-ok:text-foreground"><Icon icon={IconClose} size={16} className="size-3.5" /></button></form>}
              </span>
            ))}
            {proposal && RIGHTS_SHORT[fields.rights] && <span className="text-muted-foreground">· {RIGHTS_SHORT[fields.rights]}</span>}
          </div>
        </header>

        <div className="mt-6 grid gap-3 empty:hidden">
          {reviewNote && !proposal && (
            <Alert variant="warning">
              <Icon icon={IconToFix} />
              <AlertTitle>À corriger avant publication</AlertTitle>
              <AlertDescription className="grid gap-3"><p>{reviewNote}</p>{reviewThread}</AlertDescription>
            </Alert>
          )}
          {exam && <Notice tone="error">Un sujet de partiel appartient à son auteur : il faut son accord, ou qu’il soit déjà public.</Notice>}
          {error && !dialog && <Notice tone="error">{error}</Notice>}
          {notes.map((note) => <Notice key={note} tone="info">{note}</Notice>)}
          {answering && !published && <Notice tone="info">Ce cours répond à la demande « {answering} ». Publié, il rapporte un bonus de crédits.</Notice>}
          {proposing && <AiWorking label="Campuss IA lit le début de ton fichier…" lines={1} />}
          {suggested.size > 0 && canFinish && (
            <div role="status" className="flex flex-wrap items-center gap-2">
              {[...suggested].map((key) => <span key={key} className="ai-border inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm"><Icon icon={IconAiIdea} size={16} className="text-[var(--ai-3)]" />{SUGGESTED_LABELS[key] ?? key}</span>)}
              <Button variant="outline" size="sm" onClick={() => { setSuggested(new Set()); openFinish(); }}>Tout est bon</Button>
            </div>
          )}
          {sent && <Notice>{proposal ? "Ta correction est envoyée. Le cours publié change dès qu’elle est acceptée." : <>Ton cours attend sa validation. Tu peux encore le corriger. {reviewWait ?? REVIEW_PROMISE}</>}</Notice>}
        </div>
        {blankStart && (
          <div className="mt-6 grid gap-3 animate-in fade-in-0 duration-150">
            <StartTiles documentId={docId} depart={startDepart} subjectId={fields.subject ?? undefined} onStarted={() => { autoImport.current = false; }} target={importTarget} category={fields.category} />
          </div>
        )}
        {!blankStart && !proposal && untouched && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => addBlocks(markdownToBlocks(courseTemplate(fields.category)))}>Partir d’un modèle</Button>
          </div>
        )}
        {channel?.panel}
        <div className="doc-editor mt-8">
          <EditorSurface editor={editor} editable={!channel?.locked} onChange={onChange} onOcr={openOcr} onForeignMedia={() => setNotes(["Une image venue d’un autre site ne peut pas être gardée : envoie plutôt le fichier."])} />
        </div>
        {!proposal && (
          <section id="pieces-jointes" aria-label="Pièces jointes" className="mt-12 scroll-mt-32">
            <h2 className="heading mb-3">Pièces jointes</h2>
            {files.length > 0 && (
              <ul className="mb-3 grid gap-2 sm:grid-cols-2">
                {files.map((f) => (
                  <li key={f.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-card p-3 shadow-xs">
                    <FileType type={getFileType(f.filename)} size="sm" />
                    <span className="grid min-w-0 flex-1"><span className="truncate font-semibold" title={f.filename}>{f.filename}</span><span className="text-sm text-muted-foreground">{f.size}{f.scanning ? ", analyse en cours" : ""}</span></span>
                    <form action={removeDraftFile}><input type="hidden" name="id" value={docId} /><input type="hidden" name="file" value={f.id} /><Submit size="sm" variant="ghost">Retirer</Submit></form>
                  </li>
                ))}
              </ul>
            )}
            <DraftFiles docId={docId} />
          </section>
        )}
      </PageEditor>
      </EditorDocContext.Provider>

      <Dialog open={dialog === "finish"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{proposal ? "Envoyer la correction" : publishes ? "Publier ce document" : "Envoyer pour validation"}</DialogTitle>
            <DialogDescription>{proposal ? "Le cours reste tel quel jusqu’à ce qu’un relecteur accepte ta correction." : canPublish ? "Il sera visible par toute la licence." : direct ? "Ton cours sera visible tout de suite dans ta matière." : "Un relecteur valide avant la mise en ligne. Tes crédits arrivent à la publication."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {proposal && <Field label="Qu’as-tu corrigé ?" name="summary" value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={300} />}
            {!proposal && needsTitle && <Field label="Titre" name="dialog-title" value={fields.title} onChange={(event) => change({ title: event.target.value })} maxLength={200} />}
            {!proposal && needsSubject && (
              <div className="grid gap-1.5">
                <SubjectPicker subjects={subjects} id="dialog-subject" name="dialog-subject" lockedLevel={lockedLevel}
                  semester={fields.semester ? Number(fields.semester) : null} value={fields.subject ?? null} onChange={pickSubject} />
              </div>
            )}
            {!proposal && !needsSubject && needsSemester && subject && (
              <div className="grid gap-1.5"><Label htmlFor="dialog-semester">Semestre</Label>
                <NativeSelect id="dialog-semester" name="dialog-semester" className="w-full" value={fields.semester} onChange={(event) => change({ semester: event.target.value })}>
                  <NativeSelectOption value="">Choisir…</NativeSelectOption>
                  {[2 * subject.level - 1, 2 * subject.level].map((n) => <NativeSelectOption key={n} value={n}>S{n}</NativeSelectOption>)}
                </NativeSelect>
              </div>
            )}
            {!proposal && (needsChapter || needsTeacher) && (
              <div className={needsChapter && needsTeacher ? "grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3" : "grid gap-3"}>
                {needsChapter && <Field label="Chapitre" name="dialog-chapter" inputMode="numeric" maxLength={3} value={fields.chapter} onChange={(event) => change({ chapter: event.target.value.replace(/\D/g, "") })} />}
                {needsTeacher && <Field label="Enseignant" name="dialog-teacher" maxLength={80} value={fields.teacher} onChange={(event) => change({ teacher: event.target.value })} />}
              </div>
            )}
            {!proposal && needsRights && (
              <div className="grid gap-1.5"><Label htmlFor="dialog-rights">D’où vient ce contenu ?</Label>
                <NativeSelect id="dialog-rights" name="dialog-rights" className="w-full" value={fields.rights} onChange={(event) => change({ rights: event.target.value })}>
                  <NativeSelectOption value="unknown">Choisir…</NativeSelectOption>{Object.entries(RIGHTS).map(([key, label]) => <NativeSelectOption key={key} value={key}>{label}</NativeSelectOption>)}
                </NativeSelect>
                <p className="text-sm text-muted-foreground">Pas de polycopié, de diaporama ni de sujet d’un enseignant sans son accord. <Link className="underline underline-offset-2" href="/cgu#droit-auteur">Ce qui est permis</Link></p>
              </div>
            )}
            {exam && <Notice tone="error">Un sujet de partiel appartient à son auteur : il faut son accord, ou qu’il soit déjà public.</Notice>}
            {duplicate && (
              <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" name="notDuplicate" checked={notDuplicate} onChange={(event) => setNotDuplicate(event.target.checked)} className="mt-1 size-4 accent-[var(--primary)]" /><span>Un document proche existe déjà : « {duplicate} ». Le mien est bien différent.</span></label>
            )}
            {remembered ? <AttestReminder kind={attestKind} /> : <Attest kind={attestKind} name="attest-review" checked={attested} onChange={setAttested} />}
            {error && <Notice tone="error">{error}</Notice>}
          </div>
          <DialogFooter>
            <Button disabled={!readyToSend || finishing} pending={finishing} onClick={() => void finish()}>{proposal ? "Envoyer la correction" : publishes ? "Publier" : "Envoyer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={dialog === "delete"} onOpenChange={(open) => { if (!open) setDialog(null); }} title="Supprimer ce brouillon ?" description="Son texte et ses pièces jointes seront effacés." confirmLabel="Supprimer" level="danger"
        onConfirm={() => { const form = new FormData(); form.set("id", docId); void deleteDraft(form); }} />
    </>
  );
}
