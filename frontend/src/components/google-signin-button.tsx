"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.82-.07-1.42-.22-2.05H12v3.72h6.62c-.13 1.1-.86 2.75-2.47 3.86l-.02.15 3.59 2.78.25.02c2.28-2.1 3.55-5.2 3.55-8.48Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.06 7.93-2.9l-3.78-2.93c-1.01.7-2.38 1.19-4.15 1.19-3.17 0-5.86-2.09-6.82-4.98l-.14.01-3.73 2.88-.05.13C3.24 21.3 7.28 24 12 24Z"
      />
      <path fill="#FBBC05" d="M5.18 14.38A7.35 7.35 0 0 1 4.77 12c0-.83.15-1.63.4-2.38l-.01-.16-3.78-2.94-.12.06A11.94 11.94 0 0 0 0 12c0 1.93.47 3.76 1.26 5.42l3.92-3.04Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c2.25 0 3.77.97 4.64 1.78l3.39-3.31C17.94 1.19 15.24 0 12 0 7.28 0 3.24 2.7 1.26 6.58l3.91 3.04C6.14 6.84 8.83 4.75 12 4.75Z"
      />
    </svg>
  );
}

export function GoogleSignInButton() {
  const { dict } = useI18n();
  const t = dict.auth.google;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (oauthError) {
      setLoading(false);
      setError(oauthError.message);
    }
    // Si no hubo error, el browser navega a Google — no hay más nada que hacer acá.
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={handleClick}>
        <GoogleIcon />
        {loading ? t.redirecting : t.continue}
      </Button>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}
