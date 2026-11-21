import { describe, expect, it } from "vitest";
import { signState, verifyState } from "@/lib/connected/oauth-seal";
import { PROVIDERS } from "@/lib/connected/providers";
import { decodeState, editedAgo, encodeState, returnWith, safeReturnTo } from "@/lib/connected/rules";
import { looksScanned } from "@/lib/import-text";
import { hasPendingFiles, keepPendingFiles, takePendingFiles } from "@/lib/pending-files";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("comptes connectés : adresse de retour", () => {
  it("accepte les chemins utiles et l'application", () => {
    expect(safeReturnTo("/editer/1b2c?depart=notion")).toBe("/editer/1b2c?depart=notion");
    expect(safeReturnTo("/parametres/comptes-connectes")).toBe("/parametres/comptes-connectes");
    expect(safeReturnTo("/contribuer/nouveau?depart=google")).toBe("/contribuer/nouveau?depart=google");
    expect(safeReturnTo("campuss://import/notion?ok=1")).toBe("campuss://import/notion?ok=1");
  });
  it("refuse tout le reste (redirection ouverte)", () => {
    for (const bad of ["https://exemple.com", "//exemple.com/editer/", "/\\exemple.com", "/admin", "/editer/../admin", "/editer/%2e%2e/admin", "javascript:alert(1)", "/editer/x y", "", null, 42, "campuss://a b", `/editer/${"a".repeat(400)}`]) {
      expect(safeReturnTo(bad)).toBeNull();
    }
  });
  it("ajoute le résultat sans écraser la requête", () => {
    expect(returnWith("/editer/a?depart=notion", "ok", "notion")).toBe("/editer/a?depart=notion&resultat=ok&service=notion");
    expect(returnWith("/parametres/comptes-connectes", "annule", "google")).toBe("/parametres/comptes-connectes?resultat=annule&service=google");
  });
  it("l'état signé porte le retour, et un retour forgé invalide l'état", () => {
    const state = signState({ user: "u", provider: "notion", returnTo: "/editer/abc?depart=notion" }, 1000);
    expect(verifyState(state, 2000)?.returnTo).toBe("/editer/abc?depart=notion");
    const forged = encodeState({ user: "u", provider: "notion", nonce: "n", expires: 9e15, returnTo: "https://exemple.com" });
    expect(decodeState(forged)).toBeNull();
    expect(decodeState(encodeState({ user: "u", provider: "google", nonce: "n", expires: 5 }))).toEqual({ user: "u", provider: "google", nonce: "n", expires: 5 });
  });
});

describe("imports : détection d'un scan", () => {
  it("moins de 50 caractères par page, c'est un scan", () => {
    expect(looksScanned([])).toBe(true);
    expect(looksScanned(["", "  \n "])).toBe(true);
    expect(looksScanned(["Page 1", "Page 2"])).toBe(true);
    expect(looksScanned(["La responsabilité civile délictuelle suppose une faute, un dommage et un lien de causalité."])).toBe(false);
    expect(looksScanned(["Une page de texte complète, avec bien plus de cinquante caractères lisibles.", ""])).toBe(true);
    expect(looksScanned(["x".repeat(49)])).toBe(true);
    expect(looksScanned(["x".repeat(50)])).toBe(false);
  });
});

describe("imports : sélecteur", () => {
  it("« modifié il y a… » court", () => {
    const now = Date.UTC(2026, 10, 6);
    expect(editedAgo(null, now)).toBe("");
    expect(editedAgo(now - 30_000, now)).toBe("modifié à l’instant");
    expect(editedAgo(now - 5 * 60_000, now)).toBe("modifié il y a 5 min");
    expect(editedAgo(now - 3 * 3_600_000, now)).toBe("modifié il y a 3 h");
    expect(editedAgo(now - 2 * 86_400_000, now)).toBe("modifié il y a 2 j");
    expect(editedAgo(now - 90 * 86_400_000, now)).toBe("modifié il y a 3 mois");
    expect(editedAgo(now - 800 * 86_400_000, now)).toBe("modifié il y a 2 ans");
  });
  it("Notion : recherche triée par modification, sans corbeille, avec l'emoji", async () => {
    let sent: Record<string, unknown> = {};
    const http = (async (_: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      return json({ next_cursor: "c2", results: [
        { id: "p1", last_edited_time: "2026-11-01T00:00:00Z", icon: { type: "emoji", emoji: "📘" }, properties: { Name: { type: "title", title: [{ plain_text: "Droit civil" }] } } },
        { id: "p2", in_trash: true, properties: {} },
        { id: "bad id'", properties: {} },
      ] });
    }) as never;
    const page = await PROVIDERS.notion.search("t", "civil", "c1", http);
    expect(sent).toMatchObject({ query: "civil", start_cursor: "c1", sort: { direction: "descending", timestamp: "last_edited_time" }, page_size: 25 });
    expect(page).toEqual({ next: "c2", items: [{ id: "p1", title: "Droit civil", editedAt: Date.parse("2026-11-01T00:00:00Z"), icon: "📘", mime: "notion" }] });
  });
  it("Google : Docs non supprimés, nom échappé, 25 par page", async () => {
    let asked = new URL("https://x");
    const http = (async (url: string) => { asked = new URL(url); return json({ nextPageToken: "n", files: [{ id: "d1", name: "CM 3", modifiedTime: "2026-10-01T00:00:00Z" }] }); }) as never;
    const page = await PROVIDERS.google.search("t", "l'acte", null, http);
    expect(asked.searchParams.get("q")).toBe("mimeType='application/vnd.google-apps.document' and trashed=false and name contains 'l\\'acte'");
    expect(asked.searchParams.get("orderBy")).toBe("modifiedTime desc");
    expect(asked.searchParams.get("pageSize")).toBe("25");
    expect(page.items[0]).toMatchObject({ id: "d1", title: "CM 3" });
    expect(page.next).toBe("n");
  });
  it("Notion : l'espace sert d'étiquette du compte", async () => {
    const config = { clientId: "id", clientSecret: "sec", redirectUri: "https://campuss.fr/api/connected/notion/callback" };
    const tokens = await PROVIDERS.notion.exchange(config, "c", (async () => json({ access_token: "n", workspace_name: "Mes cours" })) as never);
    expect(tokens.label).toBe("Mes cours");
  });
});

describe("imports : photos en attente", () => {
  it("reprises une seule fois, oubliées après 5 min", () => {
    const file = new File(["x"], "page.jpg", { type: "image/jpeg" });
    keepPendingFiles([file]);
    expect(hasPendingFiles()).toBe(true);
    expect(takePendingFiles()).toEqual([file]);
    expect(takePendingFiles()).toEqual([]);
    keepPendingFiles([file]);
    expect(takePendingFiles(Date.now() + 6 * 60_000)).toEqual([]);
  });
});
