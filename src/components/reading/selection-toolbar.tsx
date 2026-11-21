"use client";

import { Fragment, forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { IconData } from "@/lib/icons";

export type ToolItem = {
  key: string;
  label: string;
  icon?: IconData;
  /** Pastille de couleur à la place d'une icône (surligneur) */
  swatch?: string;
  /** Libellé visible à côté de l'icône */
  text?: string;
  shortcut?: string;
  pressed?: boolean;
  onClick: () => void;
};

/**
 * La bulle qui suit une sélection : la même à la lecture (annoter) et dans l'éditeur (mettre en forme).
 * Cibles de 32 px à la souris, 44 px au doigt. Elle ne prend jamais le focus : la sélection reste.
 */
export const SelectionToolbar = forwardRef<HTMLDivElement, { label: string; groups: ToolItem[][]; coarse?: boolean; className?: string; style?: CSSProperties; extra?: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, "style">>(
  function SelectionToolbar({ label, groups, coarse, className, style, extra, ...rest }, ref) {
    const visible = groups.filter((g) => g.length);
    return (
      <div ref={ref} role="toolbar" aria-label={label} data-selection-menu onMouseDown={(event) => event.preventDefault()} style={style}
        className={cn("flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg [scrollbar-width:none]",
          "origin-(--transform-origin) animate-in fade-in-0 duration-150 motion-ok:zoom-in-95", className)} {...rest}>
        {visible.map((group, index) => (
          <Fragment key={group[0].key}>
            {index > 0 && <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />}
            {group.map((item) => <Tool key={item.key} item={item} coarse={coarse} />)}
          </Fragment>
        ))}
        {extra}
      </div>
    );
  },
);

function Tool({ item, coarse }: { item: ToolItem; coarse?: boolean }) {
  const button = (
    <button type="button" aria-label={item.label} aria-pressed={item.pressed} onClick={item.onClick}
      className={cn("flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm transition-colors duration-(--dur-instant) hover-ok:bg-muted",
        coarse ? "min-h-11 min-w-11" : "min-h-8 min-w-8", item.text && "px-2 font-semibold", item.pressed && "bg-brand-tint text-brand-text hover-ok:bg-brand-tint")}>
      {item.swatch
        ? <span aria-hidden="true" className={cn("size-4 rounded-full", item.swatch, item.pressed && "ring-2 ring-foreground/70 ring-offset-1 ring-offset-popover")} />
        : item.icon && <Icon icon={item.icon} size={16} strokeWidth={2} />}
      {item.text}
    </button>
  );
  if (coarse) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="top" className="flex items-center gap-1.5">{item.label}{item.shortcut && <Kbd>{item.shortcut}</Kbd>}</TooltipContent>
    </Tooltip>
  );
}
