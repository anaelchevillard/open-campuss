import Link from "next/link";
import type { NotionDatabase } from "@/lib/notion";

export function NotionDatabases({ docId, databases }: { docId: string; databases: NotionDatabase[] }) {
  return (
    <>
      {databases.map((base, index) => (
        <section key={index} className="mt-6 min-w-0">
          <h2 className="mb-2 section-title">{base.title}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead><tr className="border-b border-border text-muted-foreground">{base.columns.map((c) => <th key={c} className="py-2 pr-4 font-semibold">{c}</th>)}</tr></thead>
              <tbody>
                {base.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border">
                    {row.cells.map((cell, c) => <td key={c} className="py-2 pr-4">{c === 0 ? <Link className="font-semibold underline-offset-2 hover:underline" href={`/d/${docId}/notion/${row.id}`}>{cell || "Sans titre"}</Link> : cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
