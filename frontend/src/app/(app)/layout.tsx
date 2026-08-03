"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const ROLE_LABEL: Record<string, string> = {
  ciso: "CISO",
  auditor: "Auditor",
  viewer: "Viewer",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { profile, loading, errorCode } = useProfile();

  useEffect(() => {
    if (errorCode === "PROFILE_NOT_FOUND") {
      router.replace("/onboarding");
    }
  }, [errorCode, router]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            Aegis CyberAudit
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <LayoutDashboard className="size-4" aria-hidden />
              Dashboard
            </Link>

            {loading ? (
              <Skeleton className="h-5 w-24" />
            ) : profile ? (
              <span className="text-sm text-muted-foreground">{ROLE_LABEL[profile.role] ?? profile.role}</span>
            ) : null}

            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="size-4" aria-hidden />
              Salir
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
