export type UserRole = "ciso" | "auditor" | "auditor_guest" | "viewer";

export interface Profile {
  id: string;
  organizationId: string;
  role: UserRole;
  isPlatformAdmin: boolean;
  /** Solo no-null para auditor_guest (Piloto Invitado) o un ex-guest ya degradado a viewer. */
  expiresAt: string | null;
}

export interface InviteLink {
  url: string;
  email: string | null;
  role: "auditor" | "auditor_guest";
  temporaryAccessDays: number | null;
  linkExpiresAt: string;
}

export interface InvitationPreview {
  organizationName: string | null;
  role: "auditor" | "auditor_guest";
  email: string | null;
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
  justification_notes: string | null;
  reviewed_by: string | null;
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

export type CostCategoryKey =
  | "supabase_db"
  | "supabase_storage"
  | "redis_workers"
  | "scan_engine"
  | "pdf_engine"
  | "hosting";

export interface CostSummary {
  totalMonthlyCostClp: number;
  totalMonthlyCostCredits: number;
  averageCostPerAuditClp: number;
  averageCostPerAuditCredits: number;
  topSpendingOrg: { id: string; name: string; costClp: number; costCredits: number } | null;
  byService: { key: CostCategoryKey; costClp: number; costCredits: number; percentage: number }[];
  totals: { storageGb: number; scansExecuted: number; reportsGenerated: number; workerHours: number; mau: number };
}

export interface DailyCostPoint {
  date: string;
  supabase_db: number;
  supabase_storage: number;
  redis_workers: number;
  scan_engine: number;
  pdf_engine: number;
  hosting: number;
  total: number;
  totalCredits: number;
}

export interface OrgCostBreakdown {
  organizationId: string;
  organizationName: string;
  costClp: number;
  costCredits: number;
  auditCount: number;
}

export interface CostBreakdown {
  series: DailyCostPoint[];
  byOrg: OrgCostBreakdown[];
}

export interface AuditCostRow {
  auditId: string;
  auditTitle: string;
  organizationId: string;
  organizationName: string;
  storageMb: number;
  scansExecuted: number;
  reportsGenerated: number;
  dbCostClp: number;
  totalCostClp: number;
  totalCostCredits: number;
  breakdown: Record<CostCategoryKey, number>;
}

export interface PricingConfigRow {
  key: string;
  provider: string;
  service: string;
  unit: string;
  unit_price: number;
  description: string | null;
  updated_at: string;
}

export type AuditLogAction =
  | "EVIDENCE_UPLOADED"
  | "FINDING_STATUS_CHANGED"
  | "REPORT_GENERATED"
  | "USER_ROLE_CHANGED"
  | "ORGANIZATION_SUSPENDED"
  | "ORGANIZATION_REACTIVATED"
  | "ORGANIZATION_DELETED"
  | "RETENTION_POLICY_UPDATED"
  | "EVIDENCE_PURGED";

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: AuditLogAction;
  resource_type: string;
  resource_id: string | null;
  payload_before: Record<string, unknown> | null;
  payload_after: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface PlatformAuditLogEntry extends AuditLogEntry {
  organization_id: string | null;
  organization_name: string | null;
}

export interface RetentionSettings {
  organizationId: string;
  organizationName: string;
  retentionPeriodDays: number | null;
  totalEvidences: number;
  purgedEvidences: number;
  eligibleForPurge: number;
}
