"use client";

import { useState } from "react";
import { revokeShare, shareCourse } from "@/app/actions/habits";
import { CopyLink } from "@/components/habits";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Icon } from "@/components/icon";
import { IconShare } from "@/lib/icons";

/** Le lien se crée à l'ouverture : il n'y a rien à remplir. L'aperçu ne montre jamais le contenu. */
export function ShareCourse({ docId, withLabel }: { docId: string; withLabel?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const load = async () => {
    const result = await shareCourse(docId);
    if ("url" in result) { setUrl(result.url); setError(null); setRevoked(false); } else setError(result.error);
  };
  return (
    <Popover onOpenChange={(open) => { if (open && !url) void load(); }}>
      <PopoverTrigger render={<Button variant={withLabel ? "outline" : "ghost"} size={withLabel ? "default" : "icon"} aria-label="Partager" title="Partager" />}><Icon icon={IconShare} />{withLabel && "Partager"}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-3">
        <div>
          <p className="font-semibold">Partager hors de Campuss</p>
          <p className="text-sm text-muted-foreground">Le lien montre le titre et la matière, jamais le contenu.</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {revoked && <p role="status" className="text-sm">Lien désactivé. Il ne fonctionne plus.</p>}
        {url && <CopyLink link={url} />}
        {url && <div className="border-t pt-2"><Button size="sm" variant="ghost" onClick={async () => { await revokeShare(docId); setUrl(null); setRevoked(true); }}>Désactiver ce lien</Button></div>}
        {revoked && <div><Button size="sm" variant="outline" onClick={() => void load()}>Créer un nouveau lien</Button></div>}
      </PopoverContent>
    </Popover>
  );
}
