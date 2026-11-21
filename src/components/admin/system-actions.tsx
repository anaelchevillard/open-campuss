"use client";

import { retryMails, sendTestMail } from "@/app/actions/admin/reports";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { IconMail, IconRefresh } from "@/lib/icons";

export function SystemActions({ smtp, failed }: { smtp: boolean; failed: number }) {
  const { run, dialog, pending } = useAdminAction();
  return (
    <>
      {failed > 0 && <Button variant="outline" onClick={() => void run(() => retryMails(), { success: "Mails relancés" })}><Icon icon={IconRefresh} size={16} />Relancer</Button>}
      {smtp && <Button variant="outline" pending={pending} onClick={() => void run(() => sendTestMail())}><Icon icon={IconMail} size={16} />M’envoyer un mail de test</Button>}
      {dialog}
    </>
  );
}
