import Link from "next/link";
import { Icon } from "@/components/icon";
import { IconChevronRight } from "@/lib/icons";

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        {items.map((item, index) => (
          <li key={item.label + index} className="inline-flex items-center gap-1">
            {index > 0 && <Icon icon={IconChevronRight} className="size-3.5" />}
            {item.href ? <Link className="inline-flex min-h-8 items-center hover:text-foreground hover:underline" href={item.href}>{item.label}</Link> : <span aria-current="page" className="wrap-break-word text-foreground">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
