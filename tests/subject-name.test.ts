import { describe, expect, it } from "vitest";
import { needText } from "@/lib/course-request-rules";
import { describeQuest } from "@/lib/quests";
import { examNotification } from "@/lib/reminders/exam-soon";
import { newCourseNotifications } from "@/lib/reminders/new-course";
import { inSentence, subjectName } from "@/lib/subject-name";

describe("subjectName : l'émoji d'une matière hors des phrases", () => {
  it("garde l'émoji par défaut (titres, sélecteurs, cartes)", () => {
    expect(subjectName("🏭 Principes Économiques")).toBe("🏭 Principes Économiques");
  });

  it.each([
    ["🏭 Principes Économiques", "Principes Économiques"],
    ["⚖️ Droit constitutionnel", "Droit constitutionnel"], // sélecteur de variation
    ["🏛︎ Histoire", "Histoire"], // présentation texte
    ["🇫🇷 Droit français", "Droit français"], // drapeau (indicateurs régionaux)
    ["🇪🇺🇫🇷 Institutions", "Institutions"], // deux drapeaux
    ["🏴󠁧󠁢󠁳󠁣󠁴󠁿 Droit écossais", "Droit écossais"], // drapeau de sous-division (étiquettes)
    ["👩‍⚖️ Procédure", "Procédure"], // séquence ZWJ
    ["👨🏽‍🏫 Pédagogie", "Pédagogie"], // ZWJ + modificateur de teinte
    ["👍🏿 Méthodo", "Méthodo"], // modificateur de teinte
    ["🏳️‍🌈 Sociologie", "Sociologie"], // ZWJ + sélecteur
    ["1️⃣ Introduction", "Introduction"], // touche
    ["📊📈  Statistiques", "Statistiques"], // plusieurs, espaces
    ["  🧪 Chimie  ", "Chimie"],
  ])("%s → %s", (name, plain) => {
    expect(subjectName(name, { emoji: false })).toBe(plain);
    expect(inSentence(name)).toBe(plain);
  });

  it("laisse intact un nom sans émoji, y compris chiffres, accents et ponctuation en tête", () => {
    for (const name of ["Principes Économiques", "Droit civil 2", "3D et modélisation", "« Grands arrêts »", "#Numérique", "Économie (L1)"]) {
      expect(subjectName(name, { emoji: false })).toBe(name);
    }
  });

  it("ne retire que l'émoji de tête, pas ceux du milieu", () => {
    expect(inSentence("🏭 Économie ⚙️ industrielle")).toBe("Économie ⚙️ industrielle");
  });

  it("un nom vide ou fait seulement d'émojis ne disparaît pas", () => {
    expect(inSentence(null)).toBe("");
    expect(inSentence(undefined)).toBe("");
    expect(inSentence("🏭")).toBe("🏭");
  });
});

describe("les phrases qui citent une matière n'ont plus son émoji", () => {
  const eco = "🏭 Principes Économiques";
  it("rappel de partiel", () => {
    expect(examNotification({ id: "e", title: "", place: "", subject: eco }, 6).title).toBe("Partiel de Principes Économiques dans 6 jours");
  });
  it("nouveaux cours", () => {
    const doc = { id: "a", title: "A", category: "cours", subjectId: 1, subject: eco, level: 1, programId: 1, authors: [] };
    expect(newCourseNotifications([doc], { id: "moi", programId: 1, level: 1 }, "2026-11-15")[0].title).toBe("Nouveau cours en Principes Économiques");
  });
  it("demande de cours et quêtes", () => {
    expect(needText("partiel", eco)).toBe("Un ancien partiel de Principes Économiques");
    expect(describeQuest("weak:3", () => eco).label).toBe("5 questions en Principes Économiques");
  });
});
