import { Progress } from "@/components/ui/progress";
import { READINESS_FORMULA, type Readiness } from "@/lib/readiness";
import { inSentence } from "@/lib/subject-name";

export const FormulaLine = () => <p className="mt-2 text-sm text-muted-foreground">{READINESS_FORMULA}</p>;

/** « Prêt à 72 % pour le partiel de Maths », ou l'aveu qu'on ne sait pas encore : jamais un chiffre sans base. */
export function ExamReadiness({ result, subject }: { result: Readiness; subject: string }) {
  if (!result.known) return <p className="mt-2 text-sm text-muted-foreground">{result.detail}</p>;
  return (
    <div className="mt-3">
      <p className="font-semibold">Prêt à {result.percent} % pour le partiel de {inSentence(subject)}</p>
      <Progress className="mt-1.5" value={result.percent} aria-label={`Préparation : ${result.percent} %`} />
      {result.detail && <p className="mt-1.5 text-sm text-muted-foreground">{result.detail}</p>}
    </div>
  );
}

export function SubjectScores({ rows }: { rows: { id: number; name: string; result: Readiness }[] }) {
  if (!rows.length) return null;
  return (
    <section aria-label="Préparation par matière" className="mt-10 max-w-3xl">
      <h2 className="section-title mb-2">Par matière</h2>
      <ul className="line-list">
        {rows.map(({ id, name, result }) => (
          <li key={id} className="py-2.5">
            <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 font-semibold wrap-break-word">{name}</span>{result.known && <span className="font-semibold tabular-nums">{result.percent} %</span>}</div>
            {result.known && <Progress className="mt-1.5" value={result.percent} aria-label={`${name} : ${result.percent} %`} />}
            {result.detail && <p className="mt-1 text-sm text-muted-foreground">{result.detail}</p>}
          </li>
        ))}
      </ul>
      <FormulaLine />
    </section>
  );
}
