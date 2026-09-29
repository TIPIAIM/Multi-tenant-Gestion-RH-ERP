import nodemailer from "nodemailer";
import { Types } from "mongoose";
import { AgentModel } from "./agent.model.js";
import { UserModel } from "../users/user.model.js";
import type { AgentDocument } from "./agent.types.js";

const contractAlertWindowDays = 90;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

type AgentContractAlertResult = {
  checkedAgents: number;
  alertedAgents: number;
  skippedAgents: number;
  failedAgents: number;
  smtpConfigured: boolean;
  details: Array<{
    agentId: string;
    fullName: string;
    employmentEndDate: string;
    daysRemaining: number;
    sentTo: string[];
    status: "SENT" | "SKIPPED" | "FAILED";
    reason?: string;
  }>;
};

type MailTransport = ReturnType<typeof nodemailer.createTransport>;

type UserEmailRow = {
  _id?: Types.ObjectId;
  fullName?: string;
  email?: string;
  role?: string;
  agentId?: Types.ObjectId | string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __fadesAgentContractAlertSchedulerStarted: boolean | undefined;
}

function normalizeEmail(value?: string | null): string | null {
  const cleaned = value?.trim().toLowerCase();

  if (!cleaned) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)
    ? cleaned
    : null;
}

function uniqueEmails(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map(normalizeEmail).filter(Boolean) as string[]),
  );
}

function startOfUtcDay(date = new Date()): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * millisecondsPerDay);
}

function formatDateKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function getDaysRemaining(employmentEndDate: Date, now = new Date()): number {
  const today = startOfUtcDay(now);
  const endDate = startOfUtcDay(employmentEndDate);

  return Math.ceil(
    (endDate.getTime() - today.getTime()) / millisecondsPerDay,
  );
}

function hasAlertAlreadyBeenSent(agent: AgentDocument): boolean {
  if (
    !agent.employmentEndDate ||
    !agent.contractEndAlert90SentAt ||
    !agent.contractEndAlert90ReferenceDate
  ) {
    return false;
  }

  return (
    formatDateKey(agent.contractEndAlert90ReferenceDate) ===
    formatDateKey(agent.employmentEndDate)
  );
}

function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      (process.env.MAIL_FROM || process.env.SMTP_FROM),
  );
}

function getMailTransport(): MailTransport {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure:
      process.env.SMTP_SECURE === "true" ||
      process.env.SMTP_PORT === "465",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });
}

function getMailFrom(): string {
  return (
    process.env.MAIL_FROM ||
    process.env.SMTP_FROM ||
    " <noreply@fades.com>"
  );
}

async function getRhEmails(tenantId: Types.ObjectId): Promise<string[]> {
  const rows = (await (UserModel as any)
    .find({
      tenantId,
      isActive: true,
      role: "RH_MANAGER",
    })
    .select("_id fullName email role")
    .lean()
    .exec()) as UserEmailRow[];

  return uniqueEmails(rows.map((row) => row.email));
}

async function getAgentEmails(input: {
  tenantId: Types.ObjectId;
  agent: AgentDocument;
}): Promise<string[]> {
  const emails: Array<string | null | undefined> = [
    input.agent.email,
  ];

  if (input.agent.userId) {
    const linkedUser = (await (UserModel as any)
      .findOne({
        _id: input.agent.userId,
        tenantId: input.tenantId,
        isActive: true,
      })
      .select("_id fullName email role agentId")
      .lean()
      .exec()) as UserEmailRow | null;

    emails.push(linkedUser?.email);
  }

  const usersLinkedByAgentId = (await (UserModel as any)
    .find({
      tenantId: input.tenantId,
      isActive: true,
      agentId: input.agent._id,
    })
    .select("_id fullName email role agentId")
    .lean()
    .exec()) as UserEmailRow[];

  emails.push(...usersLinkedByAgentId.map((row) => row.email));

  return uniqueEmails(emails);
}

function buildContractAlertSubject(agent: AgentDocument): string {
  return `Alerte fin de contrat dans 3 mois · ${agent.firstName} ${agent.lastName}`;
}

function buildContractAlertText(input: {
  agent: AgentDocument;
  employmentEndDate: string;
  daysRemaining: number;
}): string {
  const fullName = `${input.agent.firstName} ${input.agent.lastName}`.trim();

  return [
    "Bonjour,",
    "",
    " Un contrat arrive à échéance dans les trois prochains mois.",
    "",
    `Agent concerné : ${fullName}`,
    `Matricule : ${input.agent.matricule}`,
    `Poste : ${input.agent.jobTitle}`,
    `Date de fin éventuelle : ${input.employmentEndDate}`,
    `Délai restant estimé : ${input.daysRemaining} jour(s)`,
    "",
    "Merci d’anticiper les diligences RH utiles : renouvellement, avenant, évaluation, sortie administrative ou toute décision appropriée.",
    "",
    "Message automatique.",
  ].join("\n");
}

function buildContractAlertHtml(input: {
  agent: AgentDocument;
  employmentEndDate: string;
  daysRemaining: number;
}): string {
  const fullName = `${input.agent.firstName} ${input.agent.lastName}`.trim();

  return `
    <div style="font-family: Arial, sans-serif; background:#f5faf7; padding:24px;">
      <div style="max-width:680px; margin:auto; background:#ffffff; border:1px solid #d9e7de; border-radius:14px; overflow:hidden;">
        <div style="background:#046242; color:#ffffff; padding:18px 22px;">
          <p style="margin:0; color:#e9b521; font-weight:700; letter-spacing:.08em; font-size:12px;">Plateforme-RH</p>
          <h2 style="margin:8px 0 0; font-size:22px;">Alerte fin de contrat dans 3 mois</h2>
        </div>
        <div style="padding:22px; color:#163442; line-height:1.6;">
          <p>Bonjour,</p>
          <p>Votre plateforme-RH vous informe qu’un contrat arrive à échéance dans les trois prochains mois.</p>
          <table style="width:100%; border-collapse:collapse; margin:18px 0;">
            <tr>
              <td style="padding:9px; border:1px solid #e1ebe5; color:#60777f;">Agent concerné</td>
              <td style="padding:9px; border:1px solid #e1ebe5; font-weight:700;">${fullName}</td>
            </tr>
            <tr>
              <td style="padding:9px; border:1px solid #e1ebe5; color:#60777f;">Matricule</td>
              <td style="padding:9px; border:1px solid #e1ebe5;">${input.agent.matricule}</td>
            </tr>
            <tr>
              <td style="padding:9px; border:1px solid #e1ebe5; color:#60777f;">Poste</td>
              <td style="padding:9px; border:1px solid #e1ebe5;">${input.agent.jobTitle}</td>
            </tr>
            <tr>
              <td style="padding:9px; border:1px solid #e1ebe5; color:#60777f;">Date de fin éventuelle</td>
              <td style="padding:9px; border:1px solid #e1ebe5; font-weight:700; color:#c43f2d;">${input.employmentEndDate}</td>
            </tr>
            <tr>
              <td style="padding:9px; border:1px solid #e1ebe5; color:#60777f;">Délai restant estimé</td>
              <td style="padding:9px; border:1px solid #e1ebe5;">${input.daysRemaining} jour(s)</td>
            </tr>
          </table>
          <p>Merci d’anticiper les diligences RH utiles : renouvellement, avenant, évaluation, sortie administrative ou toute décision appropriée.</p>
          <p style="margin-top:22px; color:#60777f; font-size:13px;">Message automatique de votre plateforme RH.</p>
        </div>
      </div>
    </div>
  `;
}

async function sendContractAlertEmail(input: {
  transport: MailTransport;
  agent: AgentDocument;
  recipients: string[];
  daysRemaining: number;
}): Promise<void> {
  if (!input.agent.employmentEndDate) {
    return;
  }

  const employmentEndDate = formatDateKey(input.agent.employmentEndDate);

  await input.transport.sendMail({
    from: getMailFrom(),
    to: input.recipients.join(", "),
    subject: buildContractAlertSubject(input.agent),
    text: buildContractAlertText({
      agent: input.agent,
      employmentEndDate,
      daysRemaining: input.daysRemaining,
    }),
    html: buildContractAlertHtml({
      agent: input.agent,
      employmentEndDate,
      daysRemaining: input.daysRemaining,
    }),
  });
}

export async function runAgentContractEndAlertsForTenant(input: {
  tenantId: Types.ObjectId | string;
  now?: Date;
}): Promise<AgentContractAlertResult> {
  const tenantId =
    typeof input.tenantId === "string"
      ? new Types.ObjectId(input.tenantId)
      : input.tenantId;

  const now = input.now ?? new Date();
  const today = startOfUtcDay(now);
  const horizon = addDays(today, contractAlertWindowDays);
  const smtpConfigured = isSmtpConfigured();

  const result: AgentContractAlertResult = {
    checkedAgents: 0,
    alertedAgents: 0,
    skippedAgents: 0,
    failedAgents: 0,
    smtpConfigured,
    details: [],
  };

  const agents = await AgentModel.find({
    tenantId,
    employmentStatus: {
      $in: ["ACTIVE", "ON_LEAVE"],
    },
    employmentEndDate: {
      $gte: today,
      $lte: horizon,
    },
  })
    .sort({
      employmentEndDate: 1,
      lastName: 1,
      firstName: 1,
    })
    .limit(500)
    .exec();

  result.checkedAgents = agents.length;

  if (!smtpConfigured) {
    result.skippedAgents = agents.length;
    result.details = agents.map((agent) => ({
      agentId: agent.id,
      fullName: `${agent.firstName} ${agent.lastName}`.trim(),
      employmentEndDate: agent.employmentEndDate
        ? formatDateKey(agent.employmentEndDate)
        : "",
      daysRemaining: agent.employmentEndDate
        ? getDaysRemaining(agent.employmentEndDate, now)
        : 0,
      sentTo: [],
      status: "SKIPPED",
      reason:
        "SMTP non configuré. Définissez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et MAIL_FROM.",
    }));

    return result;
  }

  const transport = getMailTransport();
  const rhEmails = await getRhEmails(tenantId);

  for (const agent of agents) {
    if (!agent.employmentEndDate) {
      continue;
    }

    const fullName = `${agent.firstName} ${agent.lastName}`.trim();
    const employmentEndDate = formatDateKey(agent.employmentEndDate);
    const daysRemaining = getDaysRemaining(agent.employmentEndDate, now);

    if (hasAlertAlreadyBeenSent(agent)) {
      result.skippedAgents += 1;
      result.details.push({
        agentId: agent.id,
        fullName,
        employmentEndDate,
        daysRemaining,
        sentTo: [],
        status: "SKIPPED",
        reason: "Alerte déjà envoyée pour cette date de fin.",
      });

      continue;
    }

    const agentEmails = await getAgentEmails({
      tenantId,
      agent,
    });

    const recipients = uniqueEmails([
      ...rhEmails,
      ...agentEmails,
    ]);

    if (recipients.length === 0) {
      result.skippedAgents += 1;
      result.details.push({
        agentId: agent.id,
        fullName,
        employmentEndDate,
        daysRemaining,
        sentTo: [],
        status: "SKIPPED",
        reason:
          "Aucun email RH ou Agent disponible pour cette alerte.",
      });

      continue;
    }

    try {
      await sendContractAlertEmail({
        transport,
        agent,
        recipients,
        daysRemaining,
      });

      agent.contractEndAlert90SentAt = now;
      agent.contractEndAlert90ReferenceDate =
        agent.employmentEndDate;

      agent.history.push({
        eventType: "OBSERVATION",
        eventDate: now,
        description:
          "Alerte automatique de fin de contrat envoyée à la RH et à l'agent.",
        note: `Échéance : ${employmentEndDate} · Délai restant estimé : ${daysRemaining} jour(s).`,
      });

      await agent.save();

      result.alertedAgents += 1;
      result.details.push({
        agentId: agent.id,
        fullName,
        employmentEndDate,
        daysRemaining,
        sentTo: recipients,
        status: "SENT",
      });
    } catch (error) {
      result.failedAgents += 1;
      result.details.push({
        agentId: agent.id,
        fullName,
        employmentEndDate,
        daysRemaining,
        sentTo: recipients,
        status: "FAILED",
        reason:
          error instanceof Error
            ? error.message
            : "Erreur inconnue lors de l'envoi de l'email.",
      });
    }
  }

  return result;
}

export async function runAgentContractEndAlertsForAllTenants(): Promise<void> {
  if (!isSmtpConfigured()) {
    return;
  }

  const today = startOfUtcDay();
  const horizon = addDays(today, contractAlertWindowDays);

  const tenantIds = (await AgentModel.distinct("tenantId", {
    employmentStatus: {
      $in: ["ACTIVE", "ON_LEAVE"],
    },
    employmentEndDate: {
      $gte: today,
      $lte: horizon,
    },
  }).exec()) as Types.ObjectId[];

  await Promise.all(
    tenantIds.map((tenantId) =>
      runAgentContractEndAlertsForTenant({ tenantId }),
    ),
  );
}

export function startAgentContractEndAlertScheduler(): void {
  if (process.env.AGENT_CONTRACT_ALERT_SCHEDULER === "false") {
    return;
  }

  if (globalThis.__fadesAgentContractAlertSchedulerStarted) {
    return;
  }

  globalThis.__fadesAgentContractAlertSchedulerStarted = true;

  const initialDelayMs = Number(
    process.env.AGENT_CONTRACT_ALERT_INITIAL_DELAY_MS ?? 30_000,
  );

  const intervalMs = Number(
    process.env.AGENT_CONTRACT_ALERT_INTERVAL_MS ?? millisecondsPerDay,
  );

  setTimeout(() => {
    void runAgentContractEndAlertsForAllTenants();
  }, initialDelayMs);

  setInterval(() => {
    void runAgentContractEndAlertsForAllTenants();
  }, intervalMs);
}
