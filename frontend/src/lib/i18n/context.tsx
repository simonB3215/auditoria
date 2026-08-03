"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, dictionaries, LOCALES, type Dictionary, type Locale } from "./dictionaries";

const STORAGE_KEY = "aegis-locale";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dict: Dictionary;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (LOCALES as string[]).includes(stored)) return stored as Locale;

  const browserLang = window.navigator.language.slice(0, 2).toLowerCase();
  return (LOCALES as string[]).includes(browserLang) ? (browserLang as Locale) : DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Arranca siempre en DEFAULT_LOCALE para que el primer render del server
  // y el del cliente coincidan (evita mismatch de hidratación); el idioma
  // real (guardado o del navegador) se aplica en el primer efecto.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, dict: dictionaries[locale] }}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n debe usarse dentro de <I18nProvider>");
  return ctx;
}
