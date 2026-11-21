import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueuedMail } from "@/lib/mail/content";
import { BATCH_WINDOW_MS, batchKeyOf, batchSendAt, digestMail } from "@/lib/mail/digest";
import { renderMail } from "@/lib/mail/render";

// Plusieurs cours validés d'un coup → un seul mail. Jamais pour la sécurité ou le compte.

const notif = (title: string, path: string): QueuedMail => ({
  subject: `Campuss : ${title.toLowerCase()}`, title, category: "notification", unsubscribePath: "/api/desabonnement/abc",
  blocks: [{ type: "p", text: `Détail de ${title}` }, { type: "button", label: "Voir le cours", path }],
});

describe("récapitulatif", () => {
  it("un seul mail part tel quel", () => {
    const one = notif("Ton cours est publié", "/d/1");
    expect(digestMail([one], "Campuss")).toBe(one);
  });
  it("plusieurs mails : un récapitulatif au même gabarit, une section par mail", () => {
    const mail = digestMail([notif("Ton cours est publié", "/d/1"), notif("Ton cours est publié", "/d/2"), notif("Nouvelle réponse", "/d/3")], "Campuss");
    expect(mail.subject).toBe("Campuss : Ton cours est publié et 2 autres nouvelles");
    expect(mail.title).toBe("3 nouvelles pour toi");
    expect(mail.category).toBe("notification");
    expect(mail.unsubscribePath).toBe("/api/desabonnement/abc");
    expect(mail.blocks.filter((b) => b.type === "heading")).toHaveLength(3);
    expect(mail.blocks.some((b) => b.type === "button")).toBe(false);
    const { html, text } = renderMail(mail, { baseUrl: "https://campuss.fr", siteName: "Campuss" });
    expect(html.match(/<h2 /g)).toHaveLength(3);
    expect(html).toContain("https://campuss.fr/d/3");
    expect(html.match(/Se désabonner en un clic/g)).toHaveLength(1);
    expect(text).toContain("Nouvelle réponse\n----------------");
  });
  it("l'équipe reçoit « éléments à traiter »", () => {
    const admin = (title: string): QueuedMail => ({ subject: title, title, category: "admin", blocks: [] });
    expect(digestMail([admin("Un cours attend ta validation"), admin("Modification à relire")], "Campuss").subject).toBe("Campuss : Un cours attend ta validation et 1 autre élément");
  });
  it("regroupe par catégorie et lien de désinscription", () => {
    expect(batchKeyOf({ category: "admin" })).not.toBe(batchKeyOf({ category: "notification", unsubscribePath: "/x" }));
    expect(batchKeyOf({ category: "transactional" })).not.toBe(batchKeyOf({ category: "notification" }));
  });
  it("attend 10 minutes après le premier mail en attente, et rejoint son groupe", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(batchSendAt(null, now).getTime() - now.getTime()).toBe(BATCH_WINDOW_MS);
    const pending = new Date("2026-11-20T10:07:00Z");
    expect(batchSendAt(pending, now)).toBe(pending);
    // Une fenêtre déjà passée (mail en cours d'envoi) n'est pas rejointe
    expect(batchSendAt(new Date("2026-11-20T09:59:00Z"), now).getTime()).toBe(now.getTime() + BATCH_WINDOW_MS);
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("jamais pour la sécurité ou le compte", () => {
  it("aucun mail de compte, d'accès ou de connexion n'est marqué regroupable", () => {
    for (const path of sources("src")) {
      const text = readFileSync(path, "utf8");
      for (const line of text.split("\n").filter((l) => /queueMail\(/.test(l) && /(authMails|accountMails|accessMails)\./.test(l))) {
        expect(line, path).not.toMatch(/batch/);
      }
    }
    for (const path of ["src/app/actions/auth.ts", "src/app/actions/account.ts", "src/app/actions/admin/access.ts", "src/app/actions/admin/create.ts", "src/app/actions/admin/people.ts", "src/lib/auth.ts", "src/lib/invitations.ts"]) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(/batch: true/);
    }
  });
  it("les alertes de l'équipe partent tout de suite", () => {
    expect(readFileSync("src/lib/admin-alert.ts", "utf8")).toMatch(/notifyAdmins\(adminMails\.alert\([^\n]*\{ batch: false \}\)/);
    expect(readFileSync("src/lib/file-jobs.ts", "utf8")).toMatch(/notifyAdmins\(adminMails\.infectedFile\([^\n]*\{ batch: false \}\)/);
  });
});

/* L'envoi : la file regroupe au moment de partir */

const outbox = vi.hoisted(() => ({ selects: [] as unknown[][], deleted: [] as unknown[], inserted: [] as Record<string, unknown>[], sent: [] as { to: string; subject: string; html: string }[] }));

vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: async (m: { to: string; subject: string; html: string }) => { outbox.sent.push(m); }, close: () => undefined }) } }));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const rows = () => Promise.resolve(outbox.selects.shift() ?? []);
  const chain = { where: () => chain, orderBy: () => chain, limit: () => rows() };
  const db = {
    select: () => ({ from: () => chain }),
    delete: () => ({ where: (cond: unknown) => { outbox.deleted.push(cond); return Promise.resolve(); } }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    insert: () => ({ values: (v: Record<string, unknown>) => { outbox.inserted.push(v); return Promise.resolve(); } }),
  };
  return { db, schema };
});

describe("file d'envoi", () => {
  beforeEach(() => {
    process.env.SMTP_HOST = "smtp.test"; process.env.SMTP_FROM = "campuss@test"; process.env.SMTP_PASSWORD = "x"; process.env.BASE_URL = "https://campuss.fr";
    outbox.selects = []; outbox.deleted = []; outbox.inserted = []; outbox.sent = [];
  });
  const row = (id: number, recipient: string, content: QueuedMail, batchKey: string | null) => ({ id, recipient, subject: content.subject, body: null, content, attempts: 0, lastError: null, createdAt: new Date(), nextAttemptAt: new Date(), batchKey });

  it("trois validations et un mail de sécurité : deux envois, la sécurité seule", async () => {
    const { flushOutbox } = await import("@/lib/mail");
    const key = batchKeyOf(notif("x", "/"));
    const a = row(1, "lou@etu.exemple.fr", notif("Ton cours est publié", "/d/1"), key);
    const b = row(2, "lou@etu.exemple.fr", notif("Ton cours est publié", "/d/2"), key);
    const security: QueuedMail = { subject: "Campuss : nouvelle connexion", title: "Nouvelle connexion", category: "transactional", blocks: [] };
    const s = row(3, "lou@etu.exemple.fr", security, null);
    const c = row(4, "lou@etu.exemple.fr", notif("Nouvelle réponse", "/d/3"), key);
    outbox.selects = [[a, b, s, c], [a, b, c]];
    await flushOutbox();
    expect(outbox.sent.map((m) => m.subject)).toEqual(["Campuss : Ton cours est publié et 2 autres nouvelles", "Campuss : nouvelle connexion"]);
  });

  it("un mail regroupable attend la fenêtre ; un mail de compte part tout de suite", async () => {
    const { queueMail } = await import("@/lib/mail");
    const before = Date.now();
    outbox.selects = [[]];
    await queueMail("lou@etu.exemple.fr", { subject: "ton cours est publié", title: "Ton cours est publié", blocks: [] }, { batch: true });
    await queueMail("lou@etu.exemple.fr", { subject: "confirme ton adresse", title: "Confirme ton adresse", blocks: [] });
    const [grouped, alone] = outbox.inserted;
    expect((grouped.nextAttemptAt as Date).getTime()).toBeGreaterThanOrEqual(before + BATCH_WINDOW_MS);
    expect(grouped.batchKey).toBe("transactional|");
    expect(alone.batchKey).toBeUndefined();
    expect(alone.nextAttemptAt).toBeUndefined();
  });
});
