"use client";

import { useState } from "react";
import { testLink } from "@/app/actions/admin/people";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Coller le lien d'un cours : ce compte peut-il l'ouvrir, et sinon pourquoi. */
export function RightsTester({ personId }: { personId: string }) {
  const { run, dialog } = useAdminAction();
  const [url, setUrl] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  return (
    <form className="grid max-w-xl gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => testLink(personId, url), { quiet: true }); setAnswer(r?.data ?? null); }}>
      <Label htmlFor="test-link">Tester un lien</Label>
      <div className="flex gap-2"><Input id="test-link" value={url} onChange={(e) => { setUrl(e.target.value); setAnswer(null); }} placeholder="https://campuss.fr/d/…" /><Button type="submit" variant="outline">Tester</Button></div>
      {answer && <p role="status" className="text-sm">{answer}</p>}
      {dialog}
    </form>
  );
}
