import { beforeEach, describe, expect, it, vi } from "vitest";
import { canEditCourse } from "@/lib/access";
import { canWithdrawDirectly, cleanWithdrawalReason, cleanWithdrawalResponse } from "@/lib/withdrawal-rules";

// Un étudiant ne retire plus seul un cours publié ; il en demande le retrait à l'administration.

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "member", email: "lou@etu.exemple.fr", programId: 1 } as Record<string, unknown>,
  rows: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  inserted: [{ id: "w1" }] as unknown[],
  notified: [] as { userId: string; input: Record<string, unknown> }[],
  trashed: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => state.user, audit: vi.fn() }));
vi.mock("@/lib/admin-ops", () => ({ adminFor: async () => state.user, isStepUp: () => false }));
vi.mock("@/lib/audit", () => ({ auditAction: vi.fn() }));
vi.mock("@/lib/trash", () => ({ trashDocument: async (id: string) => { state.trashed.push(id); return { id, title: "" }; }, restoreDocument: vi.fn(), purgeNow: async (id: string) => { state.trashed.push(id); return true; } }));
vi.mock("@/lib/document-reviews", () => ({ addReviewEvent: vi.fn(async () => ({ id: "e" })), authorsOf: async () => ["u1"], lastReviewerOf: vi.fn(), reviewEventsOf: vi.fn() }));
vi.mock("@/lib/file-jobs", () => ({ rebuildDocumentSearch: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(async (userId: string, input: Record<string, unknown>) => { state.notified.push({ userId, input }); }) }));
vi.mock("@/lib/review-undo", () => ({ holdDecision: vi.fn(), undoDecision: vi.fn() }));
vi.mock("@/lib/security", () => ({ rateHit: vi.fn(), rateLimited: async () => false }));
vi.mock("@/lib/shell-cache", () => ({ forgetAllShellCounters: vi.fn() }));
vi.mock("@/lib/site-stats", () => ({ documentStats: vi.fn(), forgetAuthorStats: vi.fn() }));
vi.mock("@/lib/gamification", () => ({ syncBadges: vi.fn() }));
vi.mock("@/lib/mail", () => ({ notifyAdmins: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const result = () => Promise.resolve(state.rows.shift() ?? []);
  // Paresseux : `where(...)` attendu directement ou suivi de `.returning()` ne consomme qu'une ligne
  const where = () => ({ then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => result().then(ok, ko), returning: () => result() });
  const db = {
    select: () => ({ from: () => ({ where }) }),
    update: () => ({ set: (values: Record<string, unknown>) => { state.updates.push(values); return { where }; } }),
    insert: () => ({ values: (values: Record<string, unknown>) => { state.inserts.push(values); return { onConflictDoNothing: () => ({ returning: async () => state.inserted }) }; } }),
  };
  return { db, schema };
});

const published = { id: "11111111-1111-4111-8111-111111111111", title: "Les physiocrates", createdBy: "u1", published: true, deletedAt: null, programId: 1, kind: "editor", reviewRequested: false };
const as = (role: string) => { state.user = { id: "u1", role, email: "lou@etu.exemple.fr", programId: 1 }; };

beforeEach(() => {
  as("member");
  state.rows = [];
  state.updates = [];
  state.inserts = [];
  state.inserted = [{ id: "w1" }];
  state.notified = [];
  state.trashed = [];
});

describe("règles de retrait", () => {
  it("l'étudiant garde la main sur ses brouillons, plus sur ses cours publiés", () => {
    expect(canWithdrawDirectly({ role: "member" }, { published: false })).toBe(true);
    expect(canWithdrawDirectly({ role: "member" }, { published: true })).toBe(false);
    expect(canWithdrawDirectly({ role: "contributor" }, { published: true })).toBe(false);
    for (const role of ["admin", "delegate", "teacher"]) expect(canWithdrawDirectly({ role }, { published: true })).toBe(true);
  });
  it("une justification réelle est obligatoire, le motif seulement pour un refus", () => {
    expect(cleanWithdrawalReason("non")).toBeNull();
    expect(cleanWithdrawalReason(42)).toBeNull();
    expect(cleanWithdrawalReason("  Le cours contient   des erreurs graves  ")).toBe("Le cours contient des erreurs graves");
    expect(cleanWithdrawalResponse("", "refuse")).toBe(false);
    expect(cleanWithdrawalResponse("", "accept")).toBeNull();
    expect(cleanWithdrawalResponse("Le cours sert encore", "refuse")).toBe("Le cours sert encore");
  });
  it("un cours publié ne se modifie pas directement : il passe par une proposition relue", () => {
    expect(canEditCourse({ id: "u1", role: "member", programId: 1 }, published)).toBe(false);
    expect(canEditCourse({ id: "u1", role: "member", programId: 1 }, { ...published, published: false })).toBe(true);
  });
});

describe("actions de l'auteur, côté serveur", () => {
  it("refuse corbeille, retrait et suppression d'un cours publié à son auteur étudiant", async () => {
    const { trashMine, unpublishMine, purgeMine } = await import("@/app/actions/documents");
    state.rows = [[published], [published], [{ ...published, deletedAt: new Date() }]];
    for (const action of [trashMine, unpublishMine, purgeMine]) expect(await action(published.id)).toEqual({ error: expect.stringContaining("demande son retrait") });
    expect(state.trashed).toEqual([]);
    expect(state.updates).toEqual([]);
  });
  it("garde les droits de l'administration, des délégués et des enseignants", async () => {
    const { trashMine, unpublishMine } = await import("@/app/actions/documents");
    for (const role of ["admin", "delegate", "teacher"]) {
      as(role);
      state.rows = [[published], [published]];
      expect(await trashMine(published.id)).toEqual({ ok: true });
      expect(await unpublishMine(published.id)).toEqual({ ok: true });
    }
    expect(state.trashed).toHaveLength(3);
    expect(state.updates.every((u) => u.published === false)).toBe(true);
  });
  it("laisse l'étudiant jeter son brouillon", async () => {
    const { trashMine } = await import("@/app/actions/documents");
    state.rows = [[{ ...published, published: false }]];
    expect(await trashMine(published.id)).toEqual({ ok: true });
  });
});

describe("demande de retrait", () => {
  it("part avec la justification, une seule fois", async () => {
    const { requestWithdrawal } = await import("@/app/actions/withdrawals");
    state.rows = [[published]];
    expect(await requestWithdrawal(published.id, "Le cours contient des erreurs graves")).toEqual({ ok: true });
    expect(state.inserts[0]).toMatchObject({ documentId: published.id, requesterId: "u1", reason: "Le cours contient des erreurs graves" });
    state.rows = [[published]];
    state.inserted = [];
    expect(await requestWithdrawal(published.id, "Le cours contient des erreurs graves")).toEqual({ error: expect.stringContaining("attend déjà") });
  });
  it("refuse sans justification, hors de ses cours ou pour un brouillon", async () => {
    const { requestWithdrawal } = await import("@/app/actions/withdrawals");
    state.rows = [[published]];
    expect(await requestWithdrawal(published.id, "court")).toEqual({ error: expect.stringContaining("au moins") });
    state.rows = [[{ ...published, createdBy: "autre" }]];
    expect(await requestWithdrawal(published.id, "Le cours contient des erreurs graves")).toEqual({ error: "Cours introuvable." });
    state.rows = [[{ ...published, published: false }]];
    expect(await requestWithdrawal(published.id, "Le cours contient des erreurs graves")).toEqual({ error: expect.stringContaining("pas publié") });
    expect(state.inserts).toEqual([]);
  });
  it("l'administration refuse avec un motif obligatoire, et l'auteur est prévenu", async () => {
    const { decideWithdrawal } = await import("@/app/actions/withdrawals");
    as("admin");
    expect(await decideWithdrawal("22222222-2222-4222-8222-222222222222", "refuse", "")).toEqual({ error: "Indique le motif du refus." });
    state.rows = [[{ id: "w1", documentId: published.id, requesterId: "u1" }], [published]];
    expect(await decideWithdrawal("22222222-2222-4222-8222-222222222222", "refuse", "Le cours sert encore à ta promo")).toEqual({ ok: "Demande refusée" });
    expect(state.updates.some((u) => "published" in u)).toBe(false);
    expect(state.notified[0]).toMatchObject({ userId: "u1", input: { kind: "withdrawal", title: "Ta demande de retrait est refusée" } });
  });
  it("accepter retire le cours de la publication et prévient l'auteur", async () => {
    const { decideWithdrawal } = await import("@/app/actions/withdrawals");
    as("admin");
    state.rows = [[{ id: "w1", documentId: published.id, requesterId: "u1" }], [published]];
    expect(await decideWithdrawal("22222222-2222-4222-8222-222222222222", "accept")).toEqual({ ok: "Cours retiré de la publication" });
    expect(state.updates).toContainEqual(expect.objectContaining({ published: false }));
    expect(state.notified[0]).toMatchObject({ userId: "u1", input: { kind: "withdrawal", title: "Ton cours est retiré de la publication" } });
  });
});
