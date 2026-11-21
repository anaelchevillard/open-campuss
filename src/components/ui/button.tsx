import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { Spinner } from "@/components/ui/spinner"

// Hauteurs minimales et non fixes : un libellé plus large (police de lecture, zoom) passe à la ligne au lieu d'être coupé
const variants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-center text-sm leading-tight font-semibold transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-(--dur-instant) ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-ok:active:not-aria-[haspopup]:not-disabled:scale-[.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 coarse:min-h-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border-border bg-card hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-muted/40 dark:hover:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive-tint text-destructive-foreground hover:bg-destructive/15 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:text-destructive",
        // Réservé à la confirmation d'une action destructive
        danger: "bg-danger-solid text-white hover:bg-danger-solid/90 focus-visible:ring-destructive/30",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-9 gap-2 px-3.5 py-1.5",
        xs: "min-h-6 gap-1 rounded-md px-2 py-0.5 text-xs coarse:min-h-8 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-8 gap-1.5 rounded-md px-2.5 py-1",
        lg: "min-h-10 gap-2 px-4 py-2 text-base has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8 coarse:size-11",
        "icon-xs": "size-6 rounded-md coarse:min-h-8 coarse:size-8 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-md coarse:size-10",
        "icon-lg": "size-9 coarse:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Classes d'un bouton, fusionnées (tailwind-merge) : un lien habillé en bouton (<Link className={buttonVariants(…)}>)
 * doit recevoir les mêmes classes que <Button>, sinon « border-transparent » de la base l'emporte sur la bordure d'outline.
 */
function buttonVariants(props?: Parameters<typeof variants>[0]) {
  return cn(variants(props))
}

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof variants> & {
  /** Envoi en cours : le contenu s'efface sous un Spinner, la largeur ne bouge pas. */
  pending?: boolean
}

function Button({
  className,
  variant = "default",
  size = "default",
  pending,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-pending={pending || undefined}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      className={cn(buttonVariants({ variant, size, className }), pending && "disabled:opacity-100")}
      {...props}
    >
      {pending ? <><span className="invisible contents">{children as React.ReactNode}</span><Spinner aria-hidden className="absolute" /></> : children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
