import { z } from "zod";
import { settingsSectionKeys } from "./settings.types.js";

const optionalUrl = z.string().trim().max(1000).optional().or(z.literal(""));
const color = z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "La couleur doit être au format #RRGGBB.");
const time = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "L’heure doit être au format HH:mm.");
const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const institutionSchema = z.object({
  legalName: nonEmptyText(240), shortName: nonEmptyText(120), acronym: nonEmptyText(30),
  supervisoryAuthority: optionalText(240), country: nonEmptyText(120), motto: nonEmptyText(160),
  address: nonEmptyText(300), city: nonEmptyText(120), phone: nonEmptyText(80),
  email: z.string().trim().email().max(180), website: optionalUrl,
  registrationNumber: optionalText(120), directorGeneralName: optionalText(180), hrManagerName: optionalText(180),
});

const brandingSchema = z.object({
  appName: nonEmptyText(120), primaryColor: color, secondaryColor: color, accentColor: color, dangerColor: color,
  logoUrl: optionalUrl, compactLogoUrl: optionalUrl, printLogoUrl: optionalUrl, faviconUrl: optionalUrl,
  loginBackgroundUrl: optionalUrl, flagUrl: optionalUrl, countryWordmarkUrl: optionalUrl,
  whiteLabelEnabled: z.boolean(), showVendorSignature: z.boolean(),
  documentHeaderStyle: z.enum(["CLASSIC", "MINIMAL", "PREMIUM"]),
  documentFooterStyle: z.enum(["CLASSIC", "MINIMAL", "PREMIUM"]),
});

const organizationSchema = z.object({
  multiSiteEnabled: z.boolean(), allowDirectionOverrides: z.boolean(), allowServiceOverrides: z.boolean(),
  requireManagerForDirection: z.boolean(), requireManagerForService: z.boolean(), allowInterimManagers: z.boolean(),
});

const holidaySchema = z.object({
  date: z.string().trim().refine((value) => !Number.isNaN(new Date(value).getTime()), "Date invalide."),
  label: nonEmptyText(120), recurring: z.boolean(),
});

const attendanceSchema = z.object({
  timezone: nonEmptyText(80), workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  checkInTime: time, checkOutTime: time, lateToleranceMinutes: z.number().int().min(0).max(240),
  earlyDepartureToleranceMinutes: z.number().int().min(0).max(240), minimumDailyMinutes: z.number().int().min(60).max(1440),
  overtimeEnabled: z.boolean(), overtimeThresholdMinutes: z.number().int().min(0).max(600),
  allowManualAttendance: z.boolean(), allowAgentCorrectionRequest: z.boolean(), requireCorrectionReason: z.boolean(),
  holidays: z.array(holidaySchema).max(200),
});

const leaveTypeSchema = z.object({
  code: nonEmptyText(80).regex(/^[A-Z0-9_]+$/), label: nonEmptyText(160), enabled: z.boolean(),
  annualEntitlementDays: z.number().min(0).max(365), paid: z.boolean(), requiresSupportingDocument: z.boolean(),
  managerApprovalRequired: z.boolean(), hrApprovalRequired: z.boolean(),
});

const leaveSchema = z.object({
  annualEntitlementDays: z.number().min(0).max(365), carryOverEnabled: z.boolean(), carryOverLimitDays: z.number().min(0).max(365),
  allowNegativeBalance: z.boolean(), countWeekends: z.boolean(), countHolidays: z.boolean(),
  minimumNoticeDays: z.number().int().min(0).max(365), supportingDocumentAfterDays: z.number().min(0).max(365),
  managerApprovalRequired: z.boolean(), hrApprovalRequired: z.boolean(), requireReplacement: z.boolean(),
  types: z.array(leaveTypeSchema).min(1).max(40),
});

const tasksSchema = z.object({
  defaultDueDays: z.number().int().min(0).max(365), reminderHoursBeforeDue: z.number().int().min(0).max(8760),
  escalationHoursAfterDue: z.number().int().min(0).max(8760), requireCompletionEvidence: z.boolean(),
  requireManagerClosure: z.boolean(), allowAgentReassignment: z.boolean(), archiveAfterDays: z.number().int().min(0).max(3650),
});

const roadmapsSchema = z.object({
  planningYearStartMonth: z.number().int().min(1).max(12), maxObjectives: z.number().int().min(1).max(100),
  requireSmartObjectives: z.boolean(), requireKpiEvidence: z.boolean(), quarterlyReviewEnabled: z.boolean(),
  managerApprovalRequired: z.boolean(), hrApprovalRequired: z.boolean(), totalWeightRequired: z.number().min(1).max(100),
});

const evaluationCriterionSchema = z.object({
  key: nonEmptyText(100).regex(/^[A-Z0-9_]+$/), label: nonEmptyText(180), description: nonEmptyText(1000),
  weight: z.number().min(0).max(100), enabled: z.boolean(),
});

const evaluationsSchema = z.object({
  frequency: z.enum(["ANNUAL", "SEMIANNUAL", "QUARTERLY"]), selfReviewEnabled: z.boolean(),
  managerReviewEnabled: z.boolean(), hrValidationRequired: z.boolean(), agentCanViewFinalResult: z.boolean(),
  excellentThreshold: z.number().min(0).max(100), veryGoodThreshold: z.number().min(0).max(100),
  satisfactoryThreshold: z.number().min(0).max(100), improvementThreshold: z.number().min(0).max(100),
  criteria: z.array(evaluationCriterionSchema).min(1).max(30), signatories: z.array(nonEmptyText(180)).min(1).max(10),
}).superRefine((value, context) => {
  const enabledWeight = value.criteria.filter((criterion) => criterion.enabled).reduce((sum, criterion) => sum + criterion.weight, 0);
  if (Math.abs(enabledWeight - 100) > 0.001) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["criteria"], message: `La pondération des critères actifs doit totaliser 100 % (actuellement ${enabledWeight} %).` });
  }
  if (!(value.excellentThreshold > value.veryGoodThreshold && value.veryGoodThreshold > value.satisfactoryThreshold && value.satisfactoryThreshold > value.improvementThreshold)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["excellentThreshold"], message: "Les seuils doivent être strictement décroissants." });
  }
});

const reportsSchema = z.object({
  monthlyEnabled: z.boolean(), semiannualEnabled: z.boolean(), annualEnabled: z.boolean(),
  monthlyClosingDay: z.number().int().min(1).max(28), firstSemesterEndMonth: z.number().int().min(1).max(12),
  annualClosingMonth: z.number().int().min(1).max(12), requireDirectionValidation: z.boolean(), requireHrValidation: z.boolean(),
  archiveAfterValidation: z.boolean(), includeUnitComparison: z.boolean(), includeExecutiveSummary: z.boolean(),
  includeMethodologyWarnings: z.boolean(), defaultRecipients: z.array(nonEmptyText(180)).max(20), signatories: z.array(nonEmptyText(180)).min(1).max(10),
});

const documentsSchema = z.object({
  maximumFileSizeMb: z.number().min(1).max(100), allowedMimeTypes: z.array(nonEmptyText(180)).min(1).max(100),
  retentionYears: z.number().int().min(1).max(100), confidentialLabel: nonEmptyText(500),
  watermarkEnabled: z.boolean(), footerText: nonEmptyText(500),
});

const notificationsSchema = z.object({
  enabled: z.boolean(), inAppEnabled: z.boolean(), emailEnabled: z.boolean(), smsEnabled: z.boolean(), whatsappEnabled: z.boolean(),
  taskReminderEnabled: z.boolean(), overdueEscalationEnabled: z.boolean(), leavePendingReminderEnabled: z.boolean(),
  attendanceMissingReminderEnabled: z.boolean(), documentExpiryReminderDays: z.array(z.number().int().min(1).max(3650)).max(20),
  reportPreparationReminderDays: z.number().int().min(0).max(365),
});

const securitySchema = z.object({
  sessionDurationMinutes: z.number().int().min(15).max(43200), maxLoginAttempts: z.number().int().min(1).max(50),
  lockoutMinutes: z.number().int().min(1).max(10080), minimumPasswordLength: z.number().int().min(8).max(128),
  requireUppercase: z.boolean(), requireLowercase: z.boolean(), requireNumber: z.boolean(), requireSymbol: z.boolean(),
  passwordExpiryDays: z.number().int().min(0).max(3650), requireRecentPasswordForSensitiveActions: z.boolean(),
  revokeSessionsOnPasswordChange: z.boolean(),
});

const pattern = nonEmptyText(200).refine((value) => value.includes("{SEQ"), "Le modèle doit contenir une séquence {SEQ:n}.");
const numberingSchema = z.object({
  resetSequenceEachYear: z.boolean(), evaluationPattern: pattern, monthlyReportPattern: pattern,
  semiannualReportPattern: pattern, annualReportPattern: pattern, agentPattern: pattern,
});

const featureFlagsSchema = z.object({
  agents: z.boolean(), attendance: z.boolean(), leave: z.boolean(), tasks: z.boolean(), roadmaps: z.boolean(),
  evaluations: z.boolean(), reports: z.boolean(), documents: z.boolean(), payroll: z.boolean(), recruitment: z.boolean(), training: z.boolean(),
});

export const settingsSectionSchemas = {
  institution: institutionSchema,
  branding: brandingSchema,
  organization: organizationSchema,
  attendance: attendanceSchema,
  leave: leaveSchema,
  tasks: tasksSchema,
  roadmaps: roadmapsSchema,
  evaluations: evaluationsSchema,
  reports: reportsSchema,
  documents: documentsSchema,
  notifications: notificationsSchema,
  security: securitySchema,
  numbering: numberingSchema,
  featureFlags: featureFlagsSchema,
} as const;

export const tenantSettingsPayloadSchema = z.object(settingsSectionSchemas);
export const settingsSectionParamsSchema = z.object({ section: z.enum(settingsSectionKeys) });
export const settingsVersionParamsSchema = z.object({ version: z.coerce.number().int().min(1) });
export const saveSettingsSectionSchema = z.object({ value: z.unknown() });
export const publishSettingsSchema = z.object({ reason: z.string().trim().min(5).max(1000) });
export const listSettingsHistoryQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
