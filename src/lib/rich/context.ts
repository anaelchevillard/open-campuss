import "server-only";
import type { Code, Root } from "mdast";
import { visit } from "unist-util-visit";
import type { RichContext } from "@/components/course-body";
import { parser } from "@/lib/course";
import { artifactSrc } from "./artifact-server";
import { cachedTikz } from "./tikz-server";

const MAX_TIKZ_PER_PAGE = 40;

/** Ce que la page d'un cours prépare pour ses blocs riches, une fois par lecture : adresses d'artefacts, figures TikZ en cache. */
export async function richContext(docId: string, userId: string, markdown: string): Promise<RichContext> {
  const sources = new Set<string>();
  if (markdown.includes("```tikz") || markdown.includes("~~~tikz")) {
    visit(parser.parse(markdown) as Root, "code", (node: Code) => { if (node.lang === "tikz" && sources.size < MAX_TIKZ_PER_PAGE) sources.add(node.value); });
  }
  const tikz = new Map<string, string>();
  await Promise.all([...sources].map(async (source) => {
    const found = await cachedTikz(source).catch(() => null);
    if (found?.ok) tikz.set(source, found.svg);
  }));
  return { artifactSrc: artifactSrc(docId, userId), tikz };
}
