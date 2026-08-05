"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "destructive";

interface ToastOptions {
  title?: string;
  description: string;
  variant?: ToastVariant;
}

interface ToastItem extends Required<Pick<ToastOptions, "description">> {
  id: string;
  title?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4500;

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: "border-border bg-card text-card-foreground",
  success: "border-[var(--severity-low)]/40 bg-card text-card-foreground",
  destructive: "border-destructive/40 bg-card text-destructive",
};

/**
 * Sistema de toasts propio (no hay ninguna dependencia de terceros en el
 * proyecto para esto — ver a.md, "Desplegar notificaciones flotantes").
 * Montado una sola vez en el layout raíz para estar disponible en toda la
 * app, no solo en /admin.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function toast({ title, description, variant = "default" }: ToastOptions) {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, title, description, variant }]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-lg border p-3 text-sm shadow-lg",
              VARIANT_STYLES[t.variant]
            )}
          >
            {t.variant === "success" && (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--severity-low)]" aria-hidden />
            )}
            {t.variant === "destructive" && <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />}
            <div className="min-w-0 flex-1">
              {t.title && <p className="font-medium">{t.title}</p>}
              <p className="text-muted-foreground">{t.description}</p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
