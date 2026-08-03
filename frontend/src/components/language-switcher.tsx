"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";

const LABELS: Record<"es" | "en", string> = { es: "ES", en: "EN" };

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const other = locale === "es" ? "en" : "es";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => setLocale(other)}
      aria-label={`Switch to ${LABELS[other]}`}
      title={`${LABELS.es} / ${LABELS.en}`}
    >
      <Languages className="size-4" aria-hidden />
      {LABELS[locale]}
    </Button>
  );
}
