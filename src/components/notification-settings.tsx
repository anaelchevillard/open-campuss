"use client";

import { useEffect, useId, useState } from "react";
import { saveNotificationMail, saveWeeklyMail } from "@/app/actions/notifications";
import { useDraft } from "@/components/profile/settings/autosave";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { installGuide } from "@/lib/install-hint";

type PushState = "loading" | "unsupported" | "install-first" | "denied" | "off" | "on" | "error";

function keyBytes(key: string) {
  const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "="));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const sendToServer = (method: "POST" | "DELETE", body: unknown) => fetch("/api/account/push", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function Row({ id, label, help, checked, disabled, onChange }: { id: string; label: string; help?: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 fine:min-h-9">
      <div className="min-w-0"><Label htmlFor={id}>{label}</Label>{help && <p className="mt-0.5 text-sm text-muted-foreground">{help}</p>}</div>
      <Switch id={id} aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function PushRow({ pushKey }: { pushKey: string }) {
  const id = useId();
  const [state, setState] = useState<PushState>("loading");
  useEffect(() => {
    let live = true;
    const settle = (next: PushState) => { if (live) setState(next); };
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        const ios = installGuide({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, hasPrompt: false }) === "ios";
        return settle(ios ? "install-first" : "unsupported");
      }
      if (Notification.permission === "denied") return settle("denied");
      const worker = await navigator.serviceWorker.ready;
      const subscription = await worker.pushManager.getSubscription();
      // Le serveur a pu oublier cet appareil après une panne du service : aucune demande de permission ici, elle est déjà donnée
      if (subscription) await sendToServer("POST", subscription.toJSON()).catch(() => undefined);
      settle(subscription ? "on" : "off");
    })().catch(() => settle("error"));
    return () => { live = false; };
  }, []);

  // La permission n'est demandée qu'ici, sur ce geste
  const toggle = async (wanted: boolean) => {
    setState("loading");
    try {
      const worker = await navigator.serviceWorker.ready;
      if (wanted) {
        if (await Notification.requestPermission() !== "granted") return setState(Notification.permission === "denied" ? "denied" : "off");
        const subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) });
        const response = await sendToServer("POST", subscription.toJSON());
        if (!response.ok) { await subscription.unsubscribe(); throw new Error("refusé"); }
        setState("on");
      } else {
        const subscription = await worker.pushManager.getSubscription();
        if (subscription) {
          await sendToServer("DELETE", { endpoint: subscription.endpoint }).catch(() => undefined);
          await subscription.unsubscribe();
        }
        setState("off");
      }
    } catch {
      setState("error");
    }
  };

  if (state === "unsupported") return <p className="text-sm text-muted-foreground">Ce navigateur ne reçoit pas de notifications.</p>;
  if (state === "install-first") return <p className="text-sm text-muted-foreground">Sur iPhone, les notifications arrivent seulement une fois Campuss sur l’écran d’accueil : dans Safari, touche Partager, puis Sur l’écran d’accueil, et rouvre cette page depuis l’icône.</p>;
  if (state === "denied") return <p className="text-sm text-muted-foreground">Les notifications sont bloquées pour ce site. Tu peux les rétablir dans les réglages du navigateur.</p>;
  return <Row id={id} label="Notifications sur cet appareil" help={state === "error" ? "Ça n’a pas marché. Réessaie dans un instant." : undefined} checked={state === "on"} disabled={state === "loading"} onChange={(value) => void toggle(value)} />;
}

export function NotificationSettings({ pushKey, weeklyMail, notificationMail }: { pushKey: string | null; weeklyMail: boolean | null; notificationMail: boolean | null }) {
  const id = useId();
  const mailId = useId();
  // Le résumé par mail attend « Enregistrer » ; l'appareil, lui, suit la permission du navigateur tout de suite
  const [weekly, setWeekly] = useDraft("notifications:hebdo", Boolean(weeklyMail), async (value) => { await saveWeeklyMail(value); return { ok: true as const }; });
  const [mail, setMail] = useDraft("notifications:mail", Boolean(notificationMail), async (value) => { await saveNotificationMail(value); return { ok: true as const }; });
  return (
    <div className="grid gap-5">
      {pushKey && <PushRow pushKey={pushKey} />}
      {notificationMail !== null && <Row id={mailId} label="Notifications par mail" help="Invitations et réponses, quand aucun appareil ne les reçoit. Les mails sur ton compte arrivent toujours." checked={mail} onChange={setMail} />}
      {weeklyMail !== null && <Row id={id} label="Résumé de la semaine par mail" help="Le dimanche, et seulement s’il y a quelque chose à dire." checked={weekly} onChange={setWeekly} />}
    </div>
  );
}
