"use client";

import type { ExtendedRecordMap } from "notion-types";
import Link from "next/link";
import type { CSSProperties, ReactEventHandler } from "react";
import { NotionRenderer } from "react-notion-x";
import { Code } from "react-notion-x/third-party/code";
import { Equation } from "react-notion-x/third-party/equation";
import { isCopiedNotionImage, unwrapNotionImage } from "@/lib/content-utils";
import "react-notion-x/styles.css";
import "prismjs/themes/prism-tomorrow.css";
import "katex/dist/katex.min.css";

type NotionImageProps = { src?: string; alt?: string; className?: string; style?: CSSProperties; fill?: boolean; onLoad?: ReactEventHandler<HTMLImageElement> };

/** Une icône ou une vignette extérieure disparaît ; une image du texte laisse un mot et son lien, plutôt qu'un cadre cassé. */
function NotionImage({ src, alt, className, style, fill, onLoad }: NotionImageProps) {
  // eslint-disable-next-line @next/next/no-img-element
  if (isCopiedNotionImage(src)) return <img src={src} alt={alt ?? ""} className={className} style={style} loading="lazy" decoding="async" onLoad={onLoad} />;
  if (fill) return null;
  return (
    <p className="rounded-[var(--radius)] bg-muted px-3 py-2 text-sm text-muted-foreground">
      Image hébergée sur un autre site, non affichée ici.{src?.startsWith("https://") && <> <a className="underline underline-offset-2" href={src} target="_blank" rel="noopener noreferrer">L’ouvrir</a></>}
    </p>
  );
}

export function NotionView({ recordMap, docId, rootPage }: { recordMap: ExtendedRecordMap; docId: string; rootPage: string }) {
  return (
    <div className="notion-host min-w-0">
      <NotionRenderer
        recordMap={recordMap}
        fullPage={false}
        darkMode={false}
        disableHeader
        rootPageId={rootPage}
        previewImages={false}
        forceCustomImages
        mapImageUrl={unwrapNotionImage}
        mapPageUrl={(pageId) => `/d/${docId}/notion/${pageId.replace(/-/g, "")}`}
        components={{ Code, Equation, Image: NotionImage, nextLink: Link }}
      />
    </div>
  );
}
