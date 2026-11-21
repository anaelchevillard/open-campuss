import { describe, expect, it } from "vitest";
import { applyFormat, insertAt } from "../src/lib/card-format";
import {
  APKG_EXPLANATION, BACK_MAX, detectDelimiter, FRONT_MAX, guessFormat, htmlToCardText, IMPORT_MAX_BYTES, IMPORT_MAX_CARDS, importPayload, isZip,
  parseAnkiText, parseCsv, parseImport, parseJson, parseQuizlet, splitRecords, withoutDuplicates,
} from "../src/lib/card-import";
import { cardImageAllowed, cardImageIds, protectDollars } from "../src/lib/card-text";

const UUID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

describe("Import de fiches : CSV / TSV", () => {
  it("détecte la tabulation, le point-virgule et la virgule", () => {
    expect(detectDelimiter("a\tb\nc\td")).toBe("\t");
    expect(detectDelimiter("a;b\nc;d")).toBe(";");
    expect(detectDelimiter("a,b\nc,d")).toBe(",");
  });

  it("une virgule dans le texte ne l'emporte pas sur la tabulation ni sur le point-virgule", () => {
    expect(detectDelimiter("Paris, France\tcapitale, ville\nLyon, France\tville")).toBe("\t");
    expect(detectDelimiter("un, deux;trois, quatre\ncinq, six;sept")).toBe(";");
  });

  it("lit les guillemets à la RFC 4180, retours à la ligne et guillemets doublés compris", () => {
    expect(splitRecords('"a,b",c\n"dit ""oui""","deux\nlignes"', ",")).toEqual([["a,b", "c"], ['dit "oui"', "deux\nlignes"]]);
  });

  it("saute la ligne d'en-tête et les lignes vides, compte les fiches incomplètes", () => {
    const result = parseCsv("Recto;Verso\nCapitale ?;Paris\n\nSans verso;\n");
    expect(result.cards).toEqual([{ front: "Capitale ?", back: "Paris" }]);
    expect(result.empty).toBe(1);
    expect(result.delimiter).toBe(";");
  });

  it("ignore les colonnes en trop et nettoie les caractères de contrôle", () => {
    expect(parseCsv("a\u0007\tb\textra").cards).toEqual([{ front: "a", back: "b" }]);
  });
});

describe("Import de fiches : Anki, notes en texte", () => {
  const anki = "#separator:tab\n#html:true\n#guid column:1\n#notetype column:2\n#deck column:3\n#tags column:6\nabc\tBasic\tBio\t<b>Mitose</b>\tdivision<br>cellulaire\ttag1\n";

  it("respecte les en-têtes : séparateur, colonnes de guid, type, paquet et étiquettes", () => {
    const result = parseAnkiText(anki);
    expect(result.format).toBe("anki");
    expect(result.cards).toEqual([{ front: "**Mitose**", back: "division\ncellulaire" }]);
  });

  it("ramène le HTML à du texte : scripts, images, sons et attributs disparaissent", () => {
    const text = htmlToCardText('<div onclick="x()">A&amp;B</div><script>alert(1)</script><img src=x onerror=alert(1)>[sound:a.mp3]<i>vu</i> &#233;t&eacute;');
    expect(text).not.toMatch(/<|>|script|onerror|sound/);
    expect(text).toContain("A&B");
    expect(text).toContain("*vu*");
    expect(text).toContain("été");
  });

  it("garde le texte d'un trou {{c1::…}} et les listes", () => {
    expect(htmlToCardText("La {{c1::mitochondrie::organite}} produit l'ATP")).toBe("La mitochondrie produit l'ATP");
    expect(htmlToCardText("<ul><li>un</li><li>deux</li></ul>").trim()).toBe("- un\n\n- deux");
  });

  it("html:false : le texte est gardé tel quel, balises comprises (elles s'afficheront en texte)", () => {
    expect(parseAnkiText("#html:false\na <b>\tb").cards).toEqual([{ front: "a <b>", back: "b" }]);
  });

  it("un export ancien sans en-tête se lit comme du TSV", () => {
    expect(parseAnkiText("Question\tRéponse").cards).toEqual([{ front: "Question", back: "Réponse" }]);
  });
});

describe("Import de fiches : Quizlet", () => {
  it("tabulation et retour à la ligne par défaut, coupe au premier séparateur", () => {
    expect(parseQuizlet("terme\tdéfinition\tavec tabulation\nautre\tdef").cards).toEqual([
      { front: "terme", back: "définition\tavec tabulation" },
      { front: "autre", back: "def" },
    ]);
  });

  it("séparateurs réglables", () => {
    expect(parseQuizlet("chat - cat;chien - dog;", { term: " - ", card: ";" }).cards).toEqual([{ front: "chat", back: "cat" }, { front: "chien", back: "dog" }]);
    expect(parseQuizlet("a,b\n\nc,d", { term: ",", card: "\n\n" }).cards).toHaveLength(2);
  });
});

describe("Import de fiches : JSON", () => {
  it("le schéma documenté, le tableau seul et les alias", () => {
    expect(parseJson('{"cards":[{"front":"a","back":"b"}]}').cards).toEqual([{ front: "a", back: "b" }]);
    expect(parseJson('[{"recto":"a","verso":"b"},{"question":"c","answer":"d"},{"term":"e","definition":"f"}]').cards).toHaveLength(3);
  });

  it("refuse un JSON invalide ou sans tableau, ignore les éléments qui ne sont pas des fiches", () => {
    expect(parseJson("{oups").error).toBeTruthy();
    expect(parseJson('{"autre":1}').error).toBeTruthy();
    const mixed = parseJson('[1, null, {"front":"a","back":"b"}, {"front":{"x":1},"back":"b"}]');
    expect(mixed.cards).toEqual([{ front: "a", back: "b" }]);
    expect(mixed.empty).toBe(3);
  });
});

describe("Import de fiches : limites et formats", () => {
  it("au plus 1 000 fiches gardées", () => {
    const text = Array.from({ length: IMPORT_MAX_CARDS + 5 }, (_, i) => `q${i}\tr${i}`).join("\n");
    const result = parseCsv(text);
    expect(result.cards).toHaveLength(IMPORT_MAX_CARDS);
    expect(result.truncated).toBe(true);
  });

  it("un côté trop long est écarté et compté", () => {
    const result = parseCsv(`${"x".repeat(FRONT_MAX + 1)}\tb\na\t${"y".repeat(BACK_MAX + 1)}\nok\tok`);
    expect(result.cards).toEqual([{ front: "ok", back: "ok" }]);
    expect(result.tooLong).toBe(2);
  });

  it("au-delà de 2 Mo, rien n'est lu", () => {
    const result = parseImport("a\tb\n".repeat(IMPORT_MAX_BYTES / 4 + 1), "csv");
    expect(result.cards).toEqual([]);
    expect(result.error).toMatch(/2 Mo/);
  });

  it("devine le format d'après le nom puis le contenu", () => {
    expect(guessFormat("x.json", "")).toBe("json");
    expect(guessFormat("export.txt", "#separator:tab\na\tb")).toBe("anki");
    expect(guessFormat("x.csv", "a;b")).toBe("csv");
  });

  it("un .apkg (zip) est reconnu et expliqué", () => {
    expect(isZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(true);
    expect(isZip(new TextEncoder().encode("a\tb"))).toBe(false);
    expect(APKG_EXPLANATION).toMatch(/Notes in Plain Text/);
  });
});

describe("Import de fiches : validation serveur (zod)", () => {
  const card = { front: " a ", back: "b" };

  it("accepte libre ou un identifiant de cours, nettoie les côtés", () => {
    const parsed = importPayload.parse({ scope: "libre", cards: [card] });
    expect(parsed.cards[0].front).toBe("a");
    expect(importPayload.safeParse({ scope: UUID, cards: [card] }).success).toBe(true);
  });

  it("refuse une portée inconnue, une fiche vide, un champ en trop, plus de 1 000 fiches ou plus de 2 Mo", () => {
    expect(importPayload.safeParse({ scope: "../x", cards: [card] }).success).toBe(false);
    expect(importPayload.safeParse({ scope: "libre", cards: [{ front: " ", back: "b" }] }).success).toBe(false);
    expect(importPayload.safeParse({ scope: "libre", cards: [{ ...card, userId: UUID }] }).success).toBe(false);
    expect(importPayload.safeParse({ scope: "libre", cards: [card], owner: UUID }).success).toBe(false);
    expect(importPayload.safeParse({ scope: "libre", cards: Array.from({ length: IMPORT_MAX_CARDS + 1 }, () => card) }).success).toBe(false);
    const heavy = Array.from({ length: 1000 }, () => ({ front: "é".repeat(FRONT_MAX), back: "é".repeat(BACK_MAX) }));
    expect(importPayload.safeParse({ scope: "libre", cards: heavy }).success).toBe(false);
    expect(importPayload.safeParse({ scope: "libre", cards: [{ front: "a", back: "x".repeat(BACK_MAX + 1) }] }).success).toBe(false);
  });

  it("écarte les doublons déjà présents et internes à l'import", () => {
    expect(withoutDuplicates([{ front: "a", back: "b" }, { front: "a", back: "b" }, { front: "a", back: "c" }], [{ front: "a", back: "c" }])).toEqual([{ front: "a", back: "b" }]);
  });
});

describe("Éditeur de fiches : mise en forme et formules", () => {
  it("gras et italique entourent la sélection, et se retirent au second appui", () => {
    const bold = applyFormat("un mot ici", 3, 6, "bold");
    expect(bold.value).toBe("un **mot** ici");
    expect(bold.value.slice(bold.start, bold.end)).toBe("mot");
    expect(applyFormat(bold.value, bold.start, bold.end, "bold").value).toBe("un mot ici");
    expect(applyFormat("abc", 0, 3, "italic").value).toBe("*abc*");
  });

  it("sans sélection, un texte à remplacer est sélectionné", () => {
    const math = applyFormat("", 0, 0, "math");
    expect(math.value).toBe("$x^2$");
    expect(math.value.slice(math.start, math.end)).toBe("x^2");
  });

  it("liste : préfixe chaque ligne sélectionnée, puis l'enlève", () => {
    const list = applyFormat("a\nb\nc", 2, 5, "list");
    expect(list.value).toBe("a\n- b\n- c");
    expect(applyFormat(list.value, list.start, list.end, "list").value).toBe("a\nb\nc");
  });

  it("formule centrée sur sa propre ligne, image insérée au curseur", () => {
    expect(applyFormat("Soit", 4, 4, "mathBlock").value).toBe("Soit\n$$\n\\frac{a}{b}\n$$\n");
    expect(insertAt("ab", 1, 1, "X")).toEqual({ value: "aXb", start: 2, end: 2 });
  });

  it("$ … $ ouvre une formule, mais « 10 $ » et « $5 et $10 » restent du texte", () => {
    expect(protectDollars("soit $x^2$ ici")).toBe("soit $x^2$ ici");
    expect(protectDollars("10 $ et 20 $")).toBe("10 \\$ et 20 \\$");
    expect(protectDollars("$5 et $10")).toBe("\\$5 et \\$10");
    expect(protectDollars("$$E = mc^2$$ et `$code`")).toBe("$$E = mc^2$$ et `$code`");
    expect(protectDollars("déjà \\$ échappé")).toBe("déjà \\$ échappé");
  });

  it("images de fiches : seulement depuis le site, et retrouvées dans le texte", () => {
    expect(cardImageAllowed(`/card-images/${UUID}?inline=1`)).toBe(true);
    expect(cardImageAllowed(`/files/${UUID}`)).toBe(true);
    expect(cardImageAllowed("https://exemple.fr/x.png")).toBe(false);
    expect(cardImageAllowed(`/card-images/${UUID}/../x`)).toBe(false);
    expect(cardImageIds(`a ![image](/card-images/${UUID.toUpperCase()}?inline=1)`)).toEqual([UUID]);
  });
});
