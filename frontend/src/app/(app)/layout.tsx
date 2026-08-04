"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, Server, ShieldCheck, ShieldUser, Timer, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { profile, loading, errorCode } = useProfile();
  const { dict } = useI18n();
  const t = dict.nav;

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
            {dict.common.appName}
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <LayoutDashboard className="size-4" aria-hidden />
              {t.dashboard}
            </Link>
            <Link
              href="/assets"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <Server className="size-4" aria-hidden />
              {t.assets}
            </Link>
            {(profile?.role === "ciso" || profile?.isPlatformAdmin) && (
              <Link
                href="/settings/retention"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <Timer className="size-4" aria-hidden />
                {t.settings}
              </Link>
            )}
            {profile?.isPlatformAdmin && (
              <Link
                href="/settings/team"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <Users className="size-4" aria-hidden />
                {t.team}
              </Link>
            )}
            {profile?.isPlatformAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ShieldUser className="size-4" aria-hidden />
                {t.admin}
              </Link>
            )}

            {loading ? (
              <Skeleton className="h-5 w-24" />
            ) : profile?.role === "auditor_guest" && profile.expiresAt ? (
              <Badge variant="secondary" className="gap-1.5">
                <Timer className="size-3" aria-hidden />
                {dict.guestPilot.badge}
                {" · "}
                {(() => {
                  const daysLeft = Math.max(
                    0,
                    Math.ceil((new Date(profile.expiresAt).getTime() - Date.now()) / 86_400_000)
                  );
                  return daysLeft <= 1
                    ? dict.guestPilot.lastDay
                    : dict.guestPilot.daysRemaining.replace("{days}", String(daysLeft));
                })()}
              </Badge>
            ) : profile ? (
              <span className="text-sm text-muted-foreground">{t.roles[profile.role]}</span>
            ) : null}

            <LanguageSwitcher />

            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="size-4" aria-hidden />
              {t.logout}
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
