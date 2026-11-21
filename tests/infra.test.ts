import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { annotationsNearLimit, MAX_ANNOTATIONS_PER_SPACE } from "@/lib/annotate";
import { canOpenConnection, imposePresence, type PresenceOwner } from "@/lib/collab-presence";
import { diskPercent, isMemoryDisk } from "@/lib/disk";
import { DOWNLOADS_PER_HOUR, READS_PER_HOUR, countsAsDownload, countsAsRead } from "@/lib/download-rules";
import { attachmentKeys, baseKey, driveBase, driveMarkdown, referencedFiles, safeSegment, uniqueBase } from "@/lib/drive-path";
import { readImportResponse } from "@/lib/import-client";
import { createSerialQueue, QueueFullError, QueueTimeoutError } from "@/lib/serial-queue";
import { formatQuota, overQuota, quotaBytes, quotaMessage } from "@/lib/storage-quota";

const MB = 1024 * 1024;

describe("quota", () => {
  it("lit la variable, 500 Mo sinon", () => {
    expect(quotaBytes(undefined)).toBe(500 * MB);
    expect(quotaBytes("")).toBe(500 * MB);
    expect(quotaBytes("abc")).toBe(500 * MB);
    expect(quotaBytes("-3")).toBe(500 * MB);
    expect(quotaBytes("1000")).toBe(1000 * MB);
  });
  it("accepte jusqu'à la limite exacte, refuse tout ajout sur un espace plein", () => {
    expect(overQuota(90, 10, 100)).toBe(false);
    expect(overQuota(90, 11, 100)).toBe(true);
    expect(overQuota(100, 0, 100)).toBe(true);
  });
  it("dit ce qui reste, sans arrondir vers le haut", () => {
    expect(formatQuota(12.9 * MB)).toBe("12 Mo");
    expect(formatQuota(1536 * MB)).toBe("1,5 Go");
    expect(formatQuota(10)).toBe("moins de 1 Mo");
    expect(quotaMessage(480 * MB, 500 * MB, true)).toContain("il te reste 20 Mo sur 500 Mo");
    expect(quotaMessage(500 * MB, 500 * MB, false)).toContain("les 500 Mo sont utilisés");
  });
});

describe("disque", () => {
  it("calcule comme df, réserve de root comprise", () => {
    expect(diskPercent({ blocks: 100, bfree: 20, bavail: 15 })).toBe(84);
    expect(diskPercent({ blocks: 0, bfree: 0, bavail: 0 })).toBe(0);
  });
  it("reconnaît un disque en mémoire", () => {
    expect(isMemoryDisk(0x01021994)).toBe(true);
    expect(isMemoryDisk(0xef53)).toBe(false);
  });
});

describe("chemins du Drive", () => {
  it("neutralise traversée et caractères interdits", () => {
    expect(safeSegment("../../etc/passwd", "x")).toBe("etc passwd");
    expect(safeSegment("..", "x")).toBe("x");
    expect(safeSegment("   ...  ", "x")).toBe("x");
    expect(safeSegment('a<b>c:d"e|f?g*h\\i/j', "x")).toBe("a b c d e f g h i j");
    expect(safeSegment("nul\u0000\u202eexe", "x")).toBe("nul exe");
    expect(safeSegment("fin. ", "x")).toBe("fin");
    expect(safeSegment("Cours ../1", "x")).toBe("Cours 1");
    expect(safeSegment("a..b.pdf", "x")).not.toContain("..");
  });
  it("écarte les noms réservés de Windows", () => {
    expect(safeSegment("CON", "x")).toBe("_CON");
    expect(safeSegment("com1.txt", "x")).toBe("_com1.txt");
  });
  it("coupe sur les octets sans casser un caractère, et garde l'extension", () => {
    const long = safeSegment(`${"é".repeat(200)}.pdf`, "x");
    expect(Buffer.byteLength(long)).toBeLessThanOrEqual(120);
    expect(long.endsWith("é.pdf")).toBe(true);
    expect(long).not.toContain("\ufffd");
  });
  it("range par licence, année et matière, sans jamais sortir du préfixe", () => {
    expect(driveBase({ program: "Droit", level: 2, subject: "Contrats", title: "Cours 1" })).toBe("drive/Droit/L2/Contrats/Cours 1");
    expect(driveBase({ program: "Droit", level: null, subject: null, title: "" })).toBe("drive/Droit/Sans année/Sans matière/Sans titre");
    const hostile = driveBase({ program: "../..", level: 1, subject: "../../..", title: "../secrets" });
    expect(hostile.startsWith("drive/")).toBe(true);
    expect(hostile.split("/")).not.toContain("..");
    expect(hostile.split("/")).toHaveLength(5);
  });
  it("un titre en .md ne peut pas se confondre avec le fichier d'un autre cours", () => {
    expect(driveBase({ program: "D", level: 1, subject: "M", title: "Plan.md" })).toBe("drive/D/L1/M/Plan");
  });
  it("sépare deux cours du même nom, casse ignorée", () => {
    const taken = new Set([baseKey("drive/D/L1/M/Cours")]);
    expect(uniqueBase("drive/D/L1/M/COURS", "abcdef12-3456", taken)).toBe("drive/D/L1/M/COURS (abcdef12)");
    expect(uniqueBase("drive/D/L1/M/Autre", "abcdef12-3456", taken)).toBe("drive/D/L1/M/Autre");
  });
  it("nomme les fichiers joints, sans doublon et avec une extension", () => {
    const keys = attachmentKeys("drive/b", [
      { id: "1", filename: "image", inlineType: "image/png" },
      { id: "2", filename: "image", inlineType: "image/png" },
      { id: "3", filename: "IMAGE.PNG", inlineType: "image/png" },
      { id: "4", filename: "../../x.pdf", inlineType: "application/pdf" },
      { id: "5", filename: "...", inlineType: null },
    ]);
    expect([...keys.values()]).toEqual(["drive/b/image.png", "drive/b/image (2).png", "drive/b/IMAGE (3).PNG", "drive/b/x.pdf", "drive/b/fichier"]);
  });
  it("réécrit les images vers le dossier voisin, sans donnée de personne", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    const body = `![photo](/files/${id}?inline=1) et ![autre](/files/99999999-2222-4333-8444-555555555555?inline=1)`;
    expect(referencedFiles(body).has(id)).toBe(true);
    const out = driveMarkdown(
      { program: "Droit", level: 1, subject: "Contrats", title: "Mon cours", description: "Intro", academicYear: "2025-2026", body, siteUrl: null },
      "drive/Droit/L1/Contrats/Mon cours", new Map([[id, "drive/Droit/L1/Contrats/Mon cours/photo (2).png"]]),
    );
    expect(out).toContain("![photo](Mon%20cours/photo%20%282%29.png)");
    expect(out).toContain("/files/99999999");
    expect(out.startsWith("# Mon cours\n\n> Droit · L1 · Contrats · 2025-2026\n\nIntro\n\n")).toBe(true);
  });
});

describe("file d'imports", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const deferred = () => { let resolve!: (value: string) => void, reject!: (error: Error) => void; const promise = new Promise<string>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

  it("n'exécute qu'une tâche à la fois, dans l'ordre", async () => {
    const queue = createSerialQueue({ maxPending: 5, maxWaitMs: 1000 });
    const started: string[] = [];
    const first = deferred(), second = deferred();
    const a = queue.run(() => { started.push("a"); return first.promise; });
    const b = queue.run(() => { started.push("b"); return second.promise; });
    expect(started).toEqual(["a"]);
    expect(queue.busy).toBe(true);
    expect(queue.pending).toBe(1);
    first.resolve("A");
    await expect(a).resolves.toBe("A");
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(["a", "b"]);
    second.resolve("B");
    await expect(b).resolves.toBe("B");
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.busy).toBe(false);
  });
  it("une tâche en échec libère la place", async () => {
    const queue = createSerialQueue({ maxPending: 5, maxWaitMs: 1000 });
    const running = queue.run(() => Promise.reject(new Error("raté")));
    const next = queue.run(() => Promise.resolve("ok"));
    await expect(running).rejects.toThrow("raté");
    await expect(next).resolves.toBe("ok");
  });
  it("refuse au-delà de la longueur maximale", async () => {
    const queue = createSerialQueue({ maxPending: 1, maxWaitMs: 1000 });
    const gate = deferred();
    const a = queue.run(() => gate.promise);
    const b = queue.run(() => Promise.resolve("b"));
    expect(queue.full).toBe(true);
    await expect(queue.run(() => Promise.resolve("c"))).rejects.toBeInstanceOf(QueueFullError);
    gate.resolve("a");
    await Promise.all([a, b]);
  });
  it("abandonne après le délai d'attente, sans lancer la tâche", async () => {
    const queue = createSerialQueue({ maxPending: 2, maxWaitMs: 1000 });
    const gate = deferred();
    const a = queue.run(() => gate.promise);
    const task = vi.fn(() => Promise.resolve("b"));
    const b = queue.run(task);
    const seen = expect(b).rejects.toBeInstanceOf(QueueTimeoutError);
    await vi.advanceTimersByTimeAsync(1001);
    await seen;
    expect(queue.pending).toBe(0);
    gate.resolve("a");
    await a;
    await vi.advanceTimersByTimeAsync(0);
    expect(task).not.toHaveBeenCalled();
    expect(queue.busy).toBe(false);
  });
  it("sort de la file quand le navigateur abandonne", async () => {
    const queue = createSerialQueue({ maxPending: 2, maxWaitMs: 1000 });
    const gate = deferred();
    const a = queue.run(() => gate.promise);
    const abort = new AbortController();
    const task = vi.fn(() => Promise.resolve("b"));
    const b = queue.run(task, abort.signal);
    abort.abort();
    await expect(b).rejects.toThrow();
    expect(queue.pending).toBe(0);
    gate.resolve("a");
    await a;
    expect(task).not.toHaveBeenCalled();
  });
});

describe("réponse d'import côté navigateur", () => {
  const streamed = (...lines: string[]) => new Response(lines.join(""), { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });

  it("lit une réponse ordinaire", async () => {
    const out = await readImportResponse<{ error: string }>(Response.json({ error: "non" }, { status: 503 }), () => undefined);
    expect(out).toEqual({ status: 503, data: { error: "non" } });
  });
  it("annonce l'attente puis rend le résultat", async () => {
    const phases: string[] = [];
    const out = await readImportResponse<{ blocks: number[] }>(streamed('{"phase":"waiting"}\n{"phase":"running"}\n', '{"status":200,"body":{"blocks":[1]}}\n'), ({ phase }) => phases.push(phase));
    expect(phases).toEqual(["waiting", "running"]);
    expect(out).toEqual({ status: 200, data: { blocks: [1] } });
  });
  it("transmet l'erreur finale, et traite une coupure comme une erreur", async () => {
    expect((await readImportResponse(streamed('{"phase":"waiting"}\n{"status":503,"body":{"error":"plus tard"}}\n'), () => undefined)).status).toBe(503);
    expect((await readImportResponse(streamed('{"phase":"waiting"}\n'), () => undefined)).status).toBe(502);
  });
});

describe("téléchargements", () => {
  const doc = { coverFileId: "cover", createdBy: "author" };
  const reader = { id: "reader", role: "member" };
  it("compte un fichier joint", () => { expect(countsAsDownload({ id: "f", embedded: false }, doc, reader, false)).toBe(true); });
  it("ne compte ni image du cours, ni couverture, ni morceau de vidéo", () => {
    expect(countsAsDownload({ id: "f", embedded: true }, doc, reader, false)).toBe(false);
    expect(countsAsDownload({ id: "cover", embedded: false }, doc, reader, false)).toBe(false);
    expect(countsAsDownload({ id: "f", embedded: false }, doc, reader, true)).toBe(false);
  });
  it("ne limite ni l'auteur, ni un administrateur", () => {
    expect(countsAsDownload({ id: "f", embedded: false }, doc, { id: "author", role: "member" }, false)).toBe(false);
    expect(countsAsDownload({ id: "f", embedded: false }, doc, { id: "x", role: "admin" }, false)).toBe(false);
  });
});

describe("présence en temps réel", () => {
  const owner = (): PresenceOwner => ({ userId: "u1", name: "Vraie Personne" });
  it("impose l'identité de la session, quoi que dise le navigateur", () => {
    const states = new Map<number, Record<string, unknown>>([[7, { campuss: { id: "admin", name: "Administrateur", color: "red", cursor: { start: 1, end: 4 } }, autre: "x" }]]);
    imposePresence(states, new Set(), owner());
    expect(states.get(7)).toEqual({ campuss: { id: "u1", name: "Vraie Personne", cursor: { start: 1, end: 4 } } });
  });
  it("écarte un curseur mal formé", () => {
    const states = new Map<number, Record<string, unknown>>([[7, { campuss: { cursor: { start: "a", end: 1e12 } } }]]);
    imposePresence(states, new Set(), owner());
    expect((states.get(7)!.campuss as { cursor: unknown }).cursor).toBeNull();
  });
  it("une connexion ne parle que pour son premier client", () => {
    const who = owner();
    imposePresence(new Map([[7, {}]]), new Set(), who);
    const states = new Map<number, Record<string, unknown>>([[8, { campuss: { cursor: null } }], [7, { campuss: { cursor: null } }]]);
    const removed = new Set([9, 7]);
    imposePresence(states, removed, who);
    expect([...states.keys()]).toEqual([7]);
    expect([...removed]).toEqual([7]);
  });
  it("limite les connexions d'un compte", () => {
    expect(canOpenConnection(4)).toBe(true);
    expect(canOpenConnection(5)).toBe(false);
  });
});

describe("annotations", () => {
  it("prévient à 90 % de la limite", () => {
    expect(annotationsNearLimit(MAX_ANNOTATIONS_PER_SPACE * 0.9 - 1)).toBe(false);
    expect(annotationsNearLimit(MAX_ANNOTATIONS_PER_SPACE * 0.9)).toBe(true);
  });
});

describe("lectures (anti-aspiration)", () => {
  it("compte la lecture d'un cours d'autrui, pas le sien ni celle d'un administrateur", () => {
    expect(countsAsRead({ createdBy: "auteur" }, { id: "lecteur", role: "member" })).toBe(true);
    expect(countsAsRead({ createdBy: "auteur" }, { id: "auteur", role: "member" })).toBe(false);
    expect(countsAsRead({ createdBy: "auteur" }, { id: "x", role: "admin" })).toBe(false);
  });
  it("laisse une révision normale passer, bien au-dessus des téléchargements", () => {
    expect(READS_PER_HOUR).toBeGreaterThanOrEqual(DOWNLOADS_PER_HOUR);
  });
});
