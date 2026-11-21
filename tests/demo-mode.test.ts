import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_REFUSAL, DEMO_UPLOAD_MAX_BYTES, demoUploadRefusal, isDemo } from "@/lib/demo";

// Instance de démonstration : chaque blocage est vérifié sur l'action ou la route elle-même, pas sur un bouton masqué.
// Aucune action refusée ne doit lire la session ni toucher la base.

const touched = vi.hoisted(() => ({ calls: [] as string[] }));

const forbidden = (name: string) => () => { touched.calls.push(name); throw new Error(`${name} ne devrait pas être appelé`); };

vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }), notFound: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn() }), headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => {
  const stop = forbidden("auth");
  return {
    audit: stop, afterFullLogin: stop, apiAdmin: stop, apiMember: stop, clientIp: async () => "203.0.113.9", createSession: stop, currentUser: stop,
    destroyCurrentSession: stop, hasSecondFactor: stop, loadSession: stop, markStepUp: stop, missingStepUp: stop, missingStepUpToEnroll: stop,
    requireUser: stop, requireUserAny: stop, revokeSessions: stop, safeNext: (n: string) => n || "/accueil",
  };
});
vi.mock("@/lib/admin-ops", () => ({ adminFor: forbidden("adminFor"), isStepUp: () => false, reasonOf: (r: string) => r }));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const db = new Proxy({}, { get: (_, key) => forbidden(`db.${String(key)}`) });
  return { db, schema };
});

const form = (fields: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [k, v] of Object.entries({ email: "lou@etu.exemple.fr", current: "x", password: "nouveau-mot-de-passe-long", code: "123456", token: "t", name: "Lou", ...fields })) data.set(k, v);
  return data;
};

beforeEach(() => { process.env.DEMO_MODE = "1"; touched.calls = []; });
afterEach(() => { delete process.env.DEMO_MODE; });

describe("lecture du mode", () => {
  it("DEMO_MODE=1 ou true, rien d'autre", () => {
    for (const [value, on] of [["1", true], ["true", true], [" TRUE ", true], ["0", false], ["", false], ["oui", false]] as const) {
      process.env.DEMO_MODE = value;
      expect(isDemo()).toBe(on);
    }
    delete process.env.DEMO_MODE;
    expect(isDemo()).toBe(false);
  });
  it("plafond des fichiers seulement sur la démo", () => {
    expect(demoUploadRefusal(DEMO_UPLOAD_MAX_BYTES)).toBeNull();
    expect(demoUploadRefusal(String(DEMO_UPLOAD_MAX_BYTES + 1))?.status).toBe(413);
    expect(demoUploadRefusal("n'importe quoi")?.status).toBe(413);
    delete process.env.DEMO_MODE;
    expect(demoUploadRefusal(500 * 1024 * 1024)).toBeNull();
  });
});

describe("compte et sécurité, côté serveur", () => {
  it("mot de passe, adresse, 2FA et suppression refusés sans lire la session", async () => {
    const account = await import("@/app/actions/account");
    for (const action of [account.changePassword, account.requestEmailChange, account.confirmEmailChange, account.confirmTotp, account.disableTotp, account.deleteOwnAccount]) {
      expect(await action({}, form())).toEqual({ error: DEMO_REFUSAL });
    }
    await expect(account.createRecoveryCodes()).rejects.toThrow(DEMO_REFUSAL);
    // Actions sans retour : renvoi vers la page, qui explique le refus ; rien n'est fait
    await expect(account.startTotp()).rejects.toThrow("REDIRECT /parametres/compte");
    await expect(account.revokeOtherSessions()).rejects.toThrow("REDIRECT /parametres/compte");
    await expect(account.revokeOneSession(form({ session: "abc" }))).rejects.toThrow("REDIRECT /parametres/compte");
    expect(touched.calls).toEqual([]);
  });

  it("inscription, invitation, mot de passe oublié et réinitialisation du second facteur refusés", async () => {
    const auth = await import("@/app/actions/auth");
    for (const action of [auth.register, auth.acceptInvitation, auth.forgotPassword, auth.resetPassword, auth.requestMfaReset]) {
      expect(await action({}, form())).toEqual({ error: DEMO_REFUSAL });
    }
    expect(touched.calls).toEqual([]);
  });

  it("« Entrer dans la démo » n'existe que sur une instance de démonstration", async () => {
    delete process.env.DEMO_MODE;
    const { enterDemo } = await import("@/app/actions/auth");
    expect(await enterDemo()).toEqual({ error: "Indisponible sur ce site." });
    expect(touched.calls).toEqual([]);
  });

  it("nom et textes du profil partagé refusés", async () => {
    const social = await import("@/app/actions/social");
    const profile = await import("@/app/actions/profile");
    const refused = { ok: false, error: DEMO_REFUSAL };
    expect(await social.saveProfileField("name", "Autre nom")).toEqual(refused);
    expect(await social.saveProfileField("bio", "texte")).toEqual(refused);
    expect(await social.saveStatus({ text: "statut", duration: "jour" })).toEqual(refused);
    expect(await profile.saveProfileInfo({ bio: "texte" })).toEqual(refused);
    expect(touched.calls).toEqual([]);
  });

  it("invitations de l'administration refusées", async () => {
    const create = await import("@/app/actions/admin/create");
    expect(await create.queueInvites({ text: "lou@etu.exemple.fr", programId: null, level: null, role: "member", message: "", reason: "test" } as never)).toEqual({ error: DEMO_REFUSAL });
    expect(await create.createOpenLink({ programId: null, level: null, maxUses: 1, days: 1, allowedDomain: "", reason: "test" })).toEqual({ error: DEMO_REFUSAL });
    expect(await create.resendInvitation("00000000-0000-0000-0000-000000000000")).toEqual({ error: DEMO_REFUSAL });
    expect(touched.calls).toEqual([]);
  });
});

describe("routes, côté serveur", () => {
  const post = (bytes: number) => new Request("https://demo.exemple.fr/api", { method: "POST", headers: { "content-length": String(bytes) }, body: "x" });

  it("export des données, photo, bannière et clés d'accès : 403 avec le message", async () => {
    const routes = [
      (await import("@/app/api/account/export/route")).GET(),
      (await import("@/app/api/account/avatar/route")).POST(post(10)),
      (await import("@/app/api/account/avatar/route")).DELETE(),
      (await import("@/app/api/account/banner/route")).POST(post(10)),
      (await import("@/app/api/passkey/register/route")).GET(),
      (await import("@/app/api/passkey/register/route")).POST(post(10)),
    ];
    for (const response of await Promise.all(routes)) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: DEMO_REFUSAL });
    }
    expect(touched.calls).toEqual([]);
  });

  it("dépôt de pièce jointe au-delà de 2 Mo refusé avant toute écriture", async () => {
    vi.doMock("@/lib/auth", () => ({ apiMember: async () => ({ id: "u1", role: "member", mustChangePassword: false }), apiAdmin: async () => null }));
    vi.resetModules();
    const { POST } = await import("@/app/api/admin/uploads/route");
    const request = new Request("https://demo.exemple.fr/api/admin/uploads", { method: "POST", body: JSON.stringify({ documentId: "00000000-0000-4000-8000-000000000000", purpose: "attachment", filename: "cours.pdf", size: 20 * 1024 * 1024 }) });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(touched.calls).toEqual([]);
    vi.doUnmock("@/lib/auth");
    vi.resetModules();
  });
});

describe("rien ne sort du serveur", () => {
  it("aucun mail mis en file, ni IA, ni push, ni service connecté", async () => {
    Object.assign(process.env, { SMTP_HOST: "smtp.test", SMTP_FROM: "a@test", SMTP_PASSWORD: "x", AI_API_KEY: "clé", VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", NOTION_OAUTH_CLIENT_ID: "n" });
    const { env } = await import("@/lib/env");
    const { queueMail } = await import("@/lib/mail");
    await queueMail("lou@etu.exemple.fr", { subject: "Test", blocks: [] } as never);
    expect(touched.calls).toEqual([]);
    expect([env.smtpEnabled, env.aiApiKey, env.pushEnabled, env.notionOauthClientId]).toEqual([false, "", false, ""]);
    delete process.env.DEMO_MODE;
    expect([env.smtpEnabled, env.aiApiKey, env.pushEnabled, env.notionOauthClientId]).toEqual([true, "clé", true, "n"]);
    for (const key of ["SMTP_HOST", "SMTP_FROM", "SMTP_PASSWORD", "AI_API_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "NOTION_OAUTH_CLIENT_ID"]) delete process.env[key];
  });

  it("aucune mesure d'audience, ni plan du site", async () => {
    const track = await import("@/app/api/track/route");
    const response = await track.POST(new Request("https://demo.exemple.fr/api/track", { method: "POST", headers: { "user-agent": "Mozilla/5.0" }, body: "{}" }));
    expect(await response.json()).toEqual({ ok: true });
    expect(touched.calls).toEqual([]);
    expect((await import("@/app/sitemap")).default()).toEqual([]);
    expect((await import("@/app/robots")).default()).not.toHaveProperty("sitemap");
  });

  it("tout le site en noindex, y compris les pages publiques", async () => {
    process.env.BASE_URL = "https://demo.exemple.fr";
    const { proxy } = await import("@/proxy");
    const { NextRequest } = await import("next/server");
    const response = proxy(new NextRequest("https://demo.exemple.fr/"));
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    delete process.env.DEMO_MODE;
    expect(proxy(new NextRequest("https://demo.exemple.fr/")).headers.get("X-Robots-Tag")).toBeNull();
    delete process.env.BASE_URL;
  });
});
