export type UserRole = "ciso" | "auditor" | "viewer";

export interface AuthenticatedProfile {
  id: string; // = auth.uid()
  organizationId: string;
  role: UserRole;
  accessToken: string;
}

declare global {
  namespace Express {
    interface Request {
      profile?: AuthenticatedProfile;
    }
  }
}
