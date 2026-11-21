import { ConfirmForm } from "@/components/action-form";
import { Submit } from "@/components/submit";
import type { StepUpRequired } from "@/lib/step-up";

export function Act({ id, action, label, variant = "ghost", confirm, role }: {
  id: string; action: (form: FormData) => Promise<StepUpRequired | void>; label: string;
  variant?: "default" | "outline" | "ghost" | "destructive"; confirm?: string; role?: string;
}) {
  return (
    <ConfirmForm action={action} confirm={confirm}>
      <input type="hidden" name="id" value={id} />
      {role && <input type="hidden" name="role" value={role} />}
      <Submit size="sm" variant={variant}>{label}</Submit>
    </ConfirmForm>
  );
}
