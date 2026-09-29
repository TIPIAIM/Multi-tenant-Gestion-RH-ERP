export type SettingsSectionKey =
  | "institution"
  | "branding"
  | "organization"
  | "attendance"
  | "leave"
  | "tasks"
  | "roadmaps"
  | "evaluations"
  | "reports"
  | "documents"
  | "notifications"
  | "security"
  | "numbering"
  | "featureFlags";

export type InstitutionSettings = {
  legalName: string; shortName: string; acronym: string; supervisoryAuthority?: string;
  country: string; motto: string; address: string; city: string; phone: string;
  email: string; website?: string; registrationNumber?: string;
  directorGeneralName?: string; hrManagerName?: string;
};

export type BrandingSettings = {
  appName: string; primaryColor: string; secondaryColor: string; accentColor: string; dangerColor: string;
  logoUrl?: string; compactLogoUrl?: string; printLogoUrl?: string; faviconUrl?: string;
  loginBackgroundUrl?: string; flagUrl?: string; countryWordmarkUrl?: string;
  whiteLabelEnabled: boolean; showVendorSignature: boolean;
  documentHeaderStyle: "CLASSIC" | "MINIMAL" | "PREMIUM";
  documentFooterStyle: "CLASSIC" | "MINIMAL" | "PREMIUM";
};

export type OrganizationSettings = {
  multiSiteEnabled: boolean; allowDirectionOverrides: boolean; allowServiceOverrides: boolean;
  requireManagerForDirection: boolean; requireManagerForService: boolean; allowInterimManagers: boolean;
};

export type HolidaySetting = { date: string; label: string; recurring: boolean };
export type AttendanceSettings = {
  timezone: string; workingDays: number[]; checkInTime: string; checkOutTime: string;
  lateToleranceMinutes: number; earlyDepartureToleranceMinutes: number; minimumDailyMinutes: number;
  overtimeEnabled: boolean; overtimeThresholdMinutes: number; allowManualAttendance: boolean;
  allowAgentCorrectionRequest: boolean; requireCorrectionReason: boolean; holidays: HolidaySetting[];
};

export type LeaveTypeSetting = {
  code: string; label: string; enabled: boolean; annualEntitlementDays: number; paid: boolean;
  requiresSupportingDocument: boolean; managerApprovalRequired: boolean; hrApprovalRequired: boolean;
};
export type LeaveSettings = {
  annualEntitlementDays: number; carryOverEnabled: boolean; carryOverLimitDays: number;
  allowNegativeBalance: boolean; countWeekends: boolean; countHolidays: boolean;
  minimumNoticeDays: number; supportingDocumentAfterDays: number; managerApprovalRequired: boolean;
  hrApprovalRequired: boolean; requireReplacement: boolean; types: LeaveTypeSetting[];
};

export type TaskSettings = {
  defaultDueDays: number; reminderHoursBeforeDue: number; escalationHoursAfterDue: number;
  requireCompletionEvidence: boolean; requireManagerClosure: boolean; allowAgentReassignment: boolean;
  archiveAfterDays: number;
};

export type RoadmapSettings = {
  planningYearStartMonth: number; maxObjectives: number; requireSmartObjectives: boolean;
  requireKpiEvidence: boolean; quarterlyReviewEnabled: boolean; managerApprovalRequired: boolean;
  hrApprovalRequired: boolean; totalWeightRequired: number;
};

export type EvaluationCriterionSetting = {
  key: string; label: string; description: string; weight: number; enabled: boolean;
};
export type EvaluationSettings = {
  frequency: "ANNUAL" | "SEMIANNUAL" | "QUARTERLY"; selfReviewEnabled: boolean;
  managerReviewEnabled: boolean; hrValidationRequired: boolean; agentCanViewFinalResult: boolean;
  excellentThreshold: number; veryGoodThreshold: number; satisfactoryThreshold: number;
  improvementThreshold: number; criteria: EvaluationCriterionSetting[]; signatories: string[];
};

export type ReportSettings = {
  monthlyEnabled: boolean; semiannualEnabled: boolean; annualEnabled: boolean; monthlyClosingDay: number;
  firstSemesterEndMonth: number; annualClosingMonth: number; requireDirectionValidation: boolean;
  requireHrValidation: boolean; archiveAfterValidation: boolean; includeUnitComparison: boolean;
  includeExecutiveSummary: boolean; includeMethodologyWarnings: boolean;
  defaultRecipients: string[]; signatories: string[];
};

export type DocumentSettings = {
  maximumFileSizeMb: number; allowedMimeTypes: string[]; retentionYears: number;
  confidentialLabel: string; watermarkEnabled: boolean; footerText: string;
};

export type NotificationSettings = {
  enabled: boolean; inAppEnabled: boolean; emailEnabled: boolean; smsEnabled: boolean;
  whatsappEnabled: boolean; taskReminderEnabled: boolean; overdueEscalationEnabled: boolean;
  leavePendingReminderEnabled: boolean; attendanceMissingReminderEnabled: boolean;
  documentExpiryReminderDays: number[]; reportPreparationReminderDays: number;
};

export type SecuritySettings = {
  sessionDurationMinutes: number; maxLoginAttempts: number; lockoutMinutes: number;
  minimumPasswordLength: number; requireUppercase: boolean; requireLowercase: boolean;
  requireNumber: boolean; requireSymbol: boolean; passwordExpiryDays: number;
  requireRecentPasswordForSensitiveActions: boolean; revokeSessionsOnPasswordChange: boolean;
};

export type NumberingSettings = {
  resetSequenceEachYear: boolean; evaluationPattern: string; monthlyReportPattern: string;
  semiannualReportPattern: string; annualReportPattern: string; agentPattern: string;
};

export type FeatureFlagSettings = {
  agents: boolean; attendance: boolean; leave: boolean; tasks: boolean; roadmaps: boolean;
  evaluations: boolean; reports: boolean; documents: boolean; payroll: boolean;
  recruitment: boolean; training: boolean;
};

export type TenantSettingsPayload = {
  institution: InstitutionSettings; branding: BrandingSettings; organization: OrganizationSettings;
  attendance: AttendanceSettings; leave: LeaveSettings; tasks: TaskSettings; roadmaps: RoadmapSettings;
  evaluations: EvaluationSettings; reports: ReportSettings; documents: DocumentSettings;
  notifications: NotificationSettings; security: SecuritySettings; numbering: NumberingSettings;
  featureFlags: FeatureFlagSettings;
};

export type SettingsMaturity = {
  score: number; level: "CRITICAL" | "TO_COMPLETE" | "GOOD" | "EXCELLENT";
  completedSections: number; totalSections: number; issues: string[];
};

export type SettingsRecordResponse = {
  active: TenantSettingsPayload; draft: TenantSettingsPayload | null; effective: TenantSettingsPayload;
  hasDraft: boolean; activeVersion: number; draftBaseVersion: number | null;
  draftUpdatedByName: string | null; draftUpdatedAt: string | null;
  publishedByName: string | null; publishedAt: string | null; maturity: SettingsMaturity;
};

export type SettingsDiffItem = {
  path: string; section: SettingsSectionKey; previousValue: unknown; nextValue: unknown;
};
export type SettingsImpact = {
  changedSections: SettingsSectionKey[]; changesCount: number; affectedModules: string[];
  affectedAgents: number; affectedUsers: number; affectedOrganizationUnits: number;
  warnings: string[]; diff: SettingsDiffItem[];
};

export type SettingsRevision = {
  id: string; version: number; reason: string; changedSections: SettingsSectionKey[];
  changeSummary: string[]; publishedByName: string; publishedAt: string; restoredFromVersion?: number;
};
export type SettingsRevisionList = {
  items: SettingsRevision[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type PublicTenantSettings = {
  institution: InstitutionSettings;
  branding: BrandingSettings;
  featureFlags: FeatureFlagSettings;
  documents: Pick<DocumentSettings, "confidentialLabel" | "footerText">;
  activeVersion: number;
};
