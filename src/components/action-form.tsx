"use client";

import dynamic from "next/dynamic";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { isStepUpRequired, type StepUpMethods, type StepUpRequired } from "@/lib/step-up";
import { Icon } from "@/components/icon";
import { IconDone, IconError } from "@/lib/icons";

export type FormState = { error?: string; ok?: string; stepUp?: StepUpMethods } | null;

// Chargée à la demande : presque aucun visiteur ne l'ouvrira
const StepUpDialog = dynamic(() => import("./step-up-dialog").then((module) => module.StepUpDialog), { ssr: false });

/** Une action refusée faute de preuve fraîche demande le code sur place, puis repart seule une fois confirmée. */
export function useStepUp() {
  const [asked, setAsked] = useState<{ methods: StepUpMethods; retry: () => void } | null>(null);
  const ask = useCallback((methods: StepUpMethods, retry: () => void) => setAsked({ methods, retry }), []);
  const dialog = asked && <StepUpDialog methods={asked.methods} onCancel={() => setAsked(null)} onProof={() => { setAsked(null); asked.retry(); }} />;
  return { ask, dialog };
}

export function Notice({ tone = "ok", children }: { tone?: "ok" | "error" | "info"; children: ReactNode }) {
  const icon = tone === "error" ? IconError : IconDone;
  return (
    <div
      data-slot="alert"
      role={tone === "error" ? "alert" : "status"}
      className={`notice-in flex gap-2.5 rounded-[var(--radius)] border-l-[3px] px-3 py-2.5 text-sm leading-snug ${tone === "error" ? "border-destructive bg-accent text-foreground" : tone === "ok" ? "border-[var(--success)] bg-muted" : "border-border bg-muted"}`}
    >
      {tone !== "info" && <Icon icon={icon} size={16} className={`mt-px ${tone === "error" ? "text-destructive" : "text-[var(--success)]"}`} />}
      <div>{children}</div>
    </div>
  );
}

/** Deux clics plutôt qu'une boîte système : le premier explique, le second confirme, puis ça se réarme seul. */
function useArmed(message?: string) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(timer);
  }, [armed]);
  const guard = (event: FormEvent) => {
    if (!message || armed) return;
    event.preventDefault();
    setArmed(true);
  };
  return { armed, guard };
}

/** React vide le formulaire après chaque action : en cas d'erreur, on rend à l'étudiant ce qu'il avait saisi. */
function restoreFields(form: HTMLFormElement, data: FormData) {
  for (const field of Array.from(form.elements)) {
    if (field instanceof HTMLInputElement) {
      if (field.type === "checkbox" || field.type === "radio") field.checked = data.getAll(field.name).includes(field.value);
      else if (!["hidden", "file", "submit", "button"].includes(field.type) && field.name) field.value = String(data.get(field.name) ?? "");
    } else if ((field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) && field.name) {
      field.value = String(data.get(field.name) ?? "");
    }
  }
}

export function ActionForm({ action, children, className, confirm, hideOnOk }: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  hideOnOk?: boolean;
}) {
  const submitted = useRef<FormData | null>(null);
  const [state, run, pending] = useActionState((previous: FormState, data: FormData) => {
    submitted.current = data;
    return action(previous, data);
  }, null);
  const { armed, guard } = useArmed(confirm);
  const body = useRef<HTMLFormElement>(null);
  const { ask, dialog } = useStepUp();
  useEffect(() => {
    const data = submitted.current;
    if (!state?.stepUp || !data) return;
    if (body.current) restoreFields(body.current, data);
    ask(state.stepUp, () => startTransition(() => run(data)));
  }, [state, ask, run]);
  useEffect(() => {
    if (!state?.error || !body.current) return;
    if (submitted.current) restoreFields(body.current, submitted.current);
    body.current.classList.remove("shake");
    void body.current.offsetWidth; // relance l'animation à chaque nouvelle erreur
    body.current.classList.add("shake");
  }, [state]);
  return (
    <>
      <form ref={body} action={run} className={className ?? "grid gap-4"} onSubmit={guard}>
        {state?.error && <Notice tone="error">{state.error}</Notice>}
        {state?.ok && <Notice>{state.ok}</Notice>}
        {armed && <Notice tone="info">{confirm} Clique une seconde fois pour confirmer.</Notice>}
        {!(hideOnOk && state?.ok) && <fieldset disabled={pending} className="contents">{children}</fieldset>}
      </form>
      {dialog}
    </>
  );
}

export function ConfirmForm({ action, confirm, children, className }: {
  action: (form: FormData) => void | Promise<StepUpRequired | void>;
  confirm?: string;
  children: ReactNode;
  className?: string;
}) {
  const { armed, guard } = useArmed(confirm);
  const { ask, dialog } = useStepUp();
  const [retrying, startRetry] = useTransition();
  const submit = async (data: FormData) => {
    const result = await action(data);
    if (isStepUpRequired(result)) ask(result.stepUp, () => startRetry(() => submit(data)));
  };
  return (
    <>
      <form action={submit} className={className} onSubmit={guard}>
        {armed && <p role="status" className="notice-in mb-1.5 max-w-56 text-sm text-destructive">{confirm} Clique encore pour confirmer.</p>}
        <fieldset disabled={retrying} className="contents">{children}</fieldset>
      </form>
      {dialog}
    </>
  );
}
