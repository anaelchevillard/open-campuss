import { describe, expect, it } from "vitest";
import { levelOfAction, requirements, STEP_UP_CRITICAL_MS } from "../src/lib/admin-actions";
import { lastAdminRefusal } from "../src/lib/admin-rules";
import { domainBlocked, domainVerdict, editDistance, emailHmac, normalizeEmail } from "../src/lib/domains";
import { appendPath, isHiddenInPreview, viewRefusal, VIEW_MAX_PATHS } from "../src/lib/impersonation-rules";
import { invitationState, parseInviteList, queuePlan } from "../src/lib/invitation-rules";
import { isStepUpFresh } from "../src/lib/step-up";
import { parseSubjectCsv } from "../src/lib/subject-csv";
import { accessRefusal, provisionalPassword, suspensionEnd } from "../src/lib/suspension";

const APPROVED = ["etu.exemple.fr", "etu.exemple.org"];

describe("domaines", () => {
  it("reconnaît un domaine étudiant exact", () => expect(domainVerdict("lea@etu.exemple.fr", APPROVED).kind).toBe("verified"));
  it("signale faux-etu.exemple.fr comme ressemblant", () => {
    const v = domainVerdict("x@faux-etu.exemple.fr", APPROVED);
    expect(v).toEqual({ kind: "lookalike", domain: "faux-etu.exemple.fr", like: "etu.exemple.fr" });
  });
  it("signale une faute de frappe et un suffixe trompeur", () => {
    expect(domainVerdict("x@etu.exemplee.fr", APPROVED).kind).toBe("lookalike");
    expect(domainVerdict("x@etu.exemple.fr.evil.com", APPROVED).kind).toBe("lookalike");
  });
  it("classe le reste en autre", () => expect(domainVerdict("x@example.com", APPROVED).kind).toBe("other"));
  it("distance d'édition bornée", () => {
    expect(editDistance("etu.exemple.fr", "etu.exemplee.fr")).toBe(1);
    expect(editDistance("abc", "xyzxyzxyz", 2)).toBe(3);
  });
  it("domaine refusé et sous-domaines", () => {
    expect(domainBlocked("a@spam.io", ["spam.io"])).toBe(true);
    expect(domainBlocked("a@x.spam.io", ["@spam.io"])).toBe(true);
    expect(domainBlocked("a@notspam.io", ["spam.io"])).toBe(false);
  });
});

describe("empreinte HMAC des adresses bannies", () => {
  it("normalise casse et alias", () => expect(normalizeEmail(" Lea+test@Etu.EXEMPLE.fr ")).toBe("lea@etu.exemple.fr"));
  it("même adresse, même empreinte ; clé différente, empreinte différente", () => {
    const key = "k".repeat(32);
    expect(emailHmac("Lea@etu.exemple.fr", key)).toBe(emailHmac("lea+x@etu.exemple.fr", key));
    expect(emailHmac("lea@etu.exemple.fr", key)).not.toBe(emailHmac("lea@etu.exemple.fr", "z".repeat(32)));
    expect(emailHmac("lea@etu.exemple.fr", key)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("niveaux d'action", () => {
  it("classe les actions", () => {
    expect(levelOfAction("profil.bio")).toBe("routine");
    expect(levelOfAction("compte.suspendu")).toBe("sensitive");
    expect(levelOfAction("compte.banni")).toBe("critical");
    expect(levelOfAction("voir_comme.debut")).toBe("critical");
    expect(levelOfAction("inconnue")).toBeNull();
  });
  it("le critique exige la saisie du nom et un facteur de moins de 2 minutes", () => {
    expect(requirements("critical")).toEqual({ freshFactor: true, reason: true, typeName: true });
    expect(requirements("routine").reason).toBe(false);
    const now = Date.now();
    expect(isStepUpFresh(new Date(now - 90_000), now, STEP_UP_CRITICAL_MS)).toBe(true);
    expect(isStepUpFresh(new Date(now - 150_000), now, STEP_UP_CRITICAL_MS)).toBe(false);
    expect(isStepUpFresh(new Date(now - 150_000), now)).toBe(true);
  });
});

describe("garde du dernier admin et du propriétaire", () => {
  const owner = { id: "o", active: true, secondFactor: true, isOwner: true };
  const other = { id: "a", active: true, secondFactor: true, isOwner: false };
  it("personne ne touche au propriétaire", () => expect(lastAdminRefusal([owner, other], "o", "disable")).toMatch(/propriétaire/));
  it("refuse de retirer le dernier admin sûr", () => expect(lastAdminRefusal([{ ...other }], "a", "demote")).toMatch(/aucun administrateur/));
  it("permet quand il en reste un", () => expect(lastAdminRefusal([owner, other], "a", "demote")).toBeNull());
});

describe("voir comme", () => {
  const base = { adminId: "a", targetId: "t", targetRole: "member", targetIsOwner: false, targetStatus: "active", startedToday: 0, reason: "Vérifier un bug d’affichage" };
  it("accepte un membre actif avec motif", () => expect(viewRefusal(base)).toBeNull());
  it("accepte un aperçu sans motif (facultatif)", () => expect(viewRefusal({ ...base, reason: "" })).toBeNull());
  it("refuse un admin, soi-même, sans motif, au-delà de 5 par jour", () => {
    expect(viewRefusal({ ...base, targetRole: "admin" })).not.toBeNull();
    expect(viewRefusal({ ...base, targetId: "a" })).not.toBeNull();
    expect(viewRefusal({ ...base, startedToday: 5 })).not.toBeNull();
  });
  it("masque les espaces privés", () => {
    for (const p of ["/reviser", "/reviser/fiches", "/amis", "/parametres", "/notifications", "/api/account/export", "/admin", "/api/connected/google/start", "/api/passkey/register"]) expect(isHiddenInPreview(p), p).toBe(true);
    for (const p of ["/", "/matieres", "/d/123", "/actualites"]) expect(isHiddenInPreview(p), p).toBe(false);
  });
  it("garde les chemins sans paramètres, dédoublonnés, plafonnés", () => {
    expect(appendPath(["/a"], "/a?q=secret")).toEqual(["/a"]);
    expect(appendPath(["/a"], "/b?q=1")).toEqual(["/a", "/b"]);
    const full = Array.from({ length: VIEW_MAX_PATHS }, (_, i) => `/p${i}`);
    expect(appendPath(full, "/x")).toBe(full);
  });
});

describe("suspension et mot de passe provisoire", () => {
  const base = { status: "active", suspendedUntil: null, suspensionMessage: null, provisionalExpiresAt: null, mustChangePassword: false, deletionScheduledAt: null };
  it("bloque pendant la suspension avec le message, puis se lève seule", () => {
    const now = new Date("2026-11-07T10:00:00Z");
    const until = new Date("2026-11-08T10:00:00Z");
    expect(accessRefusal({ ...base, suspendedUntil: until, suspensionMessage: "Spam." }, now)).toMatch(/suspendu.*Spam\./);
    expect(accessRefusal({ ...base, suspendedUntil: until }, new Date("2026-11-09T00:00:00Z"))).toBeNull();
  });
  it("banni et provisoire expiré n'entrent pas", () => {
    expect(accessRefusal({ ...base, status: "banned" })).not.toBeNull();
    expect(accessRefusal({ ...base, mustChangePassword: true, provisionalExpiresAt: new Date(Date.now() - 1000) })).toMatch(/expiré/);
  });
  it("durées datées", () => {
    const now = new Date("2026-11-07T10:00:00Z");
    expect(suspensionEnd("24h", null, now)!.getTime() - now.getTime()).toBe(86_400_000);
    expect(suspensionEnd("date", "2026-11-01", now)).toBeNull();
    expect(suspensionEnd("date", "2026-12-01", now)).not.toBeNull();
  });
  it("mot de passe provisoire de 4 mots", () => {
    let i = 0;
    expect(provisionalPassword((max) => (i++ * 7) % max).split("-")).toHaveLength(5);
  });
});

describe("invitations", () => {
  it("aperçu : invalides, déjà inscrites, doublons fusionnés", () => {
    const rows = parseInviteList("adresse;nom\nlea@etu.exemple.fr;Léa\npas-une-adresse\nLEA@etu.exemple.fr\nmax@etu.exemple.fr;Max;Droit;L2", new Set(["max@etu.exemple.fr"]));
    expect(rows.map((r) => r.status)).toEqual(["ok", "invalid", "duplicate", "registered"]);
    expect(rows[3].level).toBe(2);
  });
  it("file plafonnée", () => {
    expect(queuePlan(200, 100, 300)).toEqual({ today: 200, later: 0, days: 0 });
    expect(queuePlan(440, 0, 300)).toEqual({ today: 300, later: 140, days: 1 });
  });
  it("état", () => {
    const base = { email: "a@b.fr", sentAt: null, openedAt: null, acceptedAt: null, expiresAt: new Date(Date.now() + 1e6), revokedAt: null, uses: 0, maxUses: 1 };
    expect(invitationState(base)).toBe("queued");
    expect(invitationState({ ...base, sentAt: new Date() })).toBe("sent");
    expect(invitationState({ ...base, email: null, maxUses: 10 })).toBe("open-link");
    expect(invitationState({ ...base, revokedAt: new Date() })).toBe("revoked");
  });
});

describe("import de matières", () => {
  it("lit le semestre et refuse un semestre hors de l'année", () => {
    const rows = parseSubjectCsv("Droit;L1;Droit civil;Civil;S1\nDroit;L1;Histoire;;S3\nDroit;L2;Anglais;;annuelle", [{ program: "Droit", level: 2, semester: null, name: "Anglais" }]);
    expect(rows.map((r) => r.status)).toEqual(["new", "invalid", "exists"]);
    expect(rows[0].semester).toBe(1);
  });
});
