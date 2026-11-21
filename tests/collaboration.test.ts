import { describe, expect, it, vi } from "vitest";
import { canOpenConnection, imposeNotesPresence, notesRoom, parseRoom } from "@/lib/collab-presence";
import { openToken, sealToken, signState, verifyState } from "@/lib/connected/oauth-seal";
import { ConnectionLost, downloadGoogleFile, FileTooLarge, GOOGLE_SCOPE, PROVIDERS } from "@/lib/connected/providers";
import { fileNameFor, MAX_CONTAINERS, MAX_FILE_BYTES, MAX_NEW_PER_PASS, pickNew, proposalTitle, titleFrom } from "@/lib/connected/rules";
import { bonusDocuments, chapterOf, cleanRequestText, DIGEST_SETTLE_MS, planRequestDigest, sameNumbers } from "@/lib/course-request-rules";
import { cleanTurns, MAX_TURNS } from "@/lib/notes-rules";
import { publishRoute } from "@/lib/publish-rules";

const ID = "11111111-1111-4111-8111-111111111111";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("demandes de cours", () => {
  it("garde une seule ligne de longueur raisonnable", () => {
    expect(cleanRequestText("  Je cherche\n le chapitre 3 ")).toBe("Je cherche le chapitre 3");
    expect(cleanRequestText("a")).toBeNull();
    expect(cleanRequestText("x".repeat(161))).toBeNull();
  });
  it("ne confond pas deux chapitres", () => {
    expect(sameNumbers("chapitre 3 de HPE", "le chapitre 4 de HPE")).toBe(false);
    expect(sameNumbers("chapitre 3 de HPE", "HPE chap 3")).toBe(true);
  });
  it("retrouve le chapitre", () => {
    expect(chapterOf("Je cherche le chapitre 3 de HPE")).toBe("3");
    expect(chapterOf("chap. 12")).toBe("12");
    expect(chapterOf("Le cours sur Keynes")).toBeNull();
  });
  const answer = (over = {}) => ({ documentId: "d1", documentAuthor: "a", documentSubject: 1, requestId: "r", requestAuthor: "b", requestSubject: 1, publishedAt: new Date(100), ...over });
  it("un seul bonus par demande, au premier cours publié", () => {
    expect([...bonusDocuments([answer({ documentId: "d2", publishedAt: new Date(200) }), answer()])]).toEqual(["d1"]);
  });
  it("pas de bonus pour sa propre demande ni depuis une autre matière", () => {
    expect(bonusDocuments([answer({ documentAuthor: "b" })]).size).toBe(0);
    expect(bonusDocuments([answer({ documentSubject: 2 })]).size).toBe(0);
  });
  const now = new Date("2026-11-02T12:00:00Z");
  const asked = (id: string, subjectId = 1, authorId: string | null = "z", ageMs = DIGEST_SETTLE_MS + 1000) => ({ id, subjectId, subjectName: `M${subjectId}`, authorId, createdAt: new Date(now.getTime() - ageMs) });
  it("regroupe les demandes pour un même auteur", () => {
    const plans = planRequestDigest([asked("1"), asked("2"), asked("3", 2)], new Map([[1, ["a"]], [2, ["a"]]]), new Map(), now);
    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe("3 cours demandés dans tes matières");
    expect(plans[0].href).toBe("/demandes");
  });
  it("une seule notification par jour, et jamais à l'auteur de la demande", () => {
    expect(planRequestDigest([asked("1")], new Map([[1, ["a"]]]), new Map([["a", new Date(now.getTime() - 3_600_000)]]), now)).toEqual([]);
    expect(planRequestDigest([asked("1", 1, "a")], new Map([[1, ["a"]]]), new Map(), now)).toEqual([]);
  });
  it("laisse aux demandes le temps de se regrouper, et ne répète pas les anciennes", () => {
    expect(planRequestDigest([asked("1", 1, "z", 1000)], new Map([[1, ["a"]]]), new Map(), now)).toEqual([]);
    expect(planRequestDigest([asked("1", 1, "z", 3 * 86_400_000)], new Map([[1, ["a"]]]), new Map([["a", new Date(now.getTime() - 2 * 86_400_000)]]), now)).toEqual([]);
  });
});

describe("publication : toujours relue avant", () => {
  it("un étudiant, même avec beaucoup de cours validés, passe par la file", () => {
    for (const role of ["member", "contributor"]) {
      expect(publishRoute({ role }, { canModerate: false, teacherOwnCourse: false })).toBe("review");
      // Même si un drapeau était mal calculé, le rôle seul ne suffit jamais à un étudiant
      expect(publishRoute({ role }, { canModerate: true, teacherOwnCourse: true })).toBe("review");
    }
  });
  it("seuls l'administration, le délégué qui modère et l'enseignant dans sa matière publient", () => {
    expect(publishRoute({ role: "admin" }, { canModerate: true, teacherOwnCourse: false })).toBe("moderate");
    expect(publishRoute({ role: "delegate" }, { canModerate: true, teacherOwnCourse: false })).toBe("moderate");
    expect(publishRoute({ role: "delegate" }, { canModerate: false, teacherOwnCourse: false })).toBe("review");
    expect(publishRoute({ role: "teacher" }, { canModerate: false, teacherOwnCourse: true })).toBe("teacher");
    expect(publishRoute({ role: "teacher" }, { canModerate: false, teacherOwnCourse: false })).toBe("review");
  });
});

describe("salles de notes", () => {
  it("distingue les salles par le préfixe", () => {
    expect(parseRoom(ID)).toEqual({ kind: "revision", id: ID });
    expect(parseRoom(notesRoom(ID))).toEqual({ kind: "notes", id: ID });
    for (const bad of ["notes:", "notes:x", `autre:${ID}`, `${ID};drop`, null, 3]) expect(parseRoom(bad)).toBeNull();
  });
  it("impose l'identité : le navigateur ne fournit que son curseur", () => {
    const states = new Map<number, Record<string, unknown>>([[7, { user: { name: "Un autre", color: "red" }, campuss: { id: "faux" }, cursor: { anchor: { a: 1 }, head: { a: 2 } }, poids: "x" }]]);
    imposeNotesPresence(states, new Set(), { userId: ID, name: "Léa" });
    const state = states.get(7)!;
    expect(state.user).toMatchObject({ name: "Léa" });
    expect(state.campuss).toEqual({ id: ID, name: "Léa" });
    expect(state.cursor).toEqual({ anchor: { a: 1 }, head: { a: 2 } });
    expect(state.poids).toBeUndefined();
  });
  it("une connexion ne parle que pour un client, et un curseur énorme est jeté", () => {
    const owner = { userId: ID, name: "Léa" };
    const removed = new Set([9]);
    const states = new Map<number, Record<string, unknown>>([[7, { cursor: { anchor: { a: "x".repeat(5000) }, head: {} } }], [8, { user: { name: "Autre" } }]]);
    imposeNotesPresence(states, removed, owner);
    expect([...states.keys()]).toEqual([7]);
    expect(removed.size).toBe(0);
    expect(states.get(7)!.cursor).toBeNull();
  });
  it("garde la limite de connexions", () => {
    expect(canOpenConnection(4)).toBe(true);
    expect(canOpenConnection(5)).toBe(false);
  });
  it("filtre le tour de rôle", () => {
    expect(cleanTurns([{ part: " Intro ", userId: "a" }, { part: "", userId: "a" }, { part: "Partie 2", userId: "inconnu" }], new Set(["a"]))).toEqual([{ part: "Intro", userId: "a" }, { part: "Partie 2", userId: null }]);
    expect(cleanTurns("x", new Set())).toEqual([]);
    expect(cleanTurns(Array(99).fill({ part: "p" }), new Set())).toHaveLength(MAX_TURNS);
  });
});

describe("dossier connecté : secrets", () => {
  it("chiffre les jetons et détecte une altération", () => {
    const sealed = sealToken("secret-google");
    expect(sealed).not.toContain("secret-google");
    expect(openToken(sealed)).toBe("secret-google");
    const parts = sealed.split(":");
    parts[3] = Buffer.from("autre").toString("base64url");
    expect(() => openToken(parts.join(":"))).toThrow();
  });
  it("signe l'état : altération, expiration", () => {
    const state = signState({ user: ID, provider: "google" }, 1000);
    expect(verifyState(state, 2000)).toMatchObject({ user: ID, provider: "google" });
    expect(verifyState(state, 1000 + 11 * 60_000)).toBeNull();
    const [body, signature] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), user: "attaquant" })).toString("base64url");
    expect(verifyState(`${forged}.${signature}`, 2000)).toBeNull();
    expect(verifyState("n'importe quoi", 2000)).toBeNull();
  });
});

describe("dossier connecté : services simulés", () => {
  const config = { clientId: "id", clientSecret: "sec", redirectUri: "https://campuss.fr/api/connected/google/callback" };
  it("demande à Google la portée annoncée et un renouvellement", () => {
    const url = new URL(PROVIDERS.google.authorizeUrl(config, "etat"));
    expect(url.searchParams.get("scope")).toBe(GOOGLE_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("etat");
  });
  it("Google : échange le code, garde le jeton de renouvellement au renouvellement", async () => {
    const http = vi.fn(async () => json({ access_token: "a2", expires_in: 3600 }));
    const tokens = await PROVIDERS.google.refresh(config, "r1", http as never);
    expect(tokens).toMatchObject({ accessToken: "a2", refreshToken: "r1" });
    await expect(PROVIDERS.google.refresh(config, "r1", (async () => json({ error: "invalid_grant" }, 400)) as never)).rejects.toBeInstanceOf(ConnectionLost);
  });
  it("Google : ne liste que le dossier relié, descend dans les sous-dossiers, ignore l'inconvertible", async () => {
    const queries: string[] = [];
    const http = (async (input: string) => {
      const q = new URL(input).searchParams.get("q")!;
      queries.push(q);
      if (q.startsWith("'racine'")) return json({ files: [{ id: "sous", name: "TD", mimeType: "application/vnd.google-apps.folder", modifiedTime: "2026-01-01T00:00:00Z" }, { id: "f1", name: "CM 1", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-01-02T00:00:00Z" }, { id: "v", name: "video.mp4", mimeType: "video/mp4", modifiedTime: "2026-01-02T00:00:00Z" }, { id: "gros", name: "gros.pdf", mimeType: "application/pdf", size: String(MAX_FILE_BYTES + 1), modifiedTime: "2026-01-02T00:00:00Z" }] });
      return json({ files: [{ id: "f2", name: "TD 1.pdf", mimeType: "application/pdf", modifiedTime: "2026-01-03T00:00:00Z" }] });
    }) as never;
    const items = await PROVIDERS.google.listItems("t", { id: "racine", name: "Notes" }, http);
    expect(items.map((i) => i.id)).toEqual(["f1", "f2"]);
    expect(queries).toEqual(["'racine' in parents and trashed=false", "'sous' in parents and trashed=false"]);
  });
  it("Google : refuse d'injecter un identifiant, borne le nombre de dossiers parcourus", async () => {
    const injected = vi.fn();
    await PROVIDERS.google.listItems("t", { id: "x' or trashed=true or '", name: "" }, injected as never);
    expect(injected).not.toHaveBeenCalled();
    let calls = 0;
    const endless = (async () => { calls++; return json({ files: Array.from({ length: 5 }, (_, i) => ({ id: `d${calls}-${i}`, name: "d", mimeType: "application/vnd.google-apps.folder", modifiedTime: "2026-01-01T00:00:00Z" })) }); }) as never;
    await PROVIDERS.google.listItems("t", { id: "r", name: "" }, endless);
    expect(calls).toBeLessThanOrEqual(MAX_CONTAINERS);
  });
  it("Google : un accès retiré se reconnaît", async () => {
    await expect(PROVIDERS.google.listRoots("t", (async () => json({}, 401)) as never)).rejects.toBeInstanceOf(ConnectionLost);
  });
  it("coupe un téléchargement qui dépasse la limite, même sans taille annoncée", async () => {
    const big = new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(4 * 1024 * 1024)); } }));
    await expect(downloadGoogleFile("t", "abc", "application/pdf", (async () => big) as never)).rejects.toBeInstanceOf(FileTooLarge);
    await expect(downloadGoogleFile("t", "../x", "application/pdf", vi.fn() as never)).rejects.toThrow();
  });
  it("exporte un Google Doc en Word", async () => {
    let asked = "";
    const bytes = await downloadGoogleFile("t", "abc", "application/vnd.google-apps.document", (async (url: string) => { asked = url; return new Response("doc"); }) as never);
    expect(asked).toContain("/files/abc/export");
    expect(bytes.toString()).toBe("doc");
    expect(fileNameFor("CM 1", "application/vnd.google-apps.document")).toBe("CM 1.docx");
    expect(fileNameFor("a.PDF", "application/pdf")).toBe("a.PDF");
    expect(titleFrom("CM 1.pdf")).toBe("CM 1");
  });
  it("Notion : les sous-pages, ou la page elle-même si elle n'en a pas", async () => {
    const http = (async (url: string) => (url.includes("/blocks/r/") ? json({ results: [{ id: "p1", type: "child_page", child_page: { title: "Chap 1" }, last_edited_time: "2026-01-01T00:00:00Z" }, { id: "b", type: "paragraph" }] }) : json({ results: [] }))) as never;
    expect((await PROVIDERS.notion.listItems("t", { id: "r", name: "Racine" }, http)).map((i) => i.title)).toEqual(["Chap 1"]);
    expect((await PROVIDERS.notion.listItems("t", { id: "vide", name: "Racine" }, http)).map((i) => i.title)).toEqual(["Racine"]);
  });
  it("Notion : échange le code avec l'authentification du client", async () => {
    let headers: Record<string, string> = {};
    const tokens = await PROVIDERS.notion.exchange(config, "c", (async (_: string, init: { headers: Record<string, string> }) => { headers = init.headers; return json({ access_token: "n" }); }) as never);
    expect(tokens).toEqual({ accessToken: "n", refreshToken: null, expiresAt: null });
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("id:sec").toString("base64")}`);
  });
  it("limite stricte par passage, sans ce qui est déjà connu", () => {
    const found = Array.from({ length: 50 }, (_, i) => ({ id: String(i), title: "t", mime: "", modifiedAt: i }));
    const fresh = pickNew(found, new Set(["49"]));
    expect(fresh).toHaveLength(MAX_NEW_PER_PASS);
    expect(fresh[0].id).toBe("48");
    expect(proposalTitle(3)).toBe("3 nouvelles notes, les partager ?");
    expect(proposalTitle(1)).toBe("1 nouvelle note, la partager ?");
  });
});
