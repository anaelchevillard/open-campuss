import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "cn"

const badgeVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center w-fit border border-transparent font-semibold whitespace-nowrap outline-none transition-shadow",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-3",
  ],
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        outline: "border-border bg-transparent dark:bg-muted/40",
        secondary: "bg-secondary text-secondary-foreground",
        info: "bg-info text-white dark:text-background",
        success: "bg-success text-white dark:text-background",
        warning: "bg-warning text-white dark:text-background",
        destructive: "bg-destructive text-white dark:text-background",
        focus: "bg-focus text-focus-foreground",
        invert: "bg-invert text-invert-foreground",
        "primary-light":
          "border-transparent bg-brand-tint text-brand-text",
        "warning-light":
          "border-warning/20 bg-warning-tint text-warning-foreground dark:border-warning/25",
        "success-light":
          "border-success/20 bg-success-tint text-success-foreground dark:border-success/25",
        "info-light":
          "border-info/20 bg-info-tint text-info-foreground dark:border-info/25",
        "destructive-light":
          "border-destructive/20 bg-destructive-tint text-destructive-foreground dark:border-destructive/25",
        "invert-light":
          "border-invert/15 bg-invert/10 text-foreground dark:border-invert/45 dark:bg-invert/35 dark:text-invert-foreground",
        "focus-light":
          "border-focus/15 bg-focus/10 text-focus-foreground dark:border-focus/25 dark:bg-focus/15 dark:text-focus",
        "primary-outline":
          "bg-background border-border text-brand-text",
        "warning-outline":
          "bg-background border-border text-warning-foreground dark:bg-muted/40",
        "success-outline":
          "bg-background border-border text-success-foreground dark:bg-muted/40",
        "info-outline":
          "bg-background border-border text-info-foreground dark:bg-muted/40",
        "destructive-outline":
          "bg-background border-border text-destructive-foreground dark:bg-muted/40",
        "invert-outline":
          "bg-background border-border text-invert-foreground dark:bg-muted/40",
        "focus-outline":
          "bg-background border-border text-focus-foreground dark:bg-muted/40",
      },
      size: {
        xs: "px-1 py-0.25 text-[0.6rem] leading-none h-4 min-w-4 gap-1",
        sm: "px-1 py-0.25 text-[0.625rem] leading-none h-4.5 min-w-4.5 gap-1",
        default: "px-1.25 py-0.5 text-xs h-5 min-w-5 gap-1",
        lg: "px-1.5 py-0.5 text-xs h-5.5 min-w-5.5 gap-1",
        xl: "px-2 py-0.75 text-sm h-6 min-w-6 gap-1.5",
      },
      /** `default`: active style radius. `full`: pill radius. */
      radius: {
        default:
          "rounded-sm",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      radius: "default",
    },
  }
)

interface BadgeProps extends useRender.ComponentProps<"span"> {
  variant?: VariantProps<typeof badgeVariants>["variant"]
  size?: VariantProps<typeof badgeVariants>["size"]
  radius?: VariantProps<typeof badgeVariants>["radius"]
}

function Badge({
  className,
  variant,
  size,
  radius,
  render,
  ...props
}: BadgeProps) {
  const defaultProps = {
    "data-slot": "badge",
    className: cn(badgeVariants({ variant, size, radius, className })),
  }

  return useRender({
    defaultTagName: "span",
    render,
    props: mergeProps<"span">(defaultProps, props),
  })
}

export { Badge, badgeVariants, type BadgeProps }