export type UserRole = "ciso" | "auditor" | "viewer";

export interface Profile {
  id: string;
  organizationId: string;
  role: UserRole;
  isPlatformAdmin: boolean;
}

export type AuditStatus = "draft" | "queued" | "running" | "completed" | "failed";
export type Framework = "iso27001" | "nist_csf" | "gdpr" | "local_dp_law";

export interface Audit {
  id: string;
  title: string;
  framework: Framework;
  status: AuditStatus;
  risk_score: number | null;
  created_at: string;
  updated_at?: string;
}

export type AssetType = "ip" | "cidr" | "domain" | "repository" | "cloud_server";
export type AssetCriticality = "critica" | "alta" | "media" | "baja";
export type AssetVerificationStatus = "pending" | "verified";

export interface Asset {
  id: string;
  type: AssetType;
  value: string;
  criticality: AssetCriticality;
  tags: string[];
  verification_status: AssetVerificationStatus;
  verified_at: string | null;
  created_at: string;
}

export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FindingStatus = "open" | "accepted_risk" | "remediated" | "false_positive";

export interface Finding {
  id: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  cve_id: string | null;
  detail: string | null;
  remediation: string | null;
  source_engine: string;
  detected_at: string;
}

export type EvidenceValidationStatus = "pending" | "valid" | "invalid";

export interface Evidence {
  id: string;
  file_name: string;
  requirement_code: string | null;
  validation_status: EvidenceValidationStatus;
  validation_errors: string[] | null;
  created_at: string;
}

export interface CoverageResult {
  completion_percentage: number;
  missing_requirements: Array<{ code: string; title: string }>;
  covered_requirements: string[];
}

export type EvidenceFileKind = "pdf" | "json" | "xlsx";

export interface ComplianceRequirement {
  code: string;
  title: string;
  expectedFileKind: EvidenceFileKind;
  requiredFields?: string[];
}

export interface EvidenceListResponse {
  evidences: Evidence[];
  completion_percentage: number;
  missing_requirements: Array<{ code: string; title: string }>;
  covered_requirements: string[];
}

export interface EvidenceUploadResponse {
  evidence: Evidence;
  validation_errors: string[];
  completion_percentage: number;
  missing_requirements: Array<{ code: string; title: string }>;
  covered_requirements: string[];
}

export interface RiskScore {
  score: number;
  complianceLevel: "alto" | "medio" | "bajo" | "crítico";
  findingsPenalty: number;
  coveragePenalty: number;
}

export interface AuditReport {
  reportId: string;
  auditId: string;
  signedUrl: string;
  expiresInSeconds: number;
  riskScore: RiskScore;
  coverage: CoverageResult;
}

export interface DashboardSummary {
  totalAssets: number;
  totalAudits: number;
  auditsByStatus: Record<AuditStatus, number>;
  findingsBySeverity: Record<FindingSeverity, number>;
  averageCoveragePercentage: number;
  recentAudits: Audit[];
}

export interface AdminOrganization {
  id: string;
  name: string;
  is_suspended: boolean;
  created_at: string;
  memberCount: number;
  auditCount: number;
  storageBytes: number;
}

export interface AdminMember {
  id: string;
  full_name: string | null;
  role: UserRole;
  is_platform_admin: boolean;
  created_at: string;
}

export interface AdminActivityEvent {
  type: "audit_created" | "asset_created" | "evidence_uploaded";
  label: string;
  createdAt: string;
}
