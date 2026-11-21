import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Sur une base jetable seulement : DATABASE_URL=postgres://… npx vitest run tests/notifs-db.test.ts
const send = vi.fn();
vi.mock("web-push", () => ({ default: { sendNotification: send } }));

describe.skipIf(!process.env.DATABASE_URL)("notify, sur une vraie base", async () => {
  process.env.VAPID_PUBLIC_KEY = "public";
  process.env.VAPID_PRIVATE_KEY = "private";
  process.env.BASE_URL = "https://campuss.fr";
  const { db, schema } = await import("@/lib/db");
  const { deliveriesSettled, notify } = await import("@/lib/notify");
  const { runDailyReminders } = await import("@/lib/reminders/daily");
  const { recordVisit } = await import("@/lib/notification-state");
  const { notifications, pushSubscriptions, notificationState, users } = schema;

  const person = async () => {
    const [user] = await db.insert(users).values({ email: `${randomUUID()}@test.example`, name: "Lou", passwordHash: "x", status: "active" }).returning();
    return user;
  };
  const subscribe = (userId: string) => db.insert(pushSubscriptions).values({ endpoint: `https://fcm.googleapis.com/${randomUUID()}`, userId, p256dh: "k", auth: "a" });
  const rows = (userId: string) => db.select().from(notifications).where(eq(notifications.userId, userId));

  beforeEach(() => { send.mockReset(); send.mockResolvedValue({}); });

  it("un seul push par jour ; le reste va dans le centre", async () => {
    const user = await person();
    await subscribe(user.id);
    await Promise.all([1, 2, 3, 4].map((i) => notify(user.id, { kind: "qa_reply", title: `Réponse ${i}` })));
    await deliveriesSettled();
    expect(send).toHaveBeenCalledTimes(1);
    const all = await rows(user.id);
    expect(all).toHaveLength(4);
    expect(all.filter((r) => r.pushedAt)).toHaveLength(1);
  });

  it("oublie un appareil disparu et rend le créneau", async () => {
    const user = await person();
    await subscribe(user.id);
    send.mockRejectedValueOnce(Object.assign(new Error("parti"), { statusCode: 410 }));
    await notify(user.id, { kind: "friend", title: "Ami" });
    await deliveriesSettled();
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id))).toHaveLength(0);
    const [state] = await db.select().from(notificationState).where(eq(notificationState.userId, user.id));
    expect(state.lastReminderDay).toBeNull();
    expect((await rows(user.id))[0].pushedAt).toBeNull();
  });

  it("ne prévient pas deux fois du même événement", async () => {
    const user = await person();
    await notify(user.id, { kind: "exam_soon", title: "A", dedupeKey: "exam:1:7" });
    await notify(user.id, { kind: "exam_soon", title: "A", dedupeKey: "exam:1:7" });
    expect(await rows(user.id)).toHaveLength(1);
  });

  it("repère un retour après 21 jours, pas avant", async () => {
    const user = await person();
    await recordVisit(user.id);
    const long = new Date(Date.now() - 30 * 86_400_000);
    await db.update(notificationState).set({ lastVisitAt: long }).where(eq(notificationState.userId, user.id));
    await recordVisit(user.id);
    let [state] = await db.select().from(notificationState).where(eq(notificationState.userId, user.id));
    expect(state.returnedFrom?.getTime()).toBe(long.getTime());
    await db.update(notificationState).set({ returnedFrom: null, returnedAt: null, lastVisitAt: new Date(Date.now() - 86_400_000) }).where(eq(notificationState.userId, user.id));
    await recordVisit(user.id);
    [state] = await db.select().from(notificationState).where(eq(notificationState.userId, user.id));
    expect(state.returnedFrom).toBeNull();
  });

  it("la tâche quotidienne tourne une fois par jour", async () => {
    const user = await person();
    await db.insert(schema.flashcards).values({ userId: user.id, front: "q", back: "r", dueAt: new Date(0) });
    const evening = new Date("2031-03-02T17:00:00Z");
    await runDailyReminders(new Date("2031-03-02T06:00:00Z"));
    expect(await rows(user.id)).toHaveLength(0);
    await runDailyReminders(evening);
    await runDailyReminders(evening);
    const created = await rows(user.id);
    expect(created.filter((r) => r.kind === "cards_due").map((r) => r.title)).toEqual(["1 fiche à réviser"]);
  });
});
