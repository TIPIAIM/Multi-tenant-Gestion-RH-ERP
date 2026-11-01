import type { HydratedDocument, Types } from "mongoose";

export const settingsSectionKeys = [
  "institution",
  "branding",
  "organization",
  "attendance",
  "leave",
  "tasks",
  "roadmaps",
  "evaluations",
  "reports",
  "documents",
  "notifications",
  "security",
  "numbering",
  "featureFlags",
] as const;

export type SettingsSectionKey = (typeof settingsSectionKeys)[number];
export type SettingsStatus = "ACTIVE" | "DRAFT";
export type ConfigurationMaturityLevel = "CRITICAL" | "TO_COMPLETE" | "GOOD" | "EXCELLENT";

export type InstitutionSettings = {
  legalName: string;
  shortName: string;
  acronym: string;
  supervisoryAuthority?: string;
  country: string;
  motto: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website?: string;
  registrationNumber?: string;
  directorGeneralName?: string;
  hrManagerName?: string;
};

export type BrandingSettings = {
  sidebarBackgroundColor?: string;
  sidebarTextColor?: string;
  sidebarActiveColor?: string;
  pageBackgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  mutedTextColor?: string;
  borderColor?: string;
  topbarBackgroundColor?: string;
  topbarTextColor?: string;

  appName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  dangerColor: string;
  logoUrl?: string;
  compactLogoUrl?: string;
  printLogoUrl?: string;
  faviconUrl?: string;
  loginBackgroundUrl?: string;
  flagUrl?: string;
  countryWordmarkUrl?: string;
  whiteLabelEnabled: boolean;
  showVendorSignature: boolean;
  documentHeaderStyle: "CLASSIC" | "MINIMAL" | "PREMIUM";
  documentFooterStyle: "CLASSIC" | "MINIMAL" | "PREMIUM";
};

export type OrganizationSettings = {
  multiSiteEnabled: boolean;
  allowDirectionOverrides: boolean;
  allowServiceOverrides: boolean;
  requireManagerForDirection: boolean;
  requireManagerForService: boolean;
  allowInterimManagers: boolean;
};

export type HolidaySetting = {
  date: string;
  label: string;
  recurring: boolean;
};

export type AttendanceSettings = {
  timezone: string;
  workingDays: number[];
  checkInTime: string;
  checkOutTime: string;
  lateToleranceMinutes: number;
  earlyDepartureToleranceMinutes: number;
  minimumDailyMinutes: number;
  overtimeEnabled: boolean;
  overtimeThresholdMinutes: number;
  allowManualAttendance: boolean;
  allowAgentCorrectionRequest: boolean;
  requireCorrectionReason: boolean;
  holidays: HolidaySetting[];
};

export type LeaveTypeSetting = {
  code: string;
  label: string;
  enabled: boolean;
  annualEntitlementDays: number;
  paid: boolean;
  requiresSupportingDocument: boolean;
  managerApprovalRequired: boolean;
  hrApprovalRequired: boolean;
};

export type LeaveSettings = {
  annualEntitlementDays: number;
  carryOverEnabled: boolean;
  carryOverLimitDays: number;
  allowNegativeBalance: boolean;
  countWeekends: boolean;
  countHolidays: boolean;
  minimumNoticeDays: number;
  supportingDocumentAfterDays: number;
  managerApprovalRequired: boolean;
  hrApprovalRequired: boolean;
  requireReplacement: boolean;
  types: LeaveTypeSetting[];
};

export type TaskSettings = {
  defaultDueDays: number;
  reminderHoursBeforeDue: number;
  escalationHoursAfterDue: number;
  requireCompletionEvidence: boolean;
  requireManagerClosure: boolean;
  allowAgentReassignment: boolean;
  archiveAfterDays: number;
};

export type RoadmapSettings = {
  planningYearStartMonth: number;
  maxObjectives: number;
  requireSmartObjectives: boolean;
  requireKpiEvidence: boolean;
  quarterlyReviewEnabled: boolean;
  managerApprovalRequired: boolean;
  hrApprovalRequired: boolean;
  totalWeightRequired: number;
};

export type EvaluationCriterionSetting = {
  key: string;
  label: string;
  description: string;
  weight: number;
  enabled: boolean;
};

export type EvaluationSettings = {
  frequency: "ANNUAL" | "SEMIANNUAL" | "QUARTERLY";
  selfReviewEnabled: boolean;
  managerReviewEnabled: boolean;
  hrValidationRequired: boolean;
  agentCanViewFinalResult: boolean;
  excellentThreshold: number;
  veryGoodThreshold: number;
  satisfactoryThreshold: number;
  improvementThreshold: number;
  criteria: EvaluationCriterionSetting[];
  signatories: string[];
};

export type ReportSettings = {
  monthlyEnabled: boolean;
  semiannualEnabled: boolean;
  annualEnabled: boolean;
  monthlyClosingDay: number;
  firstSemesterEndMonth: number;
  annualClosingMonth: number;
  requireDirectionValidation: boolean;
  requireHrValidation: boolean;
  archiveAfterValidation: boolean;
  includeUnitComparison: boolean;
  includeExecutiveSummary: boolean;
  includeMethodologyWarnings: boolean;
  defaultRecipients: string[];
  signatories: string[];
};

export type DocumentSettings = {
  maximumFileSizeMb: number;
  allowedMimeTypes: string[];
  retentionYears: number;
  confidentialLabel: string;
  watermarkEnabled: boolean;
  footerText: string;
};

export type NotificationSettings = {
  enabled: boolean;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  taskReminderEnabled: boolean;
  overdueEscalationEnabled: boolean;
  leavePendingReminderEnabled: boolean;
  attendanceMissingReminderEnabled: boolean;
  documentExpiryReminderDays: number[];
  reportPreparationReminderDays: number;
};

export type SecuritySettings = {
  sessionDurationMinutes: number;
  maxLoginAttempts: number;
  lockoutMinutes: number;
  minimumPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  passwordExpiryDays: number;
  requireRecentPasswordForSensitiveActions: boolean;
  revokeSessionsOnPasswordChange: boolean;
};

export type NumberingSettings = {
  resetSequenceEachYear: boolean;
  evaluationPattern: string;
  monthlyReportPattern: string;
  semiannualReportPattern: string;
  annualReportPattern: string;
  agentPattern: string;
};

export type FeatureFlagSettings = {
  agents: boolean;
  attendance: boolean;
  leave: boolean;
  tasks: boolean;
  roadmaps: boolean;
  evaluations: boolean;
  reports: boolean;
  documents: boolean;
  payroll: boolean;
  recruitment: boolean;
  training: boolean;
};

export type TenantSettingsPayload = {
  institution: InstitutionSettings;
  branding: BrandingSettings;
  organization: OrganizationSettings;
  attendance: AttendanceSettings;
  leave: LeaveSettings;
  tasks: TaskSettings;
  roadmaps: RoadmapSettings;
  evaluations: EvaluationSettings;
  reports: ReportSettings;
  documents: DocumentSettings;
  notifications: NotificationSettings;
  security: SecuritySettings;
  numbering: NumberingSettings;
  featureFlags: FeatureFlagSettings;
};

export type TenantSettingsRecord = {
  editRevision?: number;
  tenantId: Types.ObjectId;
  active: TenantSettingsPayload;
  draft?: TenantSettingsPayload | null;
  activeVersion: number;
  draftBaseVersion?: number | null;
  draftUpdatedByUserId?: Types.ObjectId | null;
  draftUpdatedByName?: string | null;
  draftUpdatedAt?: Date | null;
  publishedByUserId?: Types.ObjectId | null;
  publishedByName?: string | null;
  publishedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TenantSettingsRevision = {
  tenantId: Types.ObjectId;
  version: number;
  snapshot: TenantSettingsPayload;
  reason: string;
  changedSections: SettingsSectionKey[];
  changeSummary: string[];
  publishedByUserId: Types.ObjectId;
  publishedByName: string;
  publishedAt: Date;
  restoredFromVersion?: number;
  createdAt?: Date;
};

export type TenantSettingsDocument = HydratedDocument<TenantSettingsRecord>;
export type TenantSettingsRevisionDocument = HydratedDocument<TenantSettingsRevision>;

export type SettingsActorRole =
  | "TENANT_ADMIN"
  | "DIRECTION"
  | "RH_MANAGER"
  | "SERVICE_MANAGER"
  | "AGENT";

export type SettingsActor = {
  userId: Types.ObjectId;
  fullName: string;
  role: SettingsActorRole;
};

export type SettingsDiffItem = {
  path: string;
  section: SettingsSectionKey;
  previousValue: unknown;
  nextValue: unknown;
};

export type SettingsImpact = {
  changedSections: SettingsSectionKey[];
  changesCount: number;
  affectedModules: string[];
  affectedAgents: number;
  affectedUsers: number;
  affectedOrganizationUnits: number;
  warnings: string[];
  diff: SettingsDiffItem[];
};

export type SettingsMaturity = {
  score: number;
  level: ConfigurationMaturityLevel;
  completedSections: number;
  totalSections: number;
  issues: string[];
};
