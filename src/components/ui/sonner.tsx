"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { Icon } from "@/components/icon"
import { IconError, IconInfo, IconSuccess, IconWarning } from "@/lib/icons"
import { Spinner } from "@/components/ui/spinner"

/** Couleurs prises dans les tokens : le thème suit la page, sans next-themes. Au-dessus de la barre d'onglets au téléphone. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      offset={{ bottom: "calc(var(--bottom-offset) + 1rem)", right: "1rem" }}
      mobileOffset={{ bottom: "calc(var(--bottom-offset) + 0.5rem)", left: "0.75rem", right: "0.75rem" }}
      gap={8}
      icons={{
        success: <Icon icon={IconSuccess} size={20} className="text-success" />,
        info: <Icon icon={IconInfo} size={20} className="text-info" />,
        warning: <Icon icon={IconWarning} size={20} className="text-warning" />,
        error: <Icon icon={IconError} size={20} className="text-destructive" />,
        loading: <Spinner />,
      }}
      style={{
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "transparent",
        "--border-radius": "var(--radius-xl)",
        zIndex: "var(--z-toast)",
      } as React.CSSProperties}
      toastOptions={{
        classNames: {
          toast: "!shadow-md !font-sans !text-sm !gap-3 !py-3 !px-4",
          title: "!font-semibold",
          description: "!text-muted-foreground",
          actionButton: "!bg-transparent !text-link !font-semibold !text-sm hover:!underline !px-2 !h-8",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
