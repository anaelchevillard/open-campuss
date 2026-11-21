import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicSignupAllowed, studentsOnlyMessage } from "@/lib/domains";

// Seule une adresse d'un domaine étudiant de la liste blanche s'inscrit seule.

const state = vi.hoisted(() => ({ domains: ["etu.exemple.fr", "etu.exemple.org"], reviewed: [] as string[], lookups: 0 }));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ clientIp: async () => "203.0.113.1", audit: vi.fn(), afterFullLogin: vi.fn(), createSession: vi.fn(), hasSecondFactor: vi.fn(), destroyCurrentSession: vi.fn(), loadSession: vi.fn(), markStepUp: vi.fn(), requireUserAny: vi.fn(), revokeSessions: vi.fn(), safeNext: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({ turnstilePassed: async () => true }));
vi.mock("@/lib/referrals", () => ({ creditReferral: vi.fn(), recordReferral: vi.fn(async () => undefined) }));
vi.mock("@/lib/mail", () => ({ notifyAdmins: vi.fn(), queueMail: vi.fn() }));
vi.mock("@/lib/admin-alert", () => ({ alertAdminsDaily: vi.fn() }));
vi.mock("@/lib/suspension", () => ({ accessRefusal: vi.fn() }));
vi.mock("@/lib/invitations", () => ({ consumeInvitation: vi.fn(), domainAllowed: vi.fn(), signupRefusal: async () => null, usableInvitation: vi.fn() }));
vi.mock("@/lib/security", () => ({ hashPassword: async () => "h", randomToken: () => "t", strongPasswordProblem: vi.fn(), rateClear: vi.fn(), rateHit: vi.fn(), rateLimited: async () => false, rateTake: vi.fn(), rateTakeAll: vi.fn(), safeEqual: vi.fn(), tokenHash: vi.fn(), verifyPassword: vi.fn() }));
vi.mock("@/lib/site-settings", () => ({ getSetting: async (key: string) => (key === "registration.mode" ? "open" : key === "registration.autoApproveDomains" ? state.domains : key === "registration.reviewedDomains" ? state.reviewed : "") }));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  // Chaque lecture compte : un refus ne doit jamais dépendre d'une recherche de compte
  const db = { select: () => { state.lookups++; return { from: () => ({ where: async () => [] }) }; }, insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) }) };
  return { db, schema };
});

process.env.SMTP_HOST = "smtp.test";
process.env.SMTP_FROM = "campuss@test";
process.env.SMTP_PASSWORD = "x";

const form = (email: string) => {
  const data = new FormData();
  for (const [k, v] of Object.entries({ email, name: "Lou Martin", program: "eco", level: "1", terms: "on" })) data.set(k, v);
  return data;
};

beforeEach(() => { state.lookups = 0; state.domains = ["etu.exemple.fr", "etu.exemple.org"]; state.reviewed = []; });

describe("liste blanche de l'inscription", () => {
  it("compare le domaine exactement", () => {
    expect(publicSignupAllowed("lou@etu.exemple.fr", state.domains)).toBe(true);
    expect(publicSignupAllowed("LOU@ETU.EXEMPLE.FR", state.domains)).toBe(true);
    expect(publicSignupAllowed("lou@exemple.com", state.domains)).toBe(false);
    expect(publicSignupAllowed("lou@etu.exemple.fr.exemple.com", state.domains)).toBe(false);
    expect(publicSignupAllowed("lou@faux-etu.exemple.fr", state.domains)).toBe(false);
    expect(publicSignupAllowed("lou@exemple.fr", state.domains)).toBe(false);
    expect(publicSignupAllowed("lou@etu.exemple.fr", [])).toBe(false);
    // Autres domaines admis par l'équipe (avec validation), en comparaison exacte eux aussi
    expect(publicSignupAllowed("prof@exemple-univ.fr", state.domains, ["exemple-univ.fr"])).toBe(true);
    expect(publicSignupAllowed("prof@x.exemple-univ.fr", state.domains, ["exemple-univ.fr"])).toBe(false);
  });
  it("le message cite le premier domaine de la liste", () => {
    expect(studentsOnlyMessage(state.domains)).toBe("Seuls les étudiants peuvent créer un compte : utilise ton adresse @etu.exemple.fr");
    expect(studentsOnlyMessage(["@etu.exemple.fr"])).toBe("Seuls les étudiants peuvent créer un compte : utilise ton adresse @etu.exemple.fr");
    expect(studentsOnlyMessage([])).toContain("invitation");
  });
});

describe("register, côté serveur", () => {
  it("refuse une adresse hors liste, sans jamais chercher de compte (aucune énumération)", async () => {
    const { register } = await import("@/app/actions/auth");
    for (const email of ["lou@exemple.com", "admin@campuss.fr", "lou@etu.exemple.fr.exemple.com"]) {
      expect(await register(null as never, form(email))).toEqual({ error: "Seuls les étudiants peuvent créer un compte : utilise ton adresse @etu.exemple.fr" });
    }
    expect(state.lookups).toBe(0);
  });
  it("suit la liste des réglages", async () => {
    const { register } = await import("@/app/actions/auth");
    state.domains = ["etu.autre-exemple.fr"];
    expect(await register(null as never, form("lou@etu.exemple.fr"))).toEqual({ error: "Seuls les étudiants peuvent créer un compte : utilise ton adresse @etu.autre-exemple.fr" });
  });
  it("admet un autre domaine seulement s'il est dans la seconde liste", async () => {
    const { register } = await import("@/app/actions/auth");
    state.reviewed = ["test.example"];
    expect(await register(null as never, form("lou@test.example"))).not.toHaveProperty("error", expect.stringContaining("Seuls les étudiants"));
    expect(await register(null as never, form("lou@exemple.com"))).toEqual({ error: expect.stringContaining("Seuls les étudiants") });
  });
  it("laisse passer une adresse étudiante jusqu'à la suite du parcours", async () => {
    const { register } = await import("@/app/actions/auth");
    const result = await register(null as never, form("lou.martin@etu.exemple.fr"));
    expect(result).not.toHaveProperty("error", expect.stringContaining("Seuls les étudiants"));
    expect(state.lookups).toBeGreaterThan(0);
  });
});
