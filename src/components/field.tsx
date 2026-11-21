import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { Textarea } from "@/components/ui/textarea";

const control = "h-9 bg-card px-3 text-[0.9375rem] transition-[border-color,box-shadow] duration-150 focus-visible:border-ring";

export function Field({ label, hint, name, id, className, type, ...props }: ComponentProps<typeof Input> & { label: string; hint?: ReactNode; name: string }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id ?? name} className="text-[0.95rem]">{label}{hint && <span className="font-normal text-muted-foreground">{hint}</span>}</Label>
      {type === "password"
        ? <PasswordInput id={id ?? name} name={name} className={`${control} ${className ?? ""}`} {...props} />
        : <Input id={id ?? name} name={name} type={type} className={`${control} ${className ?? ""}`} {...props} />}
    </div>
  );
}

export function TextField({ label, hint, name, className, ...props }: ComponentProps<typeof Textarea> & { label: string; hint?: ReactNode; name: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.id ?? name} className="text-[0.95rem]">{label}{hint && <span className="font-normal text-muted-foreground">{hint}</span>}</Label>
      <Textarea id={name} name={name} className={`bg-card px-3 py-2 text-base transition-[border-color,box-shadow] duration-150 focus-visible:border-ring ${className ?? ""}`} {...props} />
    </div>
  );
}

export const selectClass = "native h-9 w-full rounded-[var(--radius)] border border-input bg-card px-2.5 text-base outline-none sm:text-[0.95rem] transition-colors duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";
