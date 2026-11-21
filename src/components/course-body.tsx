import "katex/dist/katex.min.css";
import { isValidElement, type ReactNode } from "react";
import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import { ArtifactFrame } from "@/components/rich/artifact-frame";
import { RichCode } from "@/components/rich/rich-code";
import { isRichLanguage } from "@/lib/rich/languages";
import { calloutKind, COURSE_IMAGE, courseOutline, remarkCampuss, uniqueSlug } from "@/lib/course";
import type { ArtifactDisplay } from "@/lib/rich/artifact";

/** Ce que le rendu des blocs riches demande à la page : l'adresse signée d'un artefact pour ce lecteur. */
export type RichContext = { artifactSrc?: (fileId: string, entry: string) => string | null; tikz?: Map<string, string> };

type HastNode = { type: string; tagName?: string; value?: string; properties?: { className?: unknown }; children?: HastNode[] };
const hastText = (node: HastNode): string => (node.type === "text" ? node.value ?? "" : (node.children ?? []).map(hastText).join(""));

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : "";
}

/** Un seul rendu pour tous les cours. Sans rehype-raw, tout HTML présent dans le texte reste du texte. */
export function CourseBody({ markdown, rich = {} }: { markdown: string; rich?: RichContext }) {
  const seen = new Map<string, number>();
  return (
    <article className="course min-w-0">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath, remarkDirective, remarkCampuss]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => <h2 id={uniqueSlug(seen, textOf(children))}>{children}</h2>,
          h2: ({ children }) => <h2 id={uniqueSlug(seen, textOf(children))}>{children}</h2>,
          h3: ({ children }) => <h3 id={uniqueSlug(seen, textOf(children))}>{children}</h3>,
          h4: ({ children }) => <h3 id={uniqueSlug(seen, textOf(children))}>{children}</h3>,
          blockquote: ({ children }) => <blockquote className={calloutKind(textOf(children))}>{children}</blockquote>,
          // eslint-disable-next-line @next/next/no-img-element
          img: ({ src, alt }) => (typeof src === "string" && COURSE_IMAGE.test(src) ? <img src={src} alt={alt ?? ""} loading="lazy" /> : null),
          // Un bloc de code « vega-lite », « tikz », « plot » ou « svg-figure » devient une figure
          pre: ({ node, children }) => {
            const code = (node as HastNode | undefined)?.children?.find((c) => c.type === "element" && c.tagName === "code");
            const classes = code?.properties?.className;
            const lang = (Array.isArray(classes) ? classes : []).map(String).find((c) => c.startsWith("language-"))?.slice(9);
            if (code && isRichLanguage(lang)) return <RichCode lang={lang} source={hastText(code).replace(/\n$/, "")} tikz={rich.tikz} />;
            return <pre>{children}</pre>;
          },
          figure: (props) => {
            const p = props as Record<string, unknown>;
            const file = p["data-artifact-file"];
            if (typeof file !== "string") return <figure>{props.children}</figure>;
            const entry = String(p["data-artifact-entry"] ?? "index.html");
            return <ArtifactFrame src={rich.artifactSrc?.(file, entry) ?? null} title={String(p.title ?? "Artefact")} display={p["data-artifact-display"] as ArtifactDisplay} />;
          },
          a: ({ href, children }) => <a href={href} {...(href?.startsWith("#") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>{children}</a>,
        }}
      >
        {markdown}
      </Markdown>
    </article>
  );
}

export const courseToc = (markdown: string) => courseOutline(markdown).filter((item) => item.depth === 2 || item.depth === 3).map((item) => ({ id: item.id, text: item.text, depth: item.depth }));
