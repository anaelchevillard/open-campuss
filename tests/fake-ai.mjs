// Faux service d'IA pour le banc d'essai : renvoie ce qu'un modèle pourrait produire de pire.
import { createServer } from "node:http";

const REPLY = `\`\`\`markdown
# Titre de niveau un

## Loi normale

> **Définition :** une variable aléatoire suit une loi normale.

La densité vaut $\\frac{1}{\\sigma\\sqrt{2\\pi}}$.

<script>window.__xss=1</script>
<img src="https://evil.example/pixel.png" onerror="window.__xss=1">
![pisteur](https://evil.example/pixel.png)
[piège](javascript:window.__xss=1)
\`\`\``;

const QUIZ = { questions: [1, 2, 3].map((n) => ({ question: `Question numéro ${n} <script>window.__xss=1</script>`, choices: ["Bonne réponse", "Autre", "Encore"], answer: 0, explanation: "Parce que." })) };

let memoCalls = 0;

const USAGE = { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 };
const send = (response, status, payload) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
};
const reply = (response, content) => send(response, 200, { choices: [{ message: { content } }], usage: USAGE });
const between = (text, tag) => text.split(`<${tag}>\n`)[1]?.split(`\n</${tag}>`)[0] ?? "";

// Format attendu de src/lib/ai/client.ts : consignes en message system, données en message user, schéma JSON pour les sorties JSON
createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    const payload = JSON.parse(body);
    const [system, user] = payload.messages ?? [];
    if (system?.role !== "system" || user?.role !== "user" || typeof system.content !== "string" || !payload.max_tokens) return send(response, 400, { error: "format inattendu" });
    const content = user.content;
    const wantsJson = payload.response_format?.type === "json_schema" && payload.response_format.json_schema?.schema;
    // Proposition au dépôt. Un fichier piégé obtient la réponse d'un modèle qui a obéi au texte.
    if (system.content.includes("classer un document de cours")) {
      if (!wantsJson) return send(response, 400, { error: "schéma absent" });
      const subjects = JSON.parse(between(content, "matieres"));
      const doc = between(content, "cours");
      const answer = doc.includes("PIEGE-IA")
        ? { title: "<img src=x onerror=window.__xss=1> https://evil.example", subject: 999999, category: "cours", chapter: null }
        : doc.includes("PIEGE-FORME") ? { title: "Titre", subject: null, category: "virus", chapter: null }
          : { title: "Titre proposé par l'IA", subject: subjects.find((s) => s.name === "Mathématiques" && s.annee === "L1")?.id ?? subjects[0]?.id ?? null, category: "fiche", chapter: 4 };
      return reply(response, `Voici :\n${JSON.stringify(answer)}`);
    }
    if (system.content.includes("fiches mémo")) {
      if (!wantsJson) return send(response, 400, { error: "schéma absent" });
      memoCalls++;
      const cards = [1, 2, 3, 4].map((n) => ({ front: `Fiche ${n} de l'appel ${memoCalls} ?`, back: "Une réponse <script>window.__xss=1</script>" }));
      return reply(response, JSON.stringify({ cards }));
    }
    // Quiz : le premier essai renvoie du JSON bavard, comme un vrai modèle
    if (system.content.includes("quiz")) {
      if (!wantsJson) return send(response, 400, { error: "schéma absent" });
      return reply(response, `Voici le quiz :\n${JSON.stringify(QUIZ)}`);
    }
    const ok = request.headers.authorization === "Bearer cle-de-test" && request.url === "/v1/chat/completions"
      && Array.isArray(content) && content.find((part) => part.type === "image_url")?.image_url.url.startsWith("data:image/jpeg;base64,");
    if (!ok) return send(response, 400, { error: "refusé" });
    reply(response, REPLY);
  });
}).listen(9999);
