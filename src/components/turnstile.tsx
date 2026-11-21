"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = { render: (el: HTMLElement, options: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
    // Inséré par un script de la page (nonce) : autorisé par 'strict-dynamic'
    const script = existing ?? Object.assign(document.createElement("script"), { src: SCRIPT_URL, async: true });
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("turnstile")), { once: true });
    if (!existing) document.head.appendChild(script);
  });
}

/** Captcha Cloudflare Turnstile : remplit le champ « cf-turnstile-response » du formulaire, et repart après chaque envoi (jeton à usage unique). */
export function Turnstile({ siteKey }: { siteKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widget: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const form = box.current?.closest("form");
    const onSubmit = () => { timer = setTimeout(() => { if (widget && window.turnstile) window.turnstile.reset(widget); }, 2000); };
    form?.addEventListener("submit", onSubmit);
    loadScript().then(() => {
      if (box.current && window.turnstile && !widget) widget = window.turnstile.render(box.current, { sitekey: siteKey, language: "fr", "response-field-name": "cf-turnstile-response" });
    }).catch(() => undefined);
    return () => {
      form?.removeEventListener("submit", onSubmit);
      clearTimeout(timer);
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, [siteKey]);
  return <div ref={box} className="min-h-[65px]" />;
}
