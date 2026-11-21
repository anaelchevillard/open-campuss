import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { IconSaving } from "@/lib/icons"

function Spinner({ className, ...props }: Omit<React.ComponentProps<"svg">, "ref" | "strokeWidth">) {
  return (
    <HugeiconsIcon icon={IconSaving} strokeWidth={2} data-slot="spinner" role="status" aria-label="Chargement" className={cn("size-4 animate-spin motion-reduce:animate-[spin_1.5s_linear_infinite]", className)} {...props} />
  )
}

export { Spinner }
