import { describe, expect, it } from "vitest";
import { installGuide, shouldOfferInstall } from "@/lib/install-hint";
import { timeAgo } from "@/lib/notification-view";
import { isPushEndpoint, pushSubscriptionInput, vapidSubject } from "@/lib/push-endpoint";
import { daysBetween, lastSunday, parisDay } from "@/lib/reminders/calendar";
import { cardsDueNotification, shouldRemindCards } from "@/lib/reminders/cards-due";
import { examNotification, examReminderDay, examSeriesDue } from "@/lib/reminders/exam-soon";
import { crossedThreshold, impactNotification, impactSentence } from "@/lib/reminders/impact";
import { newCourseNotifications, type NewDoc } from "@/lib/reminders/new-course";
import { qaReplyNotification } from "@/lib/reminders/qa-reply";
import { weeklyDigest, weeklyDue, type DigestFacts } from "@/lib/reminders/weekly-digest";
import { renderMail } from "@/lib/mail/render";
import { parseUnsubscribeToken, unsubscribeToken } from "@/lib/security";

const at = (iso: string) => new Date(iso);
const DAY = 86_400_000;

describe("jours à Paris", () => {
  it("change de jour à minuit à Paris, pas en UTC", () => {
    expect(parisDay(at("2026-11-02T23:30:00Z"))).toBe("2026-11-03");
    expect(daysBetween(at("2026-11-02T22:00:00Z"), at("2026-11-03T22:30:00Z"))).toBe(1);
  });
  it("trouve le dernier dimanche", () => {
    expect(lastSunday(at("2026-11-02T12:00:00Z"))).toBe("2026-11-01"); // un lundi
    expect(lastSunday(at("2026-11-01T12:00:00Z"))).toBe("2026-11-01");
  });
});

describe("fiches à réviser", () => {
  const now = at("2026-11-10T17:00:00Z");
  it("n'envoie rien sans fiche", () => expect(shouldRemindCards(0, null, now)).toBe(false));
  it("attend 2 jours après un rappel lu, 7 après un rappel ignoré", () => {
    const ago = (n: number) => new Date(now.getTime() - n * DAY);
    expect(shouldRemindCards(5, { createdAt: ago(1), readAt: ago(1) }, now)).toBe(false);
    expect(shouldRemindCards(5, { createdAt: ago(2), readAt: ago(1) }, now)).toBe(true);
    expect(shouldRemindCards(5, { createdAt: ago(3), readAt: null }, now)).toBe(false);
    expect(shouldRemindCards(5, { createdAt: ago(7), readAt: null }, now)).toBe(true);
  });
  it("accorde le pluriel", () => {
    expect(cardsDueNotification(12).title).toBe("12 fiches à réviser");
    expect(cardsDueNotification(1).title).toBe("1 fiche à réviser");
  });
});

describe("partiels", () => {
  const now = at("2026-11-10T16:00:00Z");
  it("rappelle en série qui se resserre : mois, semaine, 3 jours, puis chaque jour", () => {
    expect(examReminderDay(at("2026-11-17T08:00:00Z"), now)).toBe(7);
    expect(examReminderDay(at("2026-11-11T08:00:00Z"), now)).toBe(1);
    expect(examReminderDay(at("2026-11-13T08:00:00Z"), now)).toBe(3);
    expect(examReminderDay(at("2026-11-09T08:00:00Z"), now)).toBeNull();
    const due = Array.from({ length: 90 }, (_, i) => i + 1).filter(examSeriesDue);
    expect(due).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 11, 14, 21, 28, 35, 60, 90]);
  });
  it("rédige le message", () => {
    const exam = { id: "e", title: "Partiel", place: "", subject: "Maths" };
    expect(examNotification(exam, 7).title).toBe("Partiel de Maths dans 7 jours");
    expect(examNotification(exam, 1).title).toBe("Partiel de Maths demain");
    expect(examNotification(exam, 1).dedupeKey).not.toBe(examNotification(exam, 7).dedupeKey);
  });
});

describe("nouveaux cours", () => {
  const doc = (id: string, over: Partial<NewDoc> = {}): NewDoc => ({ id, title: `Cours ${id}`, category: "cours", subjectId: 1, subject: "HPE", level: 1, programId: 1, authors: ["auteur"], ...over });
  const student = { id: "moi", programId: 1, level: 1 };
  it("regroupe par matière", () => {
    const out = newCourseNotifications([doc("a"), doc("b"), doc("c", { subjectId: 2, subject: "Droit" })], student, "2026-11-10");
    expect(out.map((n) => n.title)).toEqual(["2 nouveaux cours en HPE", "Nouveau cours en Droit"]);
    expect(out[0].href).toBe("/matieres/1");
    expect(out[1].href).toBe("/d/c");
  });
  it("nomme le type : une fiche n'est pas un cours", () => {
    const out = newCourseNotifications([doc("a", { category: "fiche" }), doc("b", { category: "fiche" }), doc("c", { subjectId: 2, subject: "Droit", category: "partiel" }), doc("d", { subjectId: 3, subject: "Éco", category: "td" }), doc("e", { subjectId: 3, subject: "Éco" })], student, "x");
    expect(out.map((n) => n.title)).toEqual(["2 nouvelles fiches en HPE", "Nouveau sujet de partiel en Droit", "2 nouveautés en Éco"]);
  });
  it("ignore ses propres cours, les autres licences et années", () => {
    expect(newCourseNotifications([doc("a", { authors: ["moi"] }), doc("b", { programId: 2 }), doc("c", { level: 2 })], student, "x")).toEqual([]);
  });
});

describe("réponse à une question", () => {
  const base = { docId: "d", docTitle: "T", replierId: "r" };
  it("prévient l'auteur de la question", () => expect(qaReplyNotification({ ...base, askerId: "a" })?.href).toBe("/d/d#questions"));
  it("pas soi-même ni un compte disparu", () => {
    expect(qaReplyNotification({ ...base, askerId: "r" })).toBeNull();
    expect(qaReplyNotification({ ...base, askerId: null })).toBeNull();
  });
});

describe("impact", () => {
  it("annonce chaque seuil une fois", () => {
    expect(crossedThreshold(9, 0)).toBeNull();
    expect(crossedThreshold(10, 0)).toBe(10);
    expect(crossedThreshold(24, 10)).toBeNull();
    expect(crossedThreshold(45, 10)).toBe(40);
    expect(crossedThreshold(45, 40)).toBeNull();
    expect(crossedThreshold(100, 40)).toBe(100);
  });
  it("rédige sans nommer personne", () => {
    expect(impactNotification({ id: "d", title: "T" }, 40).title).toBe("Ton cours a aidé 40 personnes");
    expect(impactSentence(1)).toBe("Ton cours a aidé 1 étudiant cette semaine");
    expect(impactSentence(12, 3)).toBe("Tes cours ont aidé 12 étudiants cette semaine");
  });
});

describe("mail hebdomadaire", () => {
  const urls = { open: "/notifications/ouvrir/o" };
  const ctx = { baseUrl: "https://x", siteName: "Campuss" };
  const empty: DigestFacts = { name: "Lou", dueCards: 0, nextExam: null, newCourses: [], impact: { readers: 0, courses: 0 } };
  const now = at("2026-11-08T17:00:00Z");
  it("ne part pas sans rien à dire", () => {
    expect(weeklyDigest(empty, urls, now)).toBeNull();
    expect(weeklyDigest({ ...empty, nextExam: { subject: "Maths", at: new Date(now.getTime() + 60 * DAY) } }, urls, now)).toBeNull();
  });
  it("reprend chaque rubrique et le lien de désinscription", () => {
    const digest = weeklyDigest({ name: "Lou", dueCards: 12, nextExam: { subject: "Maths", at: new Date(now.getTime() + 5 * DAY) }, newCourses: [{ subject: "HPE", counts: { cours: 2, fiche: 1 } }], impact: { readers: 7, courses: 1 } }, urls, now)!;
    const { text } = renderMail({ ...digest.content, category: "weekly", unsubscribePath: "/api/desabonnement/t" }, ctx);
    for (const part of ["12 fiches à réviser", "Partiel de Maths dans 5 jours", "HPE (2 CM, 1 fiche)", "Ton cours a aidé 7 étudiants", "https://x/api/desabonnement/t", "https://x/notifications/ouvrir/o"]) expect(text).toContain(part);
  });
  it("une fois par semaine, en rattrapant le lendemain", () => {
    const sunday = at("2026-11-08T17:00:00Z");
    const monday = at("2026-11-09T17:00:00Z");
    expect(weeklyDue(at("2026-11-01T17:00:00Z"), sunday)).toBe(true);
    expect(weeklyDue(sunday, monday)).toBe(false);
    expect(weeklyDue(at("2026-11-01T17:00:00Z"), monday)).toBe(true);
    expect(weeklyDue(null, sunday)).toBe(true);
    expect(weeklyDue(null, monday)).toBe(false);
  });
  it("le jeton de désinscription ne se falsifie pas", () => {
    const token = unsubscribeToken("11111111-1111-4111-8111-111111111111");
    expect(parseUnsubscribeToken(token)).toEqual({ userId: "11111111-1111-4111-8111-111111111111", scope: "weekly" });
    expect(parseUnsubscribeToken(token.replace("1111.", "1112."))).toBeNull();
    const notifications = unsubscribeToken("11111111-1111-4111-8111-111111111111", "notifications");
    expect(parseUnsubscribeToken(notifications)).toEqual({ userId: "11111111-1111-4111-8111-111111111111", scope: "notifications" });
    // Un jeton ne change pas de portée : la signature du résumé ne vaut pas pour les notifications, et inversement
    expect(parseUnsubscribeToken(`${token}.notifications`)).toBeNull();
    expect(parseUnsubscribeToken(notifications.replace(/\.notifications$/, ""))).toBeNull();
    expect(parseUnsubscribeToken(notifications.replace(/notifications$/, "weekly"))).toBeNull();
    expect(parseUnsubscribeToken("n'importe quoi")).toBeNull();
  });
});

describe("push", () => {
  it("n'écrit qu'aux services de push connus", () => {
    for (const ok of ["https://fcm.googleapis.com/fcm/send/x", "https://web.push.apple.com/abc", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-par02p.notify.windows.com/w/?token=x"]) expect(isPushEndpoint(ok), ok).toBe(true);
    for (const bad of ["http://fcm.googleapis.com/x", "https://169.254.169.254/latest", "https://minio:9000/x", "https://push.apple.com.evil.test/x", "https://fcm.googleapis.com:8443/x", "pas une adresse"]) expect(isPushEndpoint(bad), bad).toBe(false);
  });
  it("refuse un abonnement mal formé", () => {
    expect(pushSubscriptionInput.safeParse({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "abc", auth: "def" } }).success).toBe(true);
    expect(pushSubscriptionInput.safeParse({ endpoint: "https://evil.test/x", keys: { p256dh: "abc", auth: "def" } }).success).toBe(false);
    expect(pushSubscriptionInput.safeParse({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a b", auth: "def" } }).success).toBe(false);
  });
  it("donne un contact accepté par les services", () => {
    expect(vapidSubject("https://campuss.fr")).toBe("https://campuss.fr");
    expect(vapidSubject("http://localhost:3000")).toMatch(/^mailto:/);
  });
});

describe("installation", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
  it("donne le bon mode d'emploi", () => {
    expect(installGuide({ userAgent: iphone, maxTouchPoints: 5, hasPrompt: false })).toBe("ios");
    expect(installGuide({ userAgent: "Macintosh", maxTouchPoints: 5, hasPrompt: false })).toBe("ios");
    expect(installGuide({ userAgent: "Linux; Android 14", maxTouchPoints: 5, hasPrompt: true })).toBe("prompt");
    expect(installGuide({ userAgent: "Linux; Android 14", maxTouchPoints: 5, hasPrompt: false })).toBe("android");
    expect(installGuide({ userAgent: "Windows", maxTouchPoints: 0, hasPrompt: false })).toBeNull();
  });
  it("à partir de la troisième visite, une seule fois, jamais une fois installé", () => {
    expect(shouldOfferInstall({ visits: 2, shown: false, showingNow: false }, false)).toBe(false);
    expect(shouldOfferInstall({ visits: 3, shown: false, showingNow: false }, false)).toBe(true);
    expect(shouldOfferInstall({ visits: 9, shown: true, showingNow: false }, false)).toBe(false);
    expect(shouldOfferInstall({ visits: 9, shown: true, showingNow: true }, false)).toBe(true);
    expect(shouldOfferInstall({ visits: 3, shown: false, showingNow: false }, true)).toBe(false);
  });
});

it("le temps passé reste lisible", () => {
  const now = at("2026-11-10T12:00:00Z");
  expect(timeAgo(new Date(now.getTime() - 5 * 60_000), now)).toBe("il y a 5 min");
  expect(timeAgo(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("il y a 3 h");
  expect(timeAgo(new Date(now.getTime() - DAY), now)).toBe("hier");
});

describe("Partiel ou contrôle continu", () => {
  it("la série de rappels vaut pour un CC, sans l'émoji de la matière", () => {
    const exam = { id: "e", title: "CC", place: "Amphi B", subject: "📊 Statistiques", kind: "cc" };
    const out = examNotification(exam, 3);
    expect(out.title).toBe("CC de Statistiques dans 3 jours");
    expect(out.body).not.toContain(" · CC ·");
    expect(out.body).toContain("Amphi B");
  });
  it("élision et partiel par défaut pour les annonces d'avant", () => {
    expect(examNotification({ id: "e", title: "Partiel", place: "", subject: "🏭 Économie" }, 1).title).toBe("Partiel d’Économie demain");
  });
  it("le résumé hebdomadaire nomme le type", () => {
    const now = at("2026-11-08T17:00:00Z");
    const digest = weeklyDigest({ name: "Lou", dueCards: 0, nextExam: { subject: "Maths", at: new Date(now.getTime() + 2 * DAY), kind: "cc" }, newCourses: [], impact: { readers: 0, courses: 0 } }, { open: "/o" }, now)!;
    expect(digest.summary).toContain("CC de Maths");
  });
});
