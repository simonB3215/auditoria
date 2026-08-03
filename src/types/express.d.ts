export type UserRole = "ciso" | "auditor" | "viewer";

export interface AuthenticatedProfile {
  id: string; // = auth.uid()
  organizationId: string;
  role: UserRole;
  accessToken: string;
  /** Superadmin de plataforma (ve/administra todas las organizaciones). No es parte del RBAC por-org. */
  isPlatformAdmin: boolean;
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
