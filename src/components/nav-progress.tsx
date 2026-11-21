"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Fine barre bordeaux pendant une navigation : elle part au clic et s'efface quand la page a changé. */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.("a");
      if (!link || link.target || link.hasAttribute("download") || link.origin !== location.origin) return;
      if (link.pathname.startsWith("/files/") || link.pathname.startsWith("/view/")) return;
      if (link.pathname === location.pathname && link.search === location.search) return;
      setActive(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // La page a changé : la navigation est terminée
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setActive(false), [pathname, search]);

  return <div aria-hidden="true" className={`nav-progress ${active ? "is-active" : ""}`} />;
}
