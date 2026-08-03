"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { api, getApiErrorMessage, type ApiErrorBody } from "@/lib/api";
import type { Profile } from "@/lib/types";

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ data: Profile }>("/api/v1/users/me")
      .then((res) => {
        if (!cancelled) setProfile(res.data.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getApiErrorMessage(err, "No se pudo cargar el perfil"));
        if (axios.isAxiosError<ApiErrorBody>(err)) {
          setErrorCode(err.response?.data?.error?.code ?? null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { profile, loading, error, errorCode };
}
