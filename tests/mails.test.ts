import { describe, expect, it } from "vitest";
import { accessMails, accountMails, adminMails, authMails, contentMails, notificationMailContent, reportMails } from "@/lib/mail/catalog";
import { legacyMail, type MailCategory, type MailContent } from "@/lib/mail/content";
import { mailHeaders } from "@/lib/mail/headers";
import { escapeHtml, renderMail, siteUrl } from "@/lib/mail/render";
import { weeklyDigest } from "@/lib/reminders/weekly-digest";

const BASE = "https://campuss.fr";
const ctx = { baseUrl: BASE, siteName: "Campuss" };
const EVIL = `<script>alert("x")</script><img src=x onerror=alert(1)> & "guillemets" 'apostrophe'`;
const TOKEN = "abcDEF123_-";

/** Chaque mail du catalogue, avec un contenu hostile partout où un texte vient de quelqu'un. */
const ALL: [string, MailContent][] = [
  ["verifyEmail", authMails.verifyEmail(TOKEN)],
  ["alreadyRegistered", authMails.alreadyRegistered()],
  ["resetPassword", authMails.resetPassword(TOKEN)],
  ["recoveryCodeUsed", authMails.recoveryCodeUsed()],
  ["mfaResetRequested", authMails.mfaResetRequested()],
  ["newDevice", authMails.newDevice(EVIL, EVIL)],
  ["inactiveDeletion", authMails.inactiveDeletion()],
  ["confirmNewEmail", accountMails.confirmNewEmail(TOKEN, 24)],
  ["confirmNewEmailByTeam", accountMails.confirmNewEmail(TOKEN, 72, true)],
  ["emailChangeRequested", accountMails.emailChangeRequested()],
  ["emailChangeByTeam", accountMails.emailChangeByTeam(EVIL)],
  ["accessAccepted", accountMails.accessAccepted(EVIL)],
  ["accessRefused", accountMails.accessRefused(EVIL)],
  ["accountReady", accountMails.accountReady(EVIL, TOKEN)],
  ["teacherSpace", accountMails.teacherSpace(TOKEN)],
  ["invitation", accountMails.invitation({ name: EVIL, programName: EVIL, message: EVIL, token: TOKEN, days: 14 })],
  ["warning", accessMails.warning(EVIL, "Mot de passe réinitialisé", EVIL)],
  ["suspended", accessMails.suspended(EVIL, "12 décembre", EVIL)],
  ["closed", accessMails.closed(EVIL)],
  ["deletion", accessMails.deletion(EVIL, true)],
  ["loginLink", accessMails.loginLink(EVIL, TOKEN)],
  ["coauthorAdded", contentMails.coauthorAdded(EVIL, EVIL, "11111111-1111-4111-8111-111111111111")],
  ["proposalRejected", contentMails.proposalRejected(EVIL, EVIL)],
  ["removedByTeacher", contentMails.removedByTeacher(EVIL)],
  ["fileRejected", contentMails.fileRejected(EVIL)],
  ["received", reportMails.received(true, TOKEN)],
  ["handled", reportMails.handled(false, true, EVIL, TOKEN)],
  ["testMail", adminMails.testMail()],
  ["newAccessRequest", adminMails.newAccessRequest({ name: EVIL, email: "a@b.fr", program: EVIL, level: 2, message: EVIL })],
  ["alert", adminMails.alert("Disque presque plein", EVIL, "/admin/systeme")],
  ["newReport", adminMails.newReport()],
  ["autoHidden", adminMails.autoHidden(EVIL)],
  ["messageReported", adminMails.messageReported("11111111-1111-4111-8111-111111111111")],
  ["editToReview", adminMails.editToReview(EVIL)],
  ["courseToValidate", adminMails.courseToValidate(EVIL, "11111111-1111-4111-8111-111111111111")],
  ["teacherDecision", adminMails.teacherDecision(EVIL, true, EVIL, "11111111-1111-4111-8111-111111111111")],
  ["infectedFile", adminMails.infectedFile(EVIL, EVIL, EVIL)],
  ["notification", notificationMailContent({ subject: "un message sur ton cours", text: `À propos de « ${EVIL} » :`, quote: EVIL, action: "Répondre" }, "11111111-1111-4111-8111-111111111111")],
];

const render = (mail: MailContent, category: MailCategory = "transactional", unsubscribePath?: string) =>
  renderMail({ ...mail, subject: `Campuss : ${mail.subject}`, category, ...(unsubscribePath ? { unsubscribePath } : {}) }, ctx);

const urlsOf = (html: string) => [...html.matchAll(/(?:href|src)="([^"]*)"|url\(([^)]*)\)/g)].map((m) => (m[1] ?? m[2]).replaceAll("&amp;", "&"));

describe("gabarit des mails", () => {
  it.each(ALL)("%s : tout texte est échappé", (_, mail) => {
    const { html } = render(mail);
    expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/<img src=x/);
    if (JSON.stringify(mail).includes("<script>")) expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it.each(ALL)("%s : liens et images absolus vers BASE_URL seulement", (_, mail) => {
    const urls = urlsOf(render(mail).html);
    expect(urls.length).toBeGreaterThan(2);
    for (const url of urls) expect(url.startsWith(`${BASE}/`) || url === BASE, url).toBe(true);
  });

  it.each(ALL)("%s : partie texte propre, avec chaque lien en clair", (_, mail) => {
    const { text, html } = render(mail);
    // Le texte brut garde le contenu tel quel (rien à échapper), mais n'ajoute aucune balise
    expect(text.replaceAll(EVIL, "")).not.toMatch(/<[a-z]/i);
    expect(text).toContain(mail.title.replace("{site}", "Campuss"));
    for (const block of mail.blocks) if (block.type === "button") expect(text).toContain(`${BASE}${block.path}\n`);
    expect(text).toContain("initiative étudiante indépendante");
    expect(html).toContain("initiative étudiante indépendante");
  });

  it("un vrai titre, un bouton à l'épreuve d'Outlook et le lien en clair dessous", () => {
    const { html } = render(authMails.verifyEmail(TOKEN));
    expect(html).toContain("<h1");
    expect(html).toContain("v:roundrect");
    expect(html).toContain(`href="${BASE}/verify/${TOKEN}"`);
    expect(html.split(`${BASE}/verify/${TOKEN}`).length).toBeGreaterThanOrEqual(4); // VML, bouton, lien en clair (href et texte)
    expect(html).toContain('lang="fr"');
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain("prefers-color-scheme:dark");
    expect(html).toContain(`${BASE}/mail/logo-light@2x.png`);
    expect(html).toContain('alt="Campuss"');
  });

  it("aucun traçage : pas de pixel ni de lien de redirection", () => {
    const { html } = render(adminMails.newReport());
    expect(html).not.toMatch(/\/track|utm_|redirect|width="1" height="1"/i);
    expect([...html.matchAll(/<img /g)]).toHaveLength(2); // le logo, clair et sombre
  });

  it("le nom du site remplace {site}, sans permettre d'injection", () => {
    const { html, text } = renderMail({ ...accountMails.teacherSpace(TOKEN), category: "transactional" }, { baseUrl: BASE, siteName: `Camp"<b>` });
    expect(text).toContain(`Camp"<b> est un site d’entraide`);
    expect(html).toContain("Camp&quot;&lt;b&gt; est un site");
    expect(html).not.toContain("{site}");
  });

  it("bloc de code pour un code de vérification", () => {
    const { html, text } = renderMail({ subject: "Code", title: "Ton code", category: "transactional", blocks: [{ type: "code", code: "482 913", label: "Ton code de vérification" }] }, ctx);
    expect(html).toContain("482 913");
    expect(html).toContain("monospace");
    expect(text).toContain("Ton code de vérification\n    482 913");
  });

  it("vouvoie l'ayant droit, tutoie l'étudiant", () => {
    expect(render(reportMails.received(true, TOKEN)).text).toContain("Vous recevez ce message");
    expect(render(reportMails.received(false, TOKEN)).text).toContain("Tu reçois ce mail");
  });

  it("renvoie vers la page de contact quand une réponse a du sens, l'adresse d'envoi n'étant pas lue", () => {
    const { text } = render(accessMails.closed("Lou"));
    expect(text).toContain(`${BASE}/contact`);
    expect(text).toContain("n’est pas lue");
    expect(text).not.toMatch(/réponds à ce mail/i);
  });
});

describe("pied de page et désinscription", () => {
  it("un mail non transactionnel propose la désinscription et les réglages", () => {
    const { html, text } = render(weeklyDigest({ name: "Lou", dueCards: 3, nextExam: null, newCourses: [], impact: { readers: 0, courses: 0 } }, { open: "/notifications/ouvrir/1" }, new Date())!.content, "weekly", "/api/desabonnement/u.s");
    expect(text).toContain(`Se désabonner en un clic : ${BASE}/api/desabonnement/u.s`);
    expect(text).toContain(`${BASE}/parametres/notifications`);
    expect(html).toContain(`href="${BASE}/api/desabonnement/u.s"`);
    expect(text).toContain("Bonjour Lou,");
    expect(text).toContain(`3 fiches à réviser. Réviser : ${BASE}/reviser`);
  });

  it("un mail transactionnel n'en propose pas", () => {
    expect(render(authMails.resetPassword(TOKEN)).text).not.toContain("désabonner");
  });

  it("une ancienne ligne de la file (texte brut) part dans le gabarit", () => {
    const { text, html } = renderMail(legacyMail("Campuss : test d’envoi", "Bonjour <b>Lou</b>,\n\nL’envoi fonctionne.\n"), ctx);
    expect(text).toContain("Test d’envoi");
    expect(html).toContain("Bonjour &lt;b&gt;Lou&lt;/b&gt;,");
  });
});

describe("liens des mails", () => {
  it("n'accepte que des chemins du site", () => {
    expect(siteUrl(BASE, "/reset/abc")).toBe(`${BASE}/reset/abc`);
    expect(siteUrl(`${BASE}/`, "/d/1#questions")).toBe(`${BASE}/d/1#questions`);
    for (const bad of ["//evil.example/x", "https://evil.example", "javascript:alert(1)", "reset/abc", "/a b", "/\\evil.example", ""]) {
      expect(() => siteUrl(BASE, bad), bad).toThrow();
    }
  });

  it("un bouton hors du site fait échouer le rendu plutôt que partir", () => {
    expect(() => renderMail({ subject: "x", title: "x", category: "transactional", blocks: [{ type: "button", label: "x", path: "https://evil.example" }] }, ctx)).toThrow();
  });

  it("échappe les cinq caractères spéciaux", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});

describe("en-têtes d'envoi", () => {
  const base = { from: "noreply@campuss.fr", id: "1234", siteHost: "campuss.fr" };
  it("Message-ID sur le domaine d'envoi, langue fr, mail automatique", () => {
    const { messageId, headers } = mailHeaders({ ...base, category: "transactional" });
    expect(messageId).toBe("<1234@campuss.fr>");
    expect(headers["Content-Language"]).toBe("fr");
    expect(headers["Auto-Submitted"]).toBe("auto-generated");
    expect(headers["List-Unsubscribe"]).toBeUndefined();
  });
  it("désinscription en un clic (RFC 8058) pour les mails non transactionnels", () => {
    const { headers } = mailHeaders({ ...base, category: "weekly", unsubscribeUrl: "https://campuss.fr/api/desabonnement/t" });
    expect(headers["List-Unsubscribe"]).toBe("<https://campuss.fr/api/desabonnement/t>");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(mailHeaders({ ...base, category: "admin", unsubscribeUrl: "https://campuss.fr/x" }).headers["List-Unsubscribe"]).toBeUndefined();
  });
});
