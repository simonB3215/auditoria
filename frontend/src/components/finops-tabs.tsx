"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";

/**
 * Sub-navegación estilo Tabs entre /admin/costs y /admin/internal-finops
 * (a.md, "Unificar la navegación... bajo una sola pestaña con
 * sub-navegación limpia"). Son dos páginas independientes con estado y
 * fetching propios — se adapta con un switcher visual tipo Tabs que
 * navega entre rutas, en vez de fusionarlas en una sola página con un
 * único árbol de estado.
 */
export function FinOpsTabs() {
  const pathname = usePathname();
  const { dict } = useI18n();
  const t = dict.admin.layout;

  const tabs = [
    { href: "/admin/costs", label: t.navCosts },
    { href: "/admin/internal-finops", label: t.navInternalFinops },
  ];

  return (
    <div className="inline-flex h-8 w-fit items-center gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex h-full items-center rounded-md px-3 text-sm font-medium transition-colors ${
              active ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
