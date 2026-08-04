export type UserRole = "ciso" | "auditor" | "auditor_guest" | "viewer";

export interface AuthenticatedProfile {
  id: string; // = auth.uid()
  organizationId: string;
  role: UserRole;
  accessToken: string;
  /** Superadmin de plataforma (ve/administra todas las organizaciones). No es parte del RBAC por-org. */
  isPlatformAdmin: boolean;
  /** Solo distinto de null para auditor_guest (Piloto Invitado 10 días) o un ex-guest ya degradado a viewer. */
  expiresAt: string | null;
}

declare global {
  namespace Express {
    interface Request {
      profile?: AuthenticatedProfile;
      /** Solo seteado por authenticateTokenOnly (flujo de onboarding, antes de que exista `profiles`). */
      userId?: string;
    }
  }
}
