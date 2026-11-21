import { describe, expect, it } from "vitest";
import { lastAdminRefusal, type AdminSeat } from "@/lib/admin-rules";

const seat = (id: string, more: Partial<AdminSeat> = {}): AdminSeat => ({ id, active: true, secondFactor: true, isOwner: false, ...more });

describe("garde du dernier administrateur", () => {
  it("refuse de retirer le seul administrateur sûr", () => {
    expect(lastAdminRefusal([seat("a"), seat("b", { secondFactor: false })], "a", "demote")).toMatch(/aucun administrateur/);
    expect(lastAdminRefusal([seat("a"), seat("b", { active: false })], "a", "delete")).toMatch(/aucun administrateur/);
    expect(lastAdminRefusal([seat("a")], "a", "reset2fa")).toMatch(/aucun administrateur/);
  });
  it("accepte quand un autre administrateur sûr reste", () => {
    expect(lastAdminRefusal([seat("a"), seat("b")], "a", "disable")).toBeNull();
  });
  it("protège le propriétaire du site", () => {
    expect(lastAdminRefusal([seat("o", { isOwner: true }), seat("b")], "o", "demote")).toMatch(/propriétaire/);
    expect(lastAdminRefusal([seat("o", { isOwner: true }), seat("b")], "o", "reset2fa")).toBeNull();
  });
  it("ne dit rien pour un compte qui n'est pas administrateur", () => {
    expect(lastAdminRefusal([seat("a")], "x", "delete")).toBeNull();
  });
});
