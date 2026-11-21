"use client";

import "katex/dist/katex.min.css";
import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { cn } from "cn";
import { cardImageAllowed, hasMarkup, protectDollars, withHardBreaks } from "@/lib/card-text";

// `$x$` est une formule ; protectDollars rend au texte les dollars qui n'en ouvrent pas (« 10 $ »)
const remarkMathOptions = { singleDollarTextMath: true };

/**
 * Le recto ou le verso d'une fiche : gras, italique, listes, code et formules (`$ … $`, `$$ … $$`), sans HTML.
 * Un « 10 $ » reste du texte : un dollar suivi d'une espace n'ouvre pas de formule.
 */
export function CardText({ text, className, clamp }: { text: string; className?: string; clamp?: boolean }) {
  if (!hasMarkup(text)) return <span data-reading className={cn("block whitespace-pre-line", clamp && "line-clamp-3", className)}>{text}</span>;
  return (
    <span data-reading className={cn("card-text block [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[0.9em] [&_img]:my-2 [&_img]:max-h-56 [&_img]:rounded-lg [&_li]:ms-5 [&_ol]:list-decimal [&_p+p]:mt-2 [&_ul]:list-disc", clamp && "line-clamp-3", className)}>
      <Markdown
        remarkPlugins={[remarkGfm, [remarkMath, remarkMathOptions]]}
        rehypePlugins={[rehypeKatex]}
        // Liens, titres, tableaux et citations redeviennent du texte : une fiche partagée ne peut rien piéger
        disallowedElements={["a", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "th", "td", "blockquote", "hr", "input"]}
        unwrapDisallowed
        components={{
          // eslint-disable-next-line @next/next/no-img-element
          img: ({ src, alt }) => (cardImageAllowed(src) ? <img src={src} alt={alt ?? ""} loading="lazy" /> : <span>{alt}</span>),
          p: ({ children }) => <span className="block [&+&]:mt-2">{children}</span>,
        }}
      >
        {protectDollars(withHardBreaks(text))}
      </Markdown>
    </span>
  );
}
