import { describe, expect, it } from "vitest";
import { examInSentence, examKindOf, examPhrase, examShort } from "@/lib/exam-kind";

describe("Textes des annonces d'examens", () => {
  it("« Partiel » par défaut, toute valeur inconnue comprise", () => {
    expect(examKindOf(undefined)).toBe("partiel");
    expect(examKindOf("cc")).toBe("cc");
    expect(examKindOf("<script>")).toBe("partiel");
    expect(examShort(null)).toBe("Partiel");
  });
  it("retire l'émoji de la matière dans une phrase et élide devant une voyelle", () => {
    expect(examPhrase("partiel", "🏭 Principes Économiques")).toBe("Partiel de Principes Économiques");
    expect(examPhrase("cc", "📈 Économie")).toBe("CC d’Économie");
    expect(examInSentence("cc", "Droit")).toBe("le CC de Droit");
    expect(examInSentence("partiel", "Histoire")).toBe("le partiel d’Histoire");
  });
});
