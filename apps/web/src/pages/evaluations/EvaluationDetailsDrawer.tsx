import { useMemo, useState } from "react";
import {
  Award,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Printer,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type {
  Evaluation,
  EvaluationCriterionInput,
  EvaluationDecision,
  EvaluationLeaveType,
  SubmitEvaluationReviewInput,
  ValidateEvaluationHrInput,
} from "../../features/evaluations/evaluation.types";
import "./evaluation-page.css";

type EvaluationDetailsDrawerProps = {
  evaluation: Evaluation;
  currentRole: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmitSelfReview: (input: SubmitEvaluationReviewInput) => Promise<void>;
  onSubmitManagerReview: (input: SubmitEvaluationReviewInput) => Promise<void>;
  onValidateHr: (input: ValidateEvaluationHrInput) => Promise<void>;
  onRecomputeIntelligence?: () => Promise<void>;
  isRecomputing?: boolean;
};

const statusLabels = {
  DRAFT: "Brouillon RH",
  SELF_REVIEWED: "Auto-évaluation renseignée",
  MANAGER_REVIEWED: "Appréciation hiérarchique renseignée",
  HR_VALIDATED: "Validée par la RH",
  ARCHIVED: "Archivée",
} as const;

const gradeLabels = {
  EXCELLENT: "Excellent",
  VERY_GOOD: "Très bon",
  SATISFACTORY: "Satisfaisant",
  NEEDS_IMPROVEMENT: "À améliorer",
  INSUFFICIENT: "Insuffisant",
} as const;

const decisionLabels: Record<EvaluationDecision, string> = {
  CONFIRMATION: "Confirmation dans le poste",
  RENEWAL_RECOMMENDED: "Renouvellement recommandé",
  PROMOTION_RECOMMENDED: "Évolution ou promotion recommandée",
  TRAINING_PLAN: "Plan de formation",
  PERFORMANCE_IMPROVEMENT_PLAN: "Plan d’amélioration de la performance",
  MOBILITY_RECOMMENDED: "Mobilité ou réaffectation recommandée",
  NO_DECISION: "Aucune décision arrêtée",
};

const riskLabels = {
  LOW: "Risque faible",
  MODERATE: "Risque modéré",
  HIGH: "Risque élevé",
  CRITICAL: "Risque critique",
} as const;

const potentialLabels = {
  TO_SUPPORT: "À accompagner",
  EMERGING: "Potentiel émergent",
  SOLID: "Potentiel solide",
  HIGH_POTENTIAL: "Haut potentiel",
} as const;

const confidenceLabels = {
  LOW: "Données limitées",
  MEDIUM: "Données suffisantes",
  HIGH: "Données robustes",
} as const;

const leaveTypeLabels: Record<EvaluationLeaveType, string> = {
  ANNUAL_LEAVE: "Congé annuel",
  SICK_LEAVE: "Congé maladie",
  MATERNITY_LEAVE: "Congé maternité",
  PATERNITY_LEAVE: "Congé paternité",
  SPECIAL_LEAVE: "Congé spécial",
  UNPAID_LEAVE: "Congé sans solde",
  TRAINING_LEAVE: "Congé de formation",
  OTHER: "Autre absence autorisée",
};


const EVALUATION_DOCUMENT_THEME = {
  // Couleurs officielles / documentaires FADES
  primary: "046242",
  navy: "0B2536",
  gold: "E9B521",
  white: "FFFFFF",
  greenSoft: "EEF7F1",
  ink: "173841",
  text: "405E66",
  border: "D7E5DC",

  // Alias de compatibilité : aucune couleur supplémentaire.
  primarySoft: "EEF7F1",
  primarySoft2: "FFFFFF",
  muted: "405E66",
  borderStrong: "D7E5DC",
  goldSoft: "FFFFFF",
  zebra: "EEF7F1",
} as const;


/**
 * Palette dédiée au PDF :
 * volontairement beaucoup plus sobre que l'interface.
 * Le vert sert uniquement de repère institutionnel.
 */
const EVALUATION_PDF_THEME = {
  // Charte FADES — identité
  green: "046242",
  navy: "0B2536",
  gold: "E9B521",

  // Charte documentaire — surfaces et texte
  ink: "173841",
  text: "405E66",
  muted: "6B7F85",
  line: "D7E5DC",
  lineStrong: "B8CEC0",
  soft: "F8FBF9",
  greenSoft: "EEF7F1",
  goldSoft: "FFF9E8",
  white: "FFFFFF",
} as const;

function formatDayCount(value?: number | null): string {
  const days = safeNumber(value, 0);
  return Number.isInteger(days) ? String(days) : days.toFixed(1).replace(".", ",");
}

function formatDate(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function safeNumber(value: unknown, fallback = 0): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function formatMinutes(minutes?: number | null): string {
  const safeMinutes = Math.round(safeNumber(minutes, 0));
  const hours = Math.floor(safeMinutes / 60);
  const remaining = safeMinutes % 60;
  if (!hours) return `${remaining} min`;
  if (!remaining) return `${hours} h`;
  return `${hours} h ${remaining} min`;
}

function normalizeExportText(
  value?: string | null,
): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .replace(/(\d)(\p{L})/gu, "$1 $2")
    .replace(/(\d)\s*%/g, "$1 %")
    .replace(/\s*·\s*/g, " · ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

function safeExportFileName(
  value: string,
): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "evaluation-fades";
}

function collectDocumentStyles(): string {
  const styleChunks: string[] = [];

  for (
    const styleSheet of Array.from(
      document.styleSheets,
    )
  ) {
    try {
      styleChunks.push(
        Array.from(
          styleSheet.cssRules,
        )
          .map((rule) => rule.cssText)
          .join("\n"),
      );
    } catch {
      // Une feuille externe protégée par CORS est simplement ignorée.
    }
  }

  return styleChunks.join("\n");
}

function buildEvaluationTocItems(
  evaluation: Evaluation,
): string[] {
  const items = [
    "Informations générales",
    "Synthèse exécutive",
    "Lecture HRS intelligente",
    "Note d’aide à la décision",
    "Données RH exploitées automatiquement",
    "Congés et absences autorisées",
    "Grille d’appréciation",
  ];

  if (evaluation.evidenceLinks.length > 0) {
    items.push(
      "Liens et éléments probants",
    );
  }

  items.push(
    "Forces, alertes et actions recommandées",
  );

  if (
    evaluation.intelligence.managerTalkingPoints
      .length > 0 ||
    evaluation.intelligence.dataWarnings.length > 0
  ) {
    items.push(
      "Entretien contradictoire et réserves de lecture",
    );
  }

  items.push(
    "Conclusion RH",
    "Signatures",
  );

  return items;
}

function normalizeEvaluationSectionKey(
  value: string,
): string {
  return normalizeExportText(value)
    .replace(/[’']/g, "'")
    .toLocaleLowerCase("fr-FR");
}

function getEvaluationSectionNumber(
  evaluation: Evaluation,
  title: string,
): string {
  const targetKey =
    normalizeEvaluationSectionKey(
      title,
    );

  const index =
    buildEvaluationTocItems(
      evaluation,
    ).findIndex(
      (item) =>
        normalizeEvaluationSectionKey(
          item,
        ) === targetKey,
    );

  return index >= 0
    ? String(index + 1).padStart(
        2,
        "0",
      )
    : "";
}

function getEvaluationSectionLabel(
  evaluation: Evaluation,
  title: string,
): string {
  const number =
    getEvaluationSectionNumber(
      evaluation,
      title,
    );

  return number
    ? `${number}. ${title}`
    : title;
}

function createEvaluationNumberedHeading(
  evaluation: Evaluation,
  title: string,
): HTMLHeadingElement {
  const heading =
    document.createElement("h4");

  heading.className =
    "evaluation-numbered-title evaluation-generated-section-title";

  heading.dataset.evaluationExportSection =
    title;

  heading.innerHTML = `
    <span class="evaluation-section-number">
      ${getEvaluationSectionNumber(
        evaluation,
        title,
      )}
    </span>
    <span class="evaluation-section-title-text">
      ${title}
    </span>
  `;

  return heading;
}

function decorateEvaluationExportSections(
  root: HTMLElement,
  evaluation: Evaluation,
): void {
  const tocItems =
    buildEvaluationTocItems(
      evaluation,
    );

  const resolveCanonicalTitle = (
    rawTitle: string,
  ): string | null => {
    const key =
      normalizeEvaluationSectionKey(
        rawTitle,
      );

    return (
      tocItems.find(
        (item) =>
          normalizeEvaluationSectionKey(
            item,
          ) === key,
      ) ?? null
    );
  };

  // Informations générales : le document écran n'avait pas de titre propre.
  const generalGrid =
    root.querySelector<HTMLElement>(
      ".print-grid",
    );

  if (
    generalGrid &&
    !root.querySelector(
      '[data-evaluation-export-section="Informations générales"]',
    )
  ) {
    generalGrid.before(
      createEvaluationNumberedHeading(
        evaluation,
        "Informations générales",
      ),
    );
  }

  root
    .querySelectorAll<HTMLElement>(
      ".evaluation-print-section",
    )
    .forEach((section) => {
      // La note d'aide à la décision a une structure de heading différente.
      if (
        section.classList.contains(
          "evaluation-executive-brief",
        )
      ) {
        if (
          !section.querySelector(
            '[data-evaluation-export-section="Note d’aide à la décision"]',
          )
        ) {
          section.prepend(
            createEvaluationNumberedHeading(
              evaluation,
              "Note d’aide à la décision",
            ),
          );
        }

        const kicker =
          section.querySelector<HTMLElement>(
            ".evaluation-section-heading > div > span",
          );

        if (kicker) {
          kicker.textContent =
            "SYNTHÈSE DÉCISIONNELLE";
        }

        return;
      }

      const heading =
        section.querySelector<HTMLElement>(
          ":scope > h4",
        );

      if (!heading) {
        return;
      }

      const rawTitle =
        normalizeExportText(
          heading.textContent,
        );

      const canonicalTitle =
        resolveCanonicalTitle(
          rawTitle,
        );

      if (!canonicalTitle) {
        return;
      }

      const number =
        getEvaluationSectionNumber(
          evaluation,
          canonicalTitle,
        );

      heading
        .querySelectorAll("svg")
        .forEach((icon) =>
          icon.remove(),
        );

      heading.classList.add(
        "evaluation-numbered-title",
      );

      heading.innerHTML = `
        <span class="evaluation-section-number">
          ${number}
        </span>
        <span class="evaluation-section-title-text">
          ${canonicalTitle}
        </span>
      `;
    });

  // Signatures : dernier élément du sommaire, sans titre dans la fiche écran.
  const finalPage =
    root.querySelector<HTMLElement>(
      ".evaluation-final-page",
    );

  if (
    finalPage &&
    !finalPage.querySelector(
      '[data-evaluation-export-section="Signatures"]',
    )
  ) {
    finalPage.prepend(
      createEvaluationNumberedHeading(
        evaluation,
        "Signatures",
      ),
    );
  }
}

function createEvaluationExportFrontMatter(
  evaluation: Evaluation,
): DocumentFragment {
  const fragment =
    document.createDocumentFragment();

  const cover =
    document.createElement("section");

  cover.className =
    "evaluation-export-cover";

  const direction =
    evaluation.agentSnapshot.directionName ??
    "Rattachement à régulariser";

  const service =
    evaluation.agentSnapshot.serviceName ??
    "Aucun service précisé";

  cover.innerHTML = `
    <div class="evaluation-export-cover-topline">
      <div>
        <span>FADES-RH</span>
        <strong>ÉVALUATION PROFESSIONNELLE</strong>
      </div>
      <small>${normalizeExportText(evaluation.reference)}</small>
    </div>

    <div class="evaluation-export-cover-main">
      <div class="evaluation-export-cover-copy">
        <p class="evaluation-export-cover-label">
          DOSSIER INDIVIDUEL DE PERFORMANCE
        </p>

        <h1>${normalizeExportText(evaluation.title)}</h1>

        <p class="evaluation-export-cover-subtitle">
          Exercice ${evaluation.evaluationYear}
          · ${formatDate(evaluation.periodStartDate)}
          — ${formatDate(evaluation.periodEndDate)}
        </p>

        <div class="evaluation-export-cover-agent">
          <span>AGENT ÉVALUÉ</span>
          <strong>${normalizeExportText(evaluation.agentSnapshot.fullName)}</strong>
          <p>
            ${normalizeExportText(evaluation.agentSnapshot.jobTitle)}
            · ${normalizeExportText(evaluation.agentSnapshot.matricule)}
          </p>
        </div>
      </div>

      <div class="evaluation-export-cover-score-card">
        <span>Score global</span>
        <strong>${evaluation.finalScore}</strong>
        <small>/ 100</small>
        <em>${gradeLabels[evaluation.grade]}</em>
      </div>
    </div>

    <div class="evaluation-export-cover-summary">
      <article>
        <span>Direction</span>
        <strong>${normalizeExportText(direction)}</strong>
      </article>

      <article>
        <span>Service</span>
        <strong>${normalizeExportText(service)}</strong>
      </article>

      <article>
        <span>Risque RH</span>
        <strong>${riskLabels[evaluation.intelligence.riskLevel]}</strong>
      </article>

      <article>
        <span>Potentiel</span>
        <strong>${potentialLabels[evaluation.intelligence.potentialLevel]}</strong>
      </article>

      <article>
        <span>Fiabilité des données</span>
        <strong>${confidenceLabels[evaluation.intelligence.dataConfidence]}</strong>
      </article>

      <article>
        <span>Statut</span>
        <strong>${statusLabels[evaluation.status]}</strong>
      </article>
    </div>

    <div class="evaluation-export-cover-insight">
      <span>LECTURE SYNTHÉTIQUE</span>
      <p>
        ${normalizeExportText(
          evaluation.intelligence.hrExecutiveBrief ||
          getExportScoreDescription(evaluation.finalScore),
        )}
      </p>
    </div>

    <div class="evaluation-export-cover-confidential">
      <strong>DOCUMENT CONFIDENTIEL RH</strong>
      <span>
        Diffusion limitée aux personnes habilitées dans le cadre du processus
        d’évaluation.
      </span>
    </div>
  `;

  const toc =
    document.createElement("section");

  toc.className =
    "evaluation-export-toc";

  const tocItems =
    buildEvaluationTocItems(evaluation);

  toc.innerHTML = `
    <div class="evaluation-export-toc-header">
      <div>
        <span>STRUCTURE DU DOCUMENT</span>
        <h2>Sommaire</h2>
      </div>

      <div class="evaluation-export-toc-score">
        <small>Score</small>
        <strong>${evaluation.finalScore}</strong>
        <span>/100</span>
      </div>
    </div>

    <p class="evaluation-export-toc-intro">
      Parcours de lecture conçu pour faciliter l’analyse RH, l’entretien
      hiérarchique et la décision finale.
    </p>

    <ol>
      ${tocItems
        .map(
          (item, index) => `
            <li>
              <span>${String(index + 1).padStart(2, "0")}</span>
              <strong>${normalizeExportText(item)}</strong>
            </li>
          `,
        )
        .join("")}
    </ol>

    <div class="evaluation-export-toc-markers">
      <article>
        <span>Objectifs</span>
        <strong>${evaluation.intelligence.objectiveIndex} / 100</strong>
      </article>
      <article>
        <span>Assiduité</span>
        <strong>${evaluation.intelligence.attendanceIndex} / 100</strong>
      </article>
      <article>
        <span>Fiabilité</span>
        <strong>${evaluation.intelligence.reliabilityIndex} / 100</strong>
      </article>
      <article>
        <span>Constance</span>
        <strong>${evaluation.intelligence.consistencyIndex} / 100</strong>
      </article>
    </div>
  `;

  fragment.append(
    cover,
    toc,
  );

  return fragment;
}

function prepareEvaluationExportClone(
  evaluation: Evaluation,
):
  | HTMLElement
  | null {
  const source =
    document.querySelector<HTMLElement>(
      ".evaluation-printable-document",
    );

  if (!source) {
    return null;
  }

  const clone =
    source.cloneNode(
      true,
    ) as HTMLElement;

  /**
   * Double sécurité :
   * les deux blocs sont retirés du JSX dans cette version,
   * mais on les supprime aussi d'une éventuelle copie héritée.
   */
  clone
    .querySelectorAll(
      ".evaluation-official-letterhead, .evaluation-document-footer",
    )
    .forEach((element) =>
      element.remove(),
    );

  clone.classList.add(
    "evaluation-export-clone",
  );

  decorateEvaluationExportSections(
    clone,
    evaluation,
  );

  clone.prepend(
    createEvaluationExportFrontMatter(
      evaluation,
    ),
  );

  return clone;
}

const EVALUATION_EXPORT_STYLES = `
  @page {
    size: A4 portrait;
    margin: 12mm 12mm 13mm;
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  html,
  body {
    width: 100%;
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #173841;
    font-family: Aptos, Calibri, Inter, "Segoe UI", Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.5;
  }

  body.evaluation-export-document {
    padding: 0;
    background: #ffffff;
  }

  .evaluation-official-letterhead,
  .evaluation-document-footer,
  .no-print {
    display: none !important;
  }

.evaluation-export-cover,
.evaluation-export-toc {
  display: flex !important;
  width: 100% !important;
  flex-direction: column !important;
  background: #ffffff !important;
  overflow: hidden !important;
}

.evaluation-export-cover {
  position: relative !important;
  min-height: 1015px !important;
  justify-content: space-between !important;
  padding: 42px 42px 34px !important;
  border: 1px solid #d7e5dc !important;
  background:
    radial-gradient(circle at 92% 9%, rgba(233, 181, 33, .13), transparent 230px),
    linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%) !important;
  break-after: page !important;
  page-break-after: always !important;
}

.evaluation-export-cover::after {
  position: absolute !important;
  right: -100px !important;
  bottom: -120px !important;
  width: 320px !important;
  height: 320px !important;
  border: 30px solid rgba(4, 98, 66, .05) !important;
  border-radius: 50% !important;
  content: "" !important;
}

.evaluation-export-cover-topline {
  position: relative !important;
  z-index: 1 !important;
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 24px !important;
  padding-bottom: 14px !important;
  border-bottom: 5px solid #046242 !important;
  box-shadow: inset 0 -1px 0 #e9b521 !important;
}

.evaluation-export-cover-topline > div {
  display: grid !important;
  gap: 3px !important;
}

.evaluation-export-cover-topline span {
  color: #046242 !important;
  font-size: 8pt !important;
  font-weight: 900 !important;
  letter-spacing: .14em !important;
}

.evaluation-export-cover-topline strong {
  color: #0b2536 !important;
  font-size: 9.2pt !important;
  letter-spacing: .04em !important;
}

.evaluation-export-cover-topline small {
  color: #60777f !important;
  font-size: 7.4pt !important;
  font-weight: 800 !important;
}

.evaluation-export-cover-main {
  position: relative !important;
  z-index: 1 !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 155px !important;
  align-items: center !important;
  gap: 34px !important;
  margin-top: 42px !important;
}

.evaluation-export-cover-copy {
  min-width: 0 !important;
}

.evaluation-export-cover-label {
  margin: 0 !important;
  color: #046242 !important;
  font-size: 8pt !important;
  font-weight: 900 !important;
  letter-spacing: .09em !important;
}

.evaluation-export-cover h1 {
  max-width: 560px !important;
  margin: 14px 0 10px !important;
  color: #0b2536 !important;
  font-size: 28pt !important;
  line-height: 1.05 !important;
  letter-spacing: -.03em !important;
}

.evaluation-export-cover-subtitle {
  margin: 0 !important;
  color: #60777f !important;
  font-size: 10pt !important;
  line-height: 1.5 !important;
}

.evaluation-export-cover-agent {
  max-width: 520px !important;
  margin-top: 32px !important;
  padding: 15px 18px !important;
  border-left: 5px solid #e9b521 !important;
  background: rgba(255, 255, 255, .86) !important;
}

.evaluation-export-cover-agent span,
.evaluation-export-cover-agent strong,
.evaluation-export-cover-agent p {
  display: block !important;
}

.evaluation-export-cover-agent span {
  color: #74888d !important;
  font-size: 7pt !important;
  font-weight: 900 !important;
  letter-spacing: .08em !important;
}

.evaluation-export-cover-agent strong {
  margin-top: 5px !important;
  color: #173841 !important;
  font-size: 15pt !important;
}

.evaluation-export-cover-agent p {
  margin: 5px 0 0 !important;
  color: #5c7379 !important;
  font-size: 8.5pt !important;
}

.evaluation-export-cover-score-card {
  display: grid !important;
  min-height: 170px !important;
  place-content: center !important;
  padding: 18px !important;
  border: 7px solid rgba(233, 181, 33, .52) !important;
  border-radius: 28px 0 28px 0 !important;
  background: #046242 !important;
  color: #ffffff !important;
  text-align: center !important;
}

.evaluation-export-cover-score-card span,
.evaluation-export-cover-score-card strong,
.evaluation-export-cover-score-card small,
.evaluation-export-cover-score-card em {
  display: block !important;
}

.evaluation-export-cover-score-card span {
  font-size: 7.2pt !important;
  font-weight: 850 !important;
  text-transform: uppercase !important;
}

.evaluation-export-cover-score-card strong {
  margin-top: 7px !important;
  font-size: 31pt !important;
  line-height: .95 !important;
}

.evaluation-export-cover-score-card small {
  margin-top: 3px !important;
  font-size: 8pt !important;
  font-weight: 800 !important;
}

.evaluation-export-cover-score-card em {
  margin-top: 9px !important;
  font-size: 7.2pt !important;
  font-style: normal !important;
  font-weight: 900 !important;
  text-transform: uppercase !important;
}

.evaluation-export-cover-summary {
  position: relative !important;
  z-index: 1 !important;
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 8px !important;
  margin-top: 38px !important;
}

.evaluation-export-cover-summary article {
  min-width: 0 !important;
  padding: 11px 12px !important;
  border: 1px solid #d7e5dc !important;
  background: #ffffff !important;
}

.evaluation-export-cover-summary span,
.evaluation-export-cover-summary strong {
  display: block !important;
}

.evaluation-export-cover-summary span {
  color: #788b90 !important;
  font-size: 6.6pt !important;
  font-weight: 850 !important;
}

.evaluation-export-cover-summary strong {
  margin-top: 4px !important;
  color: #173841 !important;
  font-size: 8pt !important;
  line-height: 1.35 !important;
}

.evaluation-export-cover-insight {
  position: relative !important;
  z-index: 1 !important;
  margin-top: 20px !important;
  padding: 14px 16px !important;
  border: 1px solid #cfe1d6 !important;
  border-left: 4px solid #046242 !important;
  background: #f8fbf9 !important;
}

.evaluation-export-cover-insight span {
  color: #046242 !important;
  font-size: 6.7pt !important;
  font-weight: 900 !important;
  letter-spacing: .08em !important;
}

.evaluation-export-cover-insight p {
  margin: 6px 0 0 !important;
  color: #405e66 !important;
  font-size: 8.2pt !important;
  line-height: 1.5 !important;
  text-align: justify !important;
}

.evaluation-export-cover-confidential {
  position: relative !important;
  z-index: 1 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 18px !important;
  margin-top: 18px !important;
  padding-top: 12px !important;
  border-top: 1px solid #bfd2c5 !important;
}

.evaluation-export-cover-confidential strong {
  color: #8a6410 !important;
  font-size: 7pt !important;
  letter-spacing: .05em !important;
}

.evaluation-export-cover-confidential span {
  max-width: 470px !important;
  color: #73878c !important;
  font-size: 6.7pt !important;
  line-height: 1.4 !important;
  text-align: right !important;
}

.evaluation-export-toc {
  gap: 14px !important;
  padding: 24px 28px 22px !important;
  border: 1px solid #d7e5dc !important;
  background: #ffffff !important;
}

.evaluation-export-toc-header {
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 20px !important;
}

.evaluation-export-toc-header > div:first-child span {
  color: #046242 !important;
  font-size: 7pt !important;
  font-weight: 900 !important;
  letter-spacing: .11em !important;
}

.evaluation-export-toc h2 {
  margin: 5px 0 0 !important;
  color: #0b2536 !important;
  font-size: 22pt !important;
  line-height: 1 !important;
}

.evaluation-export-toc-score {
  display: grid !important;
  grid-template-columns: auto auto !important;
  align-items: end !important;
  gap: 2px 4px !important;
  padding: 10px 12px !important;
  border: 1px solid #cfe1d6 !important;
  border-radius: 0 12px 0 12px !important;
  background: #eef8f2 !important;
  color: #046242 !important;
}

.evaluation-export-toc-score small {
  grid-column: 1 / -1 !important;
  font-size: 6.4pt !important;
  font-weight: 900 !important;
  text-transform: uppercase !important;
}

.evaluation-export-toc-score strong {
  font-size: 18pt !important;
  line-height: 1 !important;
}

.evaluation-export-toc-score span {
  font-size: 7pt !important;
  font-weight: 900 !important;
}

.evaluation-export-toc-intro {
  max-width: 610px !important;
  margin: 0 !important;
  color: #60777f !important;
  font-size: 8pt !important;
  line-height: 1.5 !important;
}

.evaluation-export-toc ol {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 0 20px !important;
  margin: 4px 0 0 !important;
  padding: 0 !important;
  list-style: none !important;
}

.evaluation-export-toc li {
  display: grid !important;
  grid-template-columns: 34px minmax(0, 1fr) !important;
  align-items: center !important;
  gap: 9px !important;
  min-height: 39px !important;
  padding: 6px 0 !important;
  border-bottom: 1px solid #dce8e1 !important;
}

.evaluation-export-toc li span {
  display: grid !important;
  width: 29px !important;
  height: 25px !important;
  place-items: center !important;
  border-radius: 0 8px 0 8px !important;
  background: #eaf5ef !important;
  color: #046242 !important;
  font-size: 6.7pt !important;
  font-weight: 900 !important;
}

.evaluation-export-toc li strong {
  color: #173841 !important;
  font-size: 7.6pt !important;
  font-weight: 800 !important;
  line-height: 1.3 !important;
}

.evaluation-export-toc-markers {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 7px !important;
  margin-top: 5px !important;
}

.evaluation-export-toc-markers article {
  padding: 9px !important;
  border: 1px solid #d7e5dc !important;
  background: #f8fbf9 !important;
}

.evaluation-export-toc-markers span,
.evaluation-export-toc-markers strong {
  display: block !important;
}

.evaluation-export-toc-markers span {
  color: #788b90 !important;
  font-size: 6.3pt !important;
  font-weight: 850 !important;
}

.evaluation-export-toc-markers strong {
  margin-top: 3px !important;
  color: #046242 !important;
  font-size: 8.4pt !important;
}

  .print-header {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 28mm !important;
    align-items: center !important;
    gap: 5mm !important;
    margin: 0 0 2mm !important;
    padding: 4mm !important;
    border: .3mm solid #cfe1d6 !important;
    border-radius: 0 3.6mm 0 3.6mm !important;
    background: linear-gradient(135deg, #eef8f2, #fffaf0) !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .print-header > div {
    min-width: 0 !important;
  }

  .print-header span {
    color: #046242 !important;
    font-size: 7pt !important;
    font-weight: 900 !important;
    letter-spacing: .08em !important;
  }

  .print-header h2 {
    margin: 1mm 0 1.2mm !important;
    color: #0b2536 !important;
    font-size: 17pt !important;
    line-height: 1.16 !important;
    overflow-wrap: anywhere !important;
  }

  .print-header p {
    margin: 0 !important;
    color: #577076 !important;
    font-size: 8.5pt !important;
    line-height: 1.5 !important;
    text-align: justify !important;
  }

  .print-header > strong {
    display: flex !important;
    width: 27mm !important;
    min-width: 27mm !important;
    height: 27mm !important;
    align-items: center !important;
    justify-content: center !important;
    justify-self: end !important;
    border: 1.1mm solid rgba(233, 181, 33, .55) !important;
    border-radius: 50% !important;
    background: #046242 !important;
    color: #ffffff !important;
    font-size: 12pt !important;
    font-weight: 900 !important;
    white-space: nowrap !important;
  }

.evaluation-numbered-title {
  display: grid !important;
  grid-template-columns: 34px minmax(0, 1fr) !important;
  align-items: center !important;
  gap: 9px !important;
  margin: 0 0 2.5mm !important;
  padding: 0 0 2mm !important;
  border-bottom: .3mm solid #d7e5dc !important;
  color: #0b2536 !important;
  break-after: avoid !important;
  page-break-after: avoid !important;
}

.evaluation-section-number {
  display: grid !important;
  width: 30px !important;
  height: 27px !important;
  place-items: center !important;
  border-radius: 0 8px 0 8px !important;
  background: #046242 !important;
  color: #ffffff !important;
  font-size: 7.2pt !important;
  font-weight: 900 !important;
  line-height: 1 !important;
}

.evaluation-section-title-text {
  min-width: 0 !important;
  color: #0b2536 !important;
  font-size: 9.5pt !important;
  font-weight: 900 !important;
  line-height: 1.25 !important;
  text-transform: uppercase !important;
  letter-spacing: .015em !important;
}

.evaluation-generated-section-title {
  margin-top: 0 !important;
}

.evaluation-final-page > .evaluation-numbered-title {
  margin-bottom: 4mm !important;
}

  .evaluation-score-band,
  .print-card,
  .evaluation-print-section,
  .criterion-print,
  .leave-metrics-grid article,
  .leave-balance-card,
  .leave-breakdown-list article,
  .signature-box,
  .intelligence-grid article,
  .smart-list-grid > div {
    min-width: 0 !important;
    border-color: #d7e5dc !important;
    background: #ffffff !important;
  }

  .evaluation-score-band {
    display: flex !important;
    align-items: center !important;
    gap: 3mm !important;
    padding: 3mm 3.5mm !important;
    border: .3mm solid #d7e5dc !important;
    border-left: 1.2mm solid #e9b521 !important;
    border-radius: 0 3mm 0 3mm !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .print-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 2.4mm !important;
  }

  .print-card {
    padding: 3mm !important;
    border: .28mm solid #d7e5dc !important;
    border-radius: 0 2.8mm 0 2.8mm !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .print-card span,
  .print-card strong,
  .print-card p {
    display: block !important;
  }

  .print-card span {
    color: #71868b !important;
    font-size: 7pt !important;
    font-weight: 850 !important;
  }

  .print-card strong {
    margin-top: .8mm !important;
    color: #173841 !important;
    font-size: 9pt !important;
  }

  .print-card p {
    margin: .8mm 0 0 !important;
    color: #62797f !important;
    font-size: 7.5pt !important;
    line-height: 1.4 !important;
  }

  .evaluation-print-section {
    display: block !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 3.2mm 3.5mm !important;
    border: .28mm solid #d7e5dc !important;
    border-radius: 0 3mm 0 3mm !important;
    background: #ffffff !important;
    overflow: visible !important;
  }

  .evaluation-print-section > h4,
  .evaluation-section-heading h4 {
    margin: 0 0 2.2mm !important;
    color: #0b2536 !important;
    font-size: 9.5pt !important;
    line-height: 1.25 !important;
    break-after: avoid !important;
    page-break-after: avoid !important;
  }

  .evaluation-print-section p,
  .evaluation-preline-text {
    color: #405e66 !important;
    font-size: 8.5pt !important;
    line-height: 1.55 !important;
    text-align: justify !important;
    white-space: pre-line !important;
  }

  .snapshot-grid {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 2mm !important;
  }

  .snapshot-grid span {
    min-width: 0 !important;
    padding: 2.3mm !important;
    border: .25mm solid #d7e5dc !important;
    background: #f8fbf9 !important;
    color: #34515a !important;
    font-size: 7.5pt !important;
    line-height: 1.35 !important;
  }

  .intelligence-grid,
  .smart-list-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 2.2mm !important;
  }

  .intelligence-indexes {
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 1.8mm !important;
    margin-top: 2mm !important;
  }

  .intelligence-indexes span {
    padding: 2mm !important;
    border: .25mm solid #d7e5dc !important;
    border-radius: 999px !important;
    background: #f8fbf9 !important;
    color: #34515a !important;
    font-size: 7pt !important;
    font-weight: 850 !important;
    text-align: center !important;
  }

  .leave-metrics-grid {
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 2mm !important;
  }

  .leave-metrics-grid article {
    padding: 2.4mm !important;
    border: .25mm solid #d7e5dc !important;
    border-radius: 0 2.4mm 0 2.4mm !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .leave-breakdown-list {
    display: grid !important;
    gap: 1.8mm !important;
  }

  .leave-breakdown-list article {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 3mm !important;
    align-items: center !important;
    padding: 2.5mm !important;
    border: .25mm solid #d7e5dc !important;
    background: #f8fbf9 !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .criterion-print {
    margin-top: 2mm !important;
    padding: 3mm !important;
    border: .28mm solid #d7e5dc !important;
    border-left: 1mm solid #046242 !important;
    border-radius: 0 2.8mm 0 2.8mm !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .criterion-print strong,
  .criterion-print span,
  .criterion-print p,
  .criterion-print small {
    overflow-wrap: anywhere !important;
  }

  .smart-list-grid > div {
    padding: 3mm !important;
    border: .25mm solid #d7e5dc !important;
    border-radius: 0 2.5mm 0 2.5mm !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .smart-list-grid ul,
  .criterion-automation-details,
  .evaluation-automatic-summary {
    margin: 2mm 0 0 !important;
    padding-left: 5mm !important;
    color: #526d74 !important;
    font-size: 7.7pt !important;
    line-height: 1.45 !important;
  }

  .signature-grid {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 4mm !important;
    margin-top: 5mm !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .signature-box {
    min-height: 25mm !important;
    padding: 3.5mm !important;
    border: .28mm solid #d7e5dc !important;
    border-top: 1mm solid #046242 !important;
    border-radius: 0 3mm 0 3mm !important;
  }

  .evaluation-final-page {
    display: block !important;
    width: 100% !important;
  }

  @media print {
    html,
    body {
      background: #ffffff !important;
    }

    body.evaluation-export-document {
      padding: 0 !important;
    }

    .evaluation-printable-document,
    .evaluation-export-clone {
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
    }
  }
`;

function buildEvaluationStandaloneHtml(
  evaluation: Evaluation,
  clonedDocument: HTMLElement,
): string {
  const applicationStyles =
    collectDocumentStyles();

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${evaluation.reference} — Évaluation professionnelle</title>
  <style>
    ${applicationStyles}
    ${EVALUATION_EXPORT_STYLES}
  </style>
</head>
<body class="evaluation-export-document">
  ${clonedDocument.outerHTML}
</body>
</html>`;
}

function triggerEvaluationDownload(
  blob: Blob,
  fileName: string,
): void {
  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(
    () =>
      URL.revokeObjectURL(url),
    1_500,
  );
}

async function printPrintableDocument(
  evaluation: Evaluation,
): Promise<void> {
  const clone =
    prepareEvaluationExportClone(evaluation);

  if (!clone) {
    throw new Error(
      "Le document d'évaluation est introuvable.",
    );
  }

  const popup = window.open(
    "",
    "_blank",
    "width=1120,height=900",
  );

  if (!popup) {
    throw new Error(
      "La fenêtre d'impression a été bloquée par le navigateur.",
    );
  }

  popup.document.open();
  popup.document.write(
    buildEvaluationStandaloneHtml(
      evaluation,
      clone,
    ),
  );
  popup.document.close();
  popup.opener = null;

  window.setTimeout(() => {
    popup.focus();
    popup.print();
  }, 180);
}

/* ------------------------------------------------------------------
   PDF — capture intégrale puis pagination contrôlée A4
   ------------------------------------------------------------------ */

function collectEvaluationPdfBreakpoints(
  root: HTMLElement,
  scale: number,
): number[] {
  const rootRect =
    root.getBoundingClientRect();

  const selectors = [
    ".evaluation-export-cover",
    ".evaluation-export-toc",
    ".evaluation-numbered-title",
    ".print-header",
    ".evaluation-score-band",
    ".print-card",
    ".evaluation-print-section > h4",
    ".evaluation-print-section p",
    ".evaluation-automatic-summary li",
    ".smart-list-grid li",
    ".criterion-automation-details li",
    ".criterion-print",
    ".leave-metrics-grid article",
    ".leave-breakdown-list article",
    ".smart-list-grid > div",
    ".signature-grid",
  ];

  const points =
    new Set<number>([0]);

  root
    .querySelectorAll<HTMLElement>(
      selectors.join(","),
    )
    .forEach((element) => {
      const rect =
        element.getBoundingClientRect();

      const bottom =
        Math.round(
          (rect.bottom -
            rootRect.top) *
            scale,
        );

      if (bottom > 0) {
        points.add(bottom);
      }
    });

  return Array.from(points).sort(
    (first, second) =>
      first - second,
  );
}

function chooseEvaluationPdfSliceEnd(
  start: number,
  target: number,
  total: number,
  breakpoints: number[],
): number {
  if (target >= total) {
    return total;
  }

  const usefulHeight =
    target - start;

  const minimum =
    start +
    usefulHeight * 0.72;

  const candidates =
    breakpoints.filter(
      (point) =>
        point > minimum &&
        point <= target - 8,
    );

  if (candidates.length > 0) {
    return candidates[
      candidates.length - 1
    ];
  }

  return Math.min(
    target,
    total,
  );
}

type EvaluationPdfCursor = {
  y: number;
};

function pdfHexToRgb(
  hex: string,
): [number, number, number] {
  const normalized =
    hex.replace("#", "");

  return [
    Number.parseInt(
      normalized.slice(0, 2),
      16,
    ),
    Number.parseInt(
      normalized.slice(2, 4),
      16,
    ),
    Number.parseInt(
      normalized.slice(4, 6),
      16,
    ),
  ];
}

function pdfSetTextColor(
  pdf: any,
  hex: string,
): void {
  pdf.setTextColor(
    ...pdfHexToRgb(hex),
  );
}

function pdfSetFillColor(
  pdf: any,
  hex: string,
): void {
  pdf.setFillColor(
    ...pdfHexToRgb(hex),
  );
}

function pdfSetDrawColor(
  pdf: any,
  hex: string,
): void {
  pdf.setDrawColor(
    ...pdfHexToRgb(hex),
  );
}

function pdfAddPage(
  pdf: any,
  cursor: EvaluationPdfCursor,
): void {
  pdf.addPage(
    "a4",
    "portrait",
  );

  cursor.y = 15;
}

function pdfEnsureSpace(
  pdf: any,
  cursor: EvaluationPdfCursor,
  requiredHeight: number,
): void {
  if (
    cursor.y +
      requiredHeight >
    282
  ) {
    pdfAddPage(
      pdf,
      cursor,
    );
  }
}

function pdfWrappedText(
  pdf: any,
  cursor: EvaluationPdfCursor,
  text: string,
  options: {
    x?: number;
    width?: number;
    fontSize?: number;
    color?: string;
    fontStyle?: "normal" | "bold" | "italic";
    lineHeight?: number;
    after?: number;
    align?: "left" | "center" | "right";
  } = {},
): void {
  const x =
    options.x ?? 15;

  const width =
    options.width ?? 180;

  const fontSize =
    options.fontSize ?? 9.5;

  const lineHeight =
    options.lineHeight ?? 4.6;

  const normalized =
    normalizeExportText(
      text,
    );

  if (!normalized) {
    return;
  }

  pdf.setFont(
    "helvetica",
    options.fontStyle ??
      "normal",
  );

  pdf.setFontSize(
    fontSize,
  );

  pdfSetTextColor(
    pdf,
    options.color ??
      EVALUATION_PDF_THEME.text,
  );

  const lines =
    pdf.splitTextToSize(
      normalized,
      width,
    );

  const height =
    Math.max(
      lineHeight,
      lines.length *
        lineHeight,
    );

  pdfEnsureSpace(
    pdf,
    cursor,
    height +
      (options.after ??
        2),
  );

  pdf.text(
    lines,
    options.align ===
      "center"
      ? x + width / 2
      : options.align ===
          "right"
        ? x + width
        : x,
    cursor.y,
    {
      align:
        options.align ??
        "left",
      lineHeightFactor:
        lineHeight /
        (
          fontSize *
          0.352778
        ),
    },
  );

  cursor.y +=
    height +
    (options.after ?? 2);
}

function pdfSectionTitle(
  pdf: any,
  cursor: EvaluationPdfCursor,
  evaluation: Evaluation,
  title: string,
): void {
  const number =
    getEvaluationSectionNumber(
      evaluation,
      title,
    );

  pdfEnsureSpace(
    pdf,
    cursor,
    14,
  );

  const numberWidth = 11;
  const titleX = 30;

  pdfSetFillColor(
    pdf,
    EVALUATION_PDF_THEME.white,
  );

  pdfSetDrawColor(
    pdf,
    EVALUATION_PDF_THEME.green,
  );

  pdf.setLineWidth(0.45);

  pdf.roundedRect(
    15,
    cursor.y - 4.5,
    numberWidth,
    8.2,
    0,
    2.2,
    "FD",
  );

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(8.5);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.green,
  );

  pdf.text(
    number ||
      "",
    15 +
      numberWidth /
        2,
    cursor.y + 0.5,
    {
      align: "center",
    },
  );

  pdf.setFontSize(10.5);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.navy,
  );

  pdf.text(
    normalizeExportText(
      title,
    ).toUpperCase(),
    titleX,
    cursor.y + 0.4,
  );

  pdfSetDrawColor(
    pdf,
    EVALUATION_PDF_THEME.line,
  );

  pdf.setLineWidth(0.25);

  pdf.line(
    titleX,
    cursor.y + 3.5,
    184,
    cursor.y + 3.5,
  );

  pdfSetDrawColor(
    pdf,
    EVALUATION_PDF_THEME.gold,
  );

  pdf.setLineWidth(0.8);

  pdf.line(
    184,
    cursor.y + 3.5,
    195,
    cursor.y + 3.5,
  );

  cursor.y += 10;
}

function pdfInfoBox(
  pdf: any,
  cursor: EvaluationPdfCursor,
  text: string,
  options: {
    fill?: string;
    border?: string;
    accent?: string;
    color?: string;
    fontSize?: number;
  } = {},
): void {
  const width = 180;
  const padding = 4.2;
  const fontSize =
    options.fontSize ?? 9;

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(
    fontSize,
  );

  const lines =
    pdf.splitTextToSize(
      normalizeExportText(
        text,
      ),
      width -
        padding * 2 -
        2,
    );

  const lineHeight = 4.5;

  const height =
    Math.max(
      12,
      lines.length *
        lineHeight +
        padding * 2,
    );

  pdfEnsureSpace(
    pdf,
    cursor,
    height + 3,
  );

  pdfSetFillColor(
    pdf,
    options.fill ??
      EVALUATION_PDF_THEME.soft,
  );

  pdfSetDrawColor(
    pdf,
    options.border ??
      EVALUATION_PDF_THEME.line,
  );

  pdf.setLineWidth(0.25);

  pdf.roundedRect(
    15,
    cursor.y,
    width,
    height,
    0,
    2.5,
    "FD",
  );

  if (options.accent) {
    pdfSetFillColor(
      pdf,
      options.accent,
    );

    pdf.rect(
      15,
      cursor.y,
      1.8,
      height,
      "F",
    );
  }

  pdfSetTextColor(
    pdf,
    options.color ??
      EVALUATION_PDF_THEME.text,
  );

  pdf.text(
    lines,
    15 +
      padding +
      (
        options.accent
          ? 1.8
          : 0
      ),
    cursor.y +
      padding +
      2.5,
    {
      lineHeightFactor: 1.4,
    },
  );

  cursor.y +=
    height + 4;
}

function pdfBulletList(
  pdf: any,
  cursor: EvaluationPdfCursor,
  items: string[],
  options: {
    label?: string;
    accent?: string;
  } = {},
): void {
  const filtered =
    items
      .map(
        normalizeExportText,
      )
      .filter(Boolean);

  if (!filtered.length) {
    return;
  }

  if (options.label) {
    pdfEnsureSpace(
      pdf,
      cursor,
      9,
    );

    pdf.setFont(
      "helvetica",
      "bold",
    );

    pdf.setFontSize(9);
    pdfSetTextColor(
      pdf,
      options.accent ??
        EVALUATION_PDF_THEME.green,
    );

    pdf.text(
      normalizeExportText(
        options.label,
      ),
      15,
      cursor.y,
    );

    cursor.y += 5.5;
  }

  for (
    const item of filtered
  ) {
    pdf.setFont(
      "helvetica",
      "normal",
    );

    pdf.setFontSize(8.8);

    const lines =
      pdf.splitTextToSize(
        item,
        170,
      );

    const height =
      Math.max(
        4.2,
        lines.length * 4.2,
      );

    pdfEnsureSpace(
      pdf,
      cursor,
      height + 2,
    );

    pdfSetFillColor(
      pdf,
      options.accent ??
        EVALUATION_PDF_THEME.green,
    );

    pdf.circle(
      17,
      cursor.y - 0.9,
      0.8,
      "F",
    );

    pdfSetTextColor(
      pdf,
      EVALUATION_PDF_THEME.text,
    );

    pdf.text(
      lines,
      21,
      cursor.y,
      {
        lineHeightFactor: 1.35,
      },
    );

    cursor.y +=
      height + 1.8;
  }

  cursor.y += 1.5;
}

function pdfThreeColumnCards(
  pdf: any,
  cursor: EvaluationPdfCursor,
  items: Array<
    [
      string,
      string,
    ]
  >,
): void {
  const gap = 3;
  const cardWidth =
    (
      180 -
      gap * 2
    ) /
    3;

  for (
    let index = 0;
    index < items.length;
    index += 3
  ) {
    const row =
      items.slice(
        index,
        index + 3,
      );

    let rowHeight = 17;

    const wrapped =
      row.map(
        (
          [
            label,
            value,
          ],
        ) => {
          pdf.setFontSize(8.3);

          const lines =
            pdf.splitTextToSize(
              normalizeExportText(
                value,
              ),
              cardWidth - 8,
            );

          rowHeight =
            Math.max(
              rowHeight,
              10 +
                lines.length *
                  4,
            );

          return {
            label,
            lines,
          };
        },
      );

    pdfEnsureSpace(
      pdf,
      cursor,
      rowHeight + 4,
    );

    wrapped.forEach(
      (
        item,
        columnIndex,
      ) => {
        const x =
          15 +
          columnIndex *
            (
              cardWidth +
              gap
            );

        pdfSetFillColor(
          pdf,
          columnIndex % 2 ===
            0
            ? EVALUATION_PDF_THEME.white
            : EVALUATION_PDF_THEME.soft,
        );

        pdfSetDrawColor(
          pdf,
          EVALUATION_PDF_THEME.line,
        );

        pdf.roundedRect(
          x,
          cursor.y,
          cardWidth,
          rowHeight,
          0,
          2,
          "FD",
        );

        pdf.setFont(
          "helvetica",
          "bold",
        );

        pdf.setFontSize(7.2);
        pdfSetTextColor(
          pdf,
          "#75898E",
        );

        pdf.text(
          normalizeExportText(
            item.label,
          ).toUpperCase(),
          x + 4,
          cursor.y + 5,
        );

        pdf.setFontSize(8.6);
        pdfSetTextColor(
          pdf,
          EVALUATION_PDF_THEME.ink,
        );

        pdf.text(
          item.lines,
          x + 4,
          cursor.y + 10,
          {
            lineHeightFactor: 1.35,
          },
        );
      },
    );

    cursor.y +=
      rowHeight + 4;
  }
}

function pdfDrawCover(
  pdf: any,
  evaluation: Evaluation,
): void {
  const primary =
    EVALUATION_PDF_THEME.green;

  const navy =
    EVALUATION_PDF_THEME.navy;

  const gold =
    EVALUATION_PDF_THEME.gold;

  // Barre supérieure
  pdfSetFillColor(
    pdf,
    EVALUATION_PDF_THEME.navy,
  );

  pdf.rect(
    15,
    15,
    165,
    1.4,
    "F",
  );

  pdfSetFillColor(
    pdf,
    EVALUATION_PDF_THEME.gold,
  );

  pdf.rect(
    180,
    15,
    15,
    1.4,
    "F",
  );

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(8.3);
  pdfSetTextColor(
    pdf,
    primary,
  );

  pdf.text(
    "FADES-RH · ÉVALUATION PROFESSIONNELLE",
    15,
    25,
  );

  pdf.setFontSize(7.6);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.muted,
  );

  pdf.text(
    normalizeExportText(
      evaluation.reference,
    ),
    195,
    25,
    {
      align: "right",
    },
  );

  // Titre
  pdf.setFontSize(8);
  pdfSetTextColor(
    pdf,
    primary,
  );

  pdf.text(
    "DOSSIER INDIVIDUEL DE PERFORMANCE",
    15,
    49,
  );

  pdf.setFontSize(25);
  pdfSetTextColor(
    pdf,
    navy,
  );

  const titleLines =
    pdf.splitTextToSize(
      normalizeExportText(
        evaluation.title,
      ),
      123,
    );

  pdf.text(
    titleLines,
    15,
    61,
    {
      lineHeightFactor: 1.08,
    },
  );

  const titleHeight =
    titleLines.length *
    9.3;

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(9.3);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.muted,
  );

  pdf.text(
    `Exercice ${evaluation.evaluationYear} · ${formatDate(evaluation.periodStartDate)} — ${formatDate(evaluation.periodEndDate)}`,
    15,
    64 +
      titleHeight,
  );

  // Bloc score
  pdfSetFillColor(
    pdf,
    EVALUATION_PDF_THEME.white,
  );

  pdfSetDrawColor(
    pdf,
    EVALUATION_PDF_THEME.lineStrong,
  );

  pdf.setLineWidth(0.45);

  pdf.roundedRect(
    151,
    48,
    44,
    52,
    5,
    0,
    "FD",
  );

  pdfSetFillColor(
    pdf,
    EVALUATION_PDF_THEME.gold,
  );

  pdf.rect(
    151,
    48,
    44,
    1.1,
    "F",
  );

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(7.2);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.muted,
  );

  pdf.text(
    "SCORE GLOBAL",
    173,
    60,
    {
      align: "center",
    },
  );

  pdf.setFontSize(25);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.green,
  );
  pdf.text(
    String(
      evaluation.finalScore,
    ),
    173,
    75,
    {
      align: "center",
    },
  );

  pdf.setFontSize(7.2);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.muted,
  );
  pdf.text(
    "/ 100",
    173,
    82,
    {
      align: "center",
    },
  );

  pdf.setFontSize(7);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.ink,
  );
  pdf.text(
    normalizeExportText(
      gradeLabels[
        evaluation.grade
      ],
    ).toUpperCase(),
    173,
    92,
    {
      align: "center",
      maxWidth: 36,
    },
  );

  // Agent
  const agentY =
    Math.max(
      114,
      77 +
        titleHeight,
    );

  pdfSetFillColor(
    pdf,
    EVALUATION_PDF_THEME.white,
  );

  pdfSetDrawColor(
    pdf,
    EVALUATION_PDF_THEME.line,
  );

  pdf.setLineWidth(0.3);

  pdf.roundedRect(
    15,
    agentY,
    180,
    29,
    0,
    2,
    "FD",
  );

  pdfSetFillColor(
    pdf,
    EVALUATION_PDF_THEME.green,
  );

  pdf.rect(
    15,
    agentY,
    1.2,
    29,
    "F",
  );

  pdf.setFontSize(7);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.muted,
  );

  pdf.text(
    "AGENT ÉVALUÉ",
    21,
    agentY + 7,
  );

  pdf.setFontSize(13.5);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.ink,
  );

  pdf.text(
    normalizeExportText(
      evaluation.agentSnapshot.fullName,
    ),
    21,
    agentY + 15,
  );

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(8);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.muted,
  );

  pdf.text(
    `${normalizeExportText(evaluation.agentSnapshot.jobTitle)} · ${normalizeExportText(evaluation.agentSnapshot.matricule)}`,
    21,
    agentY + 22,
  );

  pdfSetDrawColor(
    pdf,
    EVALUATION_PDF_THEME.gold,
  );

  pdf.setLineWidth(0.65);

  pdf.line(
    21,
    agentY + 25.6,
    41,
    agentY + 25.6,
  );

  // 6 repères
  const metaY =
    agentY + 37;

  const meta = [
    [
      "Direction",
      evaluation.agentSnapshot.directionName ??
        "Rattachement à régulariser",
    ],
    [
      "Service",
      evaluation.agentSnapshot.serviceName ??
        "Aucun service précisé",
    ],
    [
      "Risque RH",
      riskLabels[
        evaluation.intelligence.riskLevel
      ],
    ],
    [
      "Potentiel",
      potentialLabels[
        evaluation.intelligence.potentialLevel
      ],
    ],
    [
      "Fiabilité",
      confidenceLabels[
        evaluation.intelligence.dataConfidence
      ],
    ],
    [
      "Statut",
      statusLabels[
        evaluation.status
      ],
    ],
  ] as Array<[string, string]>;

  const cardGap = 3;
  const cardWidth =
    (
      180 -
      cardGap * 2
    ) /
    3;

  meta.forEach(
    (
      [
        label,
        value,
      ],
      index,
    ) => {
      const row =
        Math.floor(
          index / 3,
        );

      const column =
        index % 3;

      const x =
        15 +
        column *
          (
            cardWidth +
            cardGap
          );

      const y =
        metaY +
        row * 20;

      pdfSetFillColor(
        pdf,
        index === 0 || index === 3
          ? EVALUATION_PDF_THEME.greenSoft
          : EVALUATION_PDF_THEME.white,
      );

      pdfSetDrawColor(
        pdf,
        EVALUATION_PDF_THEME.line,
      );

      pdf.roundedRect(
        x,
        y,
        cardWidth,
        17,
        0,
        1.8,
        "FD",
      );

      pdf.setFont(
        "helvetica",
        "bold",
      );

      pdf.setFontSize(6.4);
      pdfSetTextColor(
        pdf,
        EVALUATION_PDF_THEME.muted,
      );

      pdf.text(
        label.toUpperCase(),
        x + 3,
        y + 5,
      );

      pdf.setFontSize(7.8);
      pdfSetTextColor(
        pdf,
        EVALUATION_PDF_THEME.ink,
      );

      const lines =
        pdf.splitTextToSize(
          normalizeExportText(
            value,
          ),
          cardWidth - 6,
        );

      pdf.text(
        lines.slice(
          0,
          2,
        ),
        x + 3,
        y + 10,
        {
          lineHeightFactor: 1.25,
        },
      );
    },
  );

  // Lecture synthétique
  const insightY =
    metaY + 43;

  const insight =
    normalizeExportText(
      evaluation.intelligence.hrExecutiveBrief ||
      getExportScoreDescription(
        evaluation.finalScore,
      ),
    );

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(8.2);

  const insightLines =
    pdf.splitTextToSize(
      insight,
      168,
    );

  const insightHeight =
    Math.max(
      21,
      10 +
        insightLines.length *
          3.8,
    );

  pdfSetFillColor(
    pdf,
    EVALUATION_PDF_THEME.white,
  );

  pdfSetDrawColor(
    pdf,
    EVALUATION_PDF_THEME.line,
  );

  pdf.roundedRect(
    15,
    insightY,
    180,
    insightHeight,
    0,
    2,
    "FD",
  );

  pdfSetFillColor(
    pdf,
    primary,
  );

  pdf.rect(
    15,
    insightY,
    2,
    insightHeight,
    "F",
  );

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(6.5);
  pdfSetTextColor(
    pdf,
    primary,
  );

  pdf.text(
    "LECTURE SYNTHÉTIQUE",
    21,
    insightY + 6,
  );

  pdfSetDrawColor(
    pdf,
    EVALUATION_PDF_THEME.gold,
  );

  pdf.setLineWidth(0.55);

  pdf.line(
    21,
    insightY + 8,
    43,
    insightY + 8,
  );

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(8);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.text,
  );

  pdf.text(
    insightLines,
    21,
    insightY + 12,
    {
      lineHeightFactor: 1.35,
    },
  );

  // Mention confidentielle
  const confidentialY =
    Math.min(
      282,
      insightY +
        insightHeight +
        17,
    );

  pdfSetDrawColor(
    pdf,
    EVALUATION_PDF_THEME.lineStrong,
  );

  pdf.line(
    15,
    confidentialY - 6,
    195,
    confidentialY - 6,
  );

  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(6.6);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.gold,
  );

  pdf.text(
    "DOCUMENT CONFIDENTIEL RH",
    15,
    confidentialY,
  );

  pdf.setFont(
    "helvetica",
    "normal",
  );

  pdf.setFontSize(6.5);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.muted,
  );

  pdf.text(
    "Diffusion limitée aux personnes habilitées dans le cadre du processus d’évaluation.",
    195,
    confidentialY,
    {
      align: "right",
    },
  );
}

function pdfDrawToc(
  pdf: any,
  cursor: EvaluationPdfCursor,
  evaluation: Evaluation,
): void {
  pdf.setFont(
    "helvetica",
    "bold",
  );

  pdf.setFontSize(7.2);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.green,
  );

  pdf.text(
    "STRUCTURE DU DOCUMENT",
    15,
    cursor.y,
  );

  cursor.y += 7;

  pdf.setFontSize(21);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.navy,
  );

  pdf.text(
    "Sommaire",
    15,
    cursor.y,
  );

  // Score compact à droite
  pdfSetFillColor(
    pdf,
    EVALUATION_PDF_THEME.greenSoft,
  );

  pdfSetDrawColor(
    pdf,
    EVALUATION_PDF_THEME.line,
  );

  pdf.roundedRect(
    161,
    cursor.y - 10,
    34,
    16,
    0,
    2,
    "FD",
  );

  pdfSetFillColor(
    pdf,
    EVALUATION_PDF_THEME.gold,
  );

  pdf.rect(
    161,
    cursor.y - 10,
    34,
    0.8,
    "F",
  );

  pdf.setFontSize(6);
  pdfSetTextColor(
    pdf,
    EVALUATION_PDF_THEME.green,
  );

  pdf.text(
    "SCORE",
    165,
    cursor.y - 5,
  );

  pdf.setFontSize(12);
  pdf.text(
    `${evaluation.finalScore}/100`,
    178,
    cursor.y + 1,
    {
      align: "center",
    },
  );

  cursor.y += 8;

  pdfWrappedText(
    pdf,
    cursor,
    "Parcours de lecture conçu pour faciliter l’analyse RH, l’entretien hiérarchique et la décision finale.",
    {
      fontSize: 8.4,
      color: EVALUATION_PDF_THEME.muted,
      width: 140,
      after: 4,
    },
  );

  const items =
    buildEvaluationTocItems(
      evaluation,
    );

  const gap = 5;
  const columnWidth =
    (
      180 -
      gap
    ) /
    2;

  for (
    let index = 0;
    index < items.length;
    index += 2
  ) {
    const left =
      items[index];

    const right =
      items[
        index + 1
      ];

    const rowItems = [
      left,
      right,
    ].filter(Boolean);

    let rowHeight = 12;

    rowItems.forEach(
      (item) => {
        pdf.setFontSize(8.2);

        const lines =
          pdf.splitTextToSize(
            normalizeExportText(
              item,
            ),
            columnWidth - 17,
          );

        rowHeight =
          Math.max(
            rowHeight,
            6 +
              lines.length *
                3.7,
          );
      },
    );

    pdfEnsureSpace(
      pdf,
      cursor,
      rowHeight + 2,
    );

    [
      left,
      right,
    ].forEach(
      (
        item,
        columnIndex,
      ) => {
        if (!item) {
          return;
        }

        const x =
          15 +
          columnIndex *
            (
              columnWidth +
              gap
            );

        pdfSetDrawColor(
          pdf,
          EVALUATION_PDF_THEME.line,
        );

        pdf.line(
          x,
          cursor.y +
            rowHeight,
          x +
            columnWidth,
          cursor.y +
            rowHeight,
        );

        pdfSetFillColor(
          pdf,
          EVALUATION_PDF_THEME.white,
        );

        pdfSetDrawColor(
          pdf,
          EVALUATION_PDF_THEME.lineStrong,
        );

        pdf.roundedRect(
          x,
          cursor.y + 1,
          11,
          8,
          0,
          1.8,
          "FD",
        );

        pdf.setFont(
          "helvetica",
          "bold",
        );

        pdf.setFontSize(6.8);
        pdfSetTextColor(
          pdf,
          EVALUATION_PDF_THEME.green,
        );

        pdf.text(
          String(
            index +
              columnIndex +
              1,
          ).padStart(
            2,
            "0",
          ),
          x + 5.5,
          cursor.y + 6.2,
          {
            align: "center",
          },
        );

        pdf.setFontSize(8.2);
        pdfSetTextColor(
          pdf,
          EVALUATION_PDF_THEME.ink,
        );

        const lines =
          pdf.splitTextToSize(
            normalizeExportText(
              item,
            ),
            columnWidth - 17,
          );

        pdf.text(
          lines,
          x + 15,
          cursor.y + 5.5,
          {
            lineHeightFactor: 1.28,
          },
        );
      },
    );

    cursor.y +=
      rowHeight + 2;
  }

  cursor.y += 4;

  // Repères HRS
  const markers = [
    [
      "Objectifs",
      evaluation.intelligence.objectiveIndex,
    ],
    [
      "Assiduité",
      evaluation.intelligence.attendanceIndex,
    ],
    [
      "Fiabilité",
      evaluation.intelligence.reliabilityIndex,
    ],
    [
      "Constance",
      evaluation.intelligence.consistencyIndex,
    ],
  ] as Array<[string, number]>;

  const markerGap = 3;
  const markerWidth =
    (
      180 -
      markerGap * 3
    ) /
    4;

  pdfEnsureSpace(
    pdf,
    cursor,
    18,
  );

  markers.forEach(
    (
      [
        label,
        value,
      ],
      index,
    ) => {
      const x =
        15 +
        index *
          (
            markerWidth +
            markerGap
          );

      pdfSetFillColor(
        pdf,
        EVALUATION_PDF_THEME.white,
      );

      pdfSetDrawColor(
        pdf,
        EVALUATION_PDF_THEME.line,
      );

      pdf.roundedRect(
        x,
        cursor.y,
        markerWidth,
        15,
        0,
        1.8,
        "FD",
      );

      pdf.setFont(
        "helvetica",
        "bold",
      );

      pdf.setFontSize(6.3);
      pdfSetTextColor(
        pdf,
        EVALUATION_PDF_THEME.muted,
      );

      pdf.text(
        label.toUpperCase(),
        x + 3,
        cursor.y + 5,
      );

      pdf.setFontSize(8.5);
      pdfSetTextColor(
        pdf,
        EVALUATION_PDF_THEME.green,
      );

      pdf.text(
        `${value} / 100`,
        x + 3,
        cursor.y + 11,
      );
    },
  );

  cursor.y += 21;
}

async function pdfAutoTable(
  autoTable: any,
  pdf: any,
  cursor: EvaluationPdfCursor,
  options: any,
): Promise<void> {
  autoTable(
    pdf,
    {
      startY: cursor.y,
      margin: {
        left: 15,
        right: 15,
        top: 15,
        bottom: 15,
      },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8,
        textColor:
          pdfHexToRgb(
            EVALUATION_PDF_THEME.ink,
          ),
        lineColor:
          pdfHexToRgb(
            EVALUATION_PDF_THEME.lineStrong,
          ),
        lineWidth: 0.2,
        cellPadding: 2.2,
        valign: "middle",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor:
          pdfHexToRgb(
            EVALUATION_PDF_THEME.navy,
          ),
        textColor: [
          255,
          255,
          255,
        ],
        fontStyle: "bold",
        lineColor:
          pdfHexToRgb(
            EVALUATION_PDF_THEME.navy,
          ),
      },
      alternateRowStyles: {
        fillColor:
          pdfHexToRgb(
            EVALUATION_PDF_THEME.greenSoft,
          ),
      },
      didDrawCell: (data: any) => {
        if (
          data.section === "head"
        ) {
          pdfSetDrawColor(
            pdf,
            EVALUATION_PDF_THEME.gold,
          );

          pdf.setLineWidth(0.35);

          pdf.line(
            data.cell.x,
            data.cell.y +
              data.cell.height,
            data.cell.x +
              data.cell.width,
            data.cell.y +
              data.cell.height,
          );
        }
      },
      rowPageBreak: "avoid",
      showHead: "everyPage",
      ...options,
    },
  );

  const finalY =
    (
      pdf as any
    ).lastAutoTable
      ?.finalY;

  cursor.y =
    typeof finalY ===
      "number"
      ? finalY + 5
      : cursor.y + 10;
}

async function downloadEvaluationPdf(
  evaluation: Evaluation,
): Promise<void> {
  const { jsPDF } =
    await import("jspdf");

  const autoTableModule =
    await import(
      "jspdf-autotable"
    );

  const autoTable =
    autoTableModule.default;

  const pdf =
    new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
      putOnlyUsedFonts: true,
    });

  pdf.setProperties({
    title: evaluation.title,
    subject: `${evaluation.reference} — Évaluation professionnelle`,
    author:
      evaluation.agentSnapshot.fullName,
    creator: "FADES-RH",
    keywords:
      "évaluation professionnelle, RH, FADES",
  });

  const cursor: EvaluationPdfCursor = {
    y: 15,
  };

  const snapshot =
    evaluation.performanceSnapshot;

  // ----------------------------------------------------------------
  // PAGE 1 — Couverture
  // ----------------------------------------------------------------
  pdfDrawCover(
    pdf,
    evaluation,
  );

  // ----------------------------------------------------------------
  // PAGE 2 — Sommaire puis démarrage du corps si l'espace le permet.
  // ----------------------------------------------------------------
  pdfAddPage(
    pdf,
    cursor,
  );

  pdfDrawToc(
    pdf,
    cursor,
    evaluation,
  );

  // ----------------------------------------------------------------
  // 01 — Informations générales
  // ----------------------------------------------------------------
  pdfSectionTitle(
    pdf,
    cursor,
    evaluation,
    "Informations générales",
  );

  await pdfAutoTable(
    autoTable,
    pdf,
    cursor,
    {
      body: [
        [
          "Agent évalué",
          `${evaluation.agentSnapshot.fullName} · ${evaluation.agentSnapshot.jobTitle} · ${evaluation.agentSnapshot.matricule}`,
        ],
        [
          "Rattachement",
          `${evaluation.agentSnapshot.directionName ?? "Rattachement à régulariser"} · ${evaluation.agentSnapshot.serviceName ?? "Aucun service précisé"}`,
        ],
        [
          "Période évaluée",
          `${formatDate(evaluation.periodStartDate)} — ${formatDate(evaluation.periodEndDate)}`,
        ],
        [
          "Année",
          String(
            evaluation.evaluationYear,
          ),
        ],
        [
          "Statut",
          statusLabels[
            evaluation.status
          ],
        ],
        [
          "Référence",
          evaluation.reference,
        ],
      ],
      columnStyles: {
        0: {
          cellWidth: 52,
          fontStyle: "bold",
          textColor:
            pdfHexToRgb(
              EVALUATION_PDF_THEME.green,
            ),
          fillColor:
            pdfHexToRgb(
              EVALUATION_PDF_THEME.greenSoft,
            ),
        },
        1: {
          cellWidth: 128,
        },
      },
    },
  );

  // ----------------------------------------------------------------
  // 02 — Synthèse exécutive
  // ----------------------------------------------------------------
  pdfSectionTitle(
    pdf,
    cursor,
    evaluation,
    "Synthèse exécutive",
  );

  pdfInfoBox(
    pdf,
    cursor,
    evaluation.executiveSummary,
    {
      fill: EVALUATION_PDF_THEME.soft,
      border: EVALUATION_PDF_THEME.line,
      accent:
        undefined,
      fontSize: 9.2,
    },
  );

  // ----------------------------------------------------------------
  // 03 — Lecture HRS
  // ----------------------------------------------------------------
  pdfSectionTitle(
    pdf,
    cursor,
    evaluation,
    "Lecture HRS intelligente",
  );

  pdfWrappedText(
    pdf,
    cursor,
    evaluation.intelligence.hrExecutiveBrief,
    {
      fontSize: 9,
      color:
        EVALUATION_PDF_THEME.text,
      after: 3,
    },
  );

  await pdfAutoTable(
    autoTable,
    pdf,
    cursor,
    {
      body: [
        [
          "Niveau de risque",
          riskLabels[
            evaluation.intelligence.riskLevel
          ],
        ],
        [
          "Potentiel RH",
          potentialLabels[
            evaluation.intelligence.potentialLevel
          ],
        ],
        [
          "Fiabilité des données",
          confidenceLabels[
            evaluation.intelligence.dataConfidence
          ],
        ],
        [
          "Décision suggérée",
          decisionLabels[
            evaluation.intelligence.recommendedDecision
          ],
        ],
        [
          "Indice objectifs",
          `${evaluation.intelligence.objectiveIndex} / 100`,
        ],
        [
          "Indice assiduité",
          `${evaluation.intelligence.attendanceIndex} / 100`,
        ],
        [
          "Indice fiabilité",
          `${evaluation.intelligence.reliabilityIndex} / 100`,
        ],
        [
          "Indice constance",
          `${evaluation.intelligence.consistencyIndex} / 100`,
        ],
        [
          "Priorité RH",
          evaluation.intelligence.developmentPriority,
        ],
      ],
      columnStyles: {
        0: {
          cellWidth: 58,
          fontStyle: "bold",
          textColor:
            pdfHexToRgb(
              EVALUATION_PDF_THEME.green,
            ),
          fillColor:
            pdfHexToRgb(
              EVALUATION_PDF_THEME.greenSoft,
            ),
        },
        1: {
          cellWidth: 122,
        },
      },
    },
  );

  // ----------------------------------------------------------------
  // 04 — Note d'aide à la décision
  // ----------------------------------------------------------------
  pdfSectionTitle(
    pdf,
    cursor,
    evaluation,
    "Note d’aide à la décision",
  );

  pdfInfoBox(
    pdf,
    cursor,
    evaluation.intelligence.directorGeneralBrief,
    {
      fill: EVALUATION_PDF_THEME.white,
      border: EVALUATION_PDF_THEME.lineStrong,
      accent:
        EVALUATION_PDF_THEME.gold,
      fontSize: 9.2,
    },
  );

  // ----------------------------------------------------------------
  // 05 — Données RH
  // ----------------------------------------------------------------
  pdfSectionTitle(
    pdf,
    cursor,
    evaluation,
    "Données RH exploitées automatiquement",
  );

  await pdfAutoTable(
    autoTable,
    pdf,
    cursor,
    {
      body: [
        [
          "Tâches terminées",
          `${snapshot.tasksCompleted} / ${snapshot.tasksTotal}`,
        ],
        [
          "Tâches non terminées",
          String(
            snapshot.tasksNotCompleted,
          ),
        ],
        [
          "Taux de réalisation des tâches",
          `${snapshot.taskCompletionRate} %`,
        ],
        [
          "Progression moyenne des tâches",
          `${snapshot.averageTaskProgress} %`,
        ],
        [
          "Feuille de route réalisée",
          `${snapshot.roadmapProgress ?? 0} %`,
        ],
        [
          "Feuille de route",
          `${snapshot.roadmapCompletedItems} / ${snapshot.roadmapTotalItems} élément(s)`,
        ],
        [
          "Reste feuille de route",
          String(
            snapshot.roadmapRemainingItems,
          ),
        ],
        [
          "Jours ouvrés évalués",
          String(
            snapshot.workingDaysExpected,
          ),
        ],
        [
          "Absences non couvertes",
          `${formatDayCount(snapshot.absentDays)} j`,
        ],
        [
          "Congés approuvés neutralisés",
          `${formatDayCount(snapshot.leaveCoveredWorkdays)} j`,
        ],
        [
          "Jours sans pointage non couverts",
          `${formatDayCount(snapshot.unrecordedWorkdays)} j`,
        ],
        [
          "Retard cumulé",
          `${snapshot.lateMinutes} minute(s)`,
        ],
        [
          "Heures supplémentaires",
          formatMinutes(
            snapshot.overtimeMinutes,
          ),
        ],
      ],
      columnStyles: {
        0: {
          cellWidth: 66,
          fontStyle: "bold",
          fillColor:
            pdfHexToRgb(
              EVALUATION_PDF_THEME.greenSoft,
            ),
        },
        1: {
          cellWidth: 114,
        },
      },
    },
  );

  if (
    snapshot.automaticDataSummary
      ?.length
  ) {
    pdfBulletList(
      pdf,
      cursor,
      snapshot.automaticDataSummary,
      {
        label:
          "Synthèse automatique",
      },
    );
  }

  // ----------------------------------------------------------------
  // 06 — Congés
  // ----------------------------------------------------------------
  pdfSectionTitle(
    pdf,
    cursor,
    evaluation,
    "Congés et absences autorisées",
  );

  await pdfAutoTable(
    autoTable,
    pdf,
    cursor,
    {
      body: [
        [
          "Demandes recensées",
          `${snapshot.leaveRequestsTotal} · ${snapshot.leaveDraftRequests} brouillon(s)`,
        ],
        [
          "Jours demandés",
          `${formatDayCount(snapshot.leaveRequestedDays)} j`,
        ],
        [
          "Demandes approuvées",
          String(
            snapshot.leaveApprovedRequests,
          ),
        ],
        [
          "Jours approuvés",
          `${formatDayCount(snapshot.leaveApprovedDays)} j`,
        ],
        [
          "En validation",
          `${snapshot.leaveSubmittedRequests + snapshot.leaveManagerApprovedRequests} · ${formatDayCount(snapshot.leavePendingDays)} j`,
        ],
        [
          "Demandes refusées",
          `${snapshot.leaveRejectedRequests} · ${formatDayCount(snapshot.leaveRejectedDays)} j`,
        ],
        [
          "Demandes annulées",
          `${snapshot.leaveCancelledRequests} · ${formatDayCount(snapshot.leaveCancelledDays)} j`,
        ],
        [
          "Taux d'approbation",
          `${snapshot.leaveApprovalRate} %`,
        ],
        [
          `Solde annuel ${evaluation.evaluationYear}`,
          snapshot.annualLeaveBalanceConfigured
            ? `${formatDayCount(snapshot.annualLeaveAvailableDays)} jour(s) disponible(s)`
            : "Solde non configuré",
        ],
      ],
      columnStyles: {
        0: {
          cellWidth: 62,
          fontStyle: "bold",
          fillColor:
            pdfHexToRgb(
              EVALUATION_PDF_THEME.greenSoft,
            ),
        },
        1: {
          cellWidth: 118,
        },
      },
    },
  );

  if (
    snapshot.annualLeaveBalanceConfigured
  ) {
    pdfThreeColumnCards(
      pdf,
      cursor,
      [
        [
          "Ouverture",
          `${formatDayCount(snapshot.annualLeaveOpeningDays)} j`,
        ],
        [
          "Droits",
          `${formatDayCount(snapshot.annualLeaveEntitledDays)} j`,
        ],
        [
          "Report",
          `${formatDayCount(snapshot.annualLeaveCarriedOverDays)} j`,
        ],
        [
          "Ajustement",
          `${formatDayCount(snapshot.annualLeaveAdjustmentDays)} j`,
        ],
        [
          "Consommés",
          `${formatDayCount(snapshot.annualLeaveConsumedDays)} j`,
        ],
        [
          "Disponible",
          `${formatDayCount(snapshot.annualLeaveAvailableDays)} j`,
        ],
      ],
    );
  }

  const leaveRows =
    (
      snapshot.leaveTypeBreakdown ??
      []
    )
      .filter(
        (item) =>
          item.requestsTotal >
          0,
      )
      .map(
        (item) => [
          leaveTypeLabels[
            item.leaveType
          ],
          String(
            item.requestsTotal,
          ),
          `${formatDayCount(item.requestedDays)} j`,
          String(
            item.approvedRequests,
          ),
          `${formatDayCount(item.approvedDays)} j`,
        ],
      );

  if (
    leaveRows.length
  ) {
    pdfWrappedText(
      pdf,
      cursor,
      "Répartition des congés",
      {
        fontSize: 9,
        color:
          EVALUATION_PDF_THEME.green,
        fontStyle: "bold",
        after: 1.5,
      },
    );

    await pdfAutoTable(
      autoTable,
      pdf,
      cursor,
      {
        head: [
          [
            "Type de congé",
            "Demandes",
            "Jours demandés",
            "Approuvées",
            "Jours approuvés",
          ],
        ],
        body: leaveRows,
        styles: {
          fontSize: 7.4,
          cellPadding: 1.8,
        },
        columnStyles: {
          0: {
            cellWidth: 56,
          },
          1: {
            cellWidth: 26,
            halign: "center",
          },
          2: {
            cellWidth: 34,
            halign: "center",
          },
          3: {
            cellWidth: 29,
            halign: "center",
          },
          4: {
            cellWidth: 35,
            halign: "center",
          },
        },
      },
    );
  }

  // ----------------------------------------------------------------
  // 07 — Grille d'appréciation
  // ----------------------------------------------------------------
  pdfSectionTitle(
    pdf,
    cursor,
    evaluation,
    "Grille d’appréciation",
  );

  const criteriaRows =
    evaluation.criteria.map(
      (criterion) => [
        criterion.label,
        `${criterion.weight} %`,
        `${criterion.finalScore ?? criterion.systemSuggestedScore ?? 0} / 5`,
        [
          criterion.description,
          criterion.scoreBasis,
          ...(criterion.automationDetails ??
            []),
          criterion.comment,
        ]
          .filter(Boolean)
          .map(
            normalizeExportText,
          )
          .join(" — ") ||
          "—",
      ],
    );

  await pdfAutoTable(
    autoTable,
    pdf,
    cursor,
    {
      head: [
        [
          "Critère",
          "Poids",
          "Score",
          "Appréciation / base",
        ],
      ],
      body: criteriaRows,
      styles: {
        fontSize: 7.2,
        cellPadding: 1.7,
      },
      columnStyles: {
        0: {
          cellWidth: 43,
          fontStyle: "bold",
        },
        1: {
          cellWidth: 19,
          halign: "center",
        },
        2: {
          cellWidth: 22,
          halign: "center",
        },
        3: {
          cellWidth: 96,
        },
      },
    },
  );

  // ----------------------------------------------------------------
  // 08 — Liens probants (conditionnel)
  // ----------------------------------------------------------------
  if (
    evaluation.evidenceLinks.length >
    0
  ) {
    pdfSectionTitle(
      pdf,
      cursor,
      evaluation,
      "Liens et éléments probants",
    );

    for (
      const link of evaluation.evidenceLinks
    ) {
      const description =
        link.description
          ? ` — ${link.description}`
          : "";

      pdfWrappedText(
        pdf,
        cursor,
        `${link.title} : ${link.url}${description}`,
        {
          fontSize: 8.6,
          color:
            EVALUATION_PDF_THEME.text,
          after: 1.8,
        },
      );
    }
  }

  // ----------------------------------------------------------------
  // 09 — Forces / alertes / recommandations
  // ----------------------------------------------------------------
  pdfSectionTitle(
    pdf,
    cursor,
    evaluation,
    "Forces, alertes et actions recommandées",
  );

  pdfBulletList(
    pdf,
    cursor,
    evaluation.intelligence.strengths,
    {
      label:
        "Forces observées",
      accent:
        EVALUATION_PDF_THEME.green,
    },
  );

  pdfBulletList(
    pdf,
    cursor,
    evaluation.intelligence.alerts,
    {
      label:
        "Points de vigilance",
      accent:
        EVALUATION_PDF_THEME.gold,
    },
  );

  pdfBulletList(
    pdf,
    cursor,
    evaluation.intelligence.recommendedActions,
    {
      label:
        "Actions RH recommandées",
      accent:
        EVALUATION_PDF_THEME.green,
    },
  );

  pdfBulletList(
    pdf,
    cursor,
    evaluation.intelligence.next90DayPlan,
    {
      label:
        "Plan 90 jours",
      accent:
        EVALUATION_PDF_THEME.gold,
    },
  );

  // ----------------------------------------------------------------
  // 10 — Entretien contradictoire (conditionnel)
  // ----------------------------------------------------------------
  if (
    evaluation.intelligence.managerTalkingPoints
      .length >
      0 ||
    evaluation.intelligence.dataWarnings
      .length >
      0
  ) {
    pdfSectionTitle(
      pdf,
      cursor,
      evaluation,
      "Entretien contradictoire et réserves de lecture",
    );

    pdfBulletList(
      pdf,
      cursor,
      evaluation.intelligence.managerTalkingPoints,
      {
        label:
          "Points à traiter pendant l’entretien",
      },
    );

    pdfBulletList(
      pdf,
      cursor,
      evaluation.intelligence.dataWarnings,
      {
        label:
          "Réserves sur les données",
        accent:
          EVALUATION_PDF_THEME.gold,
      },
    );
  }

  // ----------------------------------------------------------------
  // 11 — Conclusion RH
  // ----------------------------------------------------------------
  pdfSectionTitle(
    pdf,
    cursor,
    evaluation,
    "Conclusion RH",
  );

  pdfInfoBox(
    pdf,
    cursor,
    evaluation.generatedConclusion,
    {
      fill: EVALUATION_PDF_THEME.white,
      border: EVALUATION_PDF_THEME.line,
      accent:
        undefined,
      fontSize: 9.2,
    },
  );

  if (
    evaluation.hrValidation
      ?.finalComment
  ) {
    pdfWrappedText(
      pdf,
      cursor,
      evaluation.hrValidation.finalComment,
      {
        fontSize: 8.8,
        color:
          EVALUATION_PDF_THEME.text,
        after: 3,
      },
    );
  }

  // ----------------------------------------------------------------
  // 12 — Signatures
  // ----------------------------------------------------------------
  pdfSectionTitle(
    pdf,
    cursor,
    evaluation,
    "Signatures",
  );

  pdfEnsureSpace(
    pdf,
    cursor,
    40,
  );

  const signatureGap = 4;
  const signatureWidth =
    (
      180 -
      signatureGap * 2
    ) /
    3;

  const signatures = [
    [
      "Agent évalué",
      "Nom, date, observations et signature",
    ],
    [
      "Responsable hiérarchique",
      "Nom, fonction, date et signature",
    ],
    [
      "Responsable RH / Direction",
      "Décision, date, visa et signature",
    ],
  ];

  signatures.forEach(
    (
      [
        title,
        detail,
      ],
      index,
    ) => {
      const x =
        15 +
        index *
          (
            signatureWidth +
            signatureGap
          );

      pdfSetDrawColor(
        pdf,
        EVALUATION_PDF_THEME.line,
      );

      pdfSetFillColor(
        pdf,
        EVALUATION_PDF_THEME.white,
      );

      pdf.roundedRect(
        x,
        cursor.y,
        signatureWidth,
        34,
        0,
        2,
        "FD",
      );

      pdfSetFillColor(
        pdf,
        EVALUATION_PDF_THEME.navy,
      );

      pdf.rect(
        x,
        cursor.y,
        signatureWidth,
        0.45,
        "F",
      );

      pdfSetFillColor(
        pdf,
        EVALUATION_PDF_THEME.green,
      );

      pdf.rect(
        x,
        cursor.y,
        9,
        0.85,
        "F",
      );

      pdfSetFillColor(
        pdf,
        EVALUATION_PDF_THEME.gold,
      );

      pdf.rect(
        x + 9,
        cursor.y,
        5,
        0.85,
        "F",
      );

      pdf.setFont(
        "helvetica",
        "bold",
      );

      pdf.setFontSize(7.8);
      pdfSetTextColor(
        pdf,
        EVALUATION_PDF_THEME.ink,
      );

      pdf.text(
        title,
        x + 3,
        cursor.y + 7,
        {
          maxWidth:
            signatureWidth - 6,
        },
      );

      pdf.setFont(
        "helvetica",
        "normal",
      );

      pdf.setFontSize(6.7);
      pdfSetTextColor(
        pdf,
        EVALUATION_PDF_THEME.muted,
      );

      pdf.text(
        pdf.splitTextToSize(
          detail,
          signatureWidth - 6,
        ),
        x + 3,
        cursor.y + 13,
        {
          lineHeightFactor: 1.3,
        },
      );
    },
  );

  pdf.save(
    `${safeExportFileName(
      evaluation.reference,
    )}-evaluation.pdf`,
  );
}

/* ------------------------------------------------------------------
   WORD — vrai fichier .docx construit à partir des données
   ------------------------------------------------------------------ */

function getExportScoreDescription(
  score: number,
): string {
  if (score >= 90) {
    return "L’agent démontre une contribution remarquable, stable et supérieure aux attentes du poste.";
  }

  if (score >= 80) {
    return "L’agent présente un niveau de performance solide, fiable et favorable à l’atteinte des objectifs du service.";
  }

  if (score >= 70) {
    return "L’agent satisfait globalement aux attentes, avec des points de consolidation identifiés.";
  }

  if (score >= 60) {
    return "L’agent doit bénéficier d’un accompagnement ciblé afin d’améliorer durablement certains aspects de sa performance.";
  }

  return "La situation requiert un suivi renforcé, des objectifs de redressement clairs et une supervision rapprochée.";
}

function docxParagraph(
  docx: any,
  text: string,
  options: {
    bold?: boolean;
    color?: string;
    size?: number;
    italic?: boolean;
    alignment?: any;
    shading?: string;
    before?: number;
    after?: number;
    keepNext?: boolean;
  } = {},
): any {
  return new docx.Paragraph({
    alignment:
      options.alignment,
    keepNext:
      options.keepNext,
    spacing: {
      before:
        options.before ?? 0,
      after:
        options.after ?? 90,
      line: 260,
    },
    shading:
      options.shading
        ? {
            fill:
              options.shading,
          }
        : undefined,
    children: [
      new docx.TextRun({
        text:
          normalizeExportText(
            text,
          ),
        bold:
          options.bold,
        italics:
          options.italic,
        color:
          options.color ??
          EVALUATION_DOCUMENT_THEME.text,
        size:
          options.size ??
          19,
        font: "Aptos",
      }),
    ],
  });
}

function docxSectionTitle(
  docx: any,
  text: string,
): any {
  const normalized =
    normalizeExportText(
      text,
    );

  const match =
    normalized.match(
      /^(\d{2})\.\s*(.+)$/,
    );

  const number =
    match?.[1] ?? "";

  const title =
    match?.[2] ??
    normalized;

  return new docx.Paragraph({
    keepNext: true,
    spacing: {
      before: 170,
      after: 85,
    },
    border: {
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 5,
        color:
          EVALUATION_DOCUMENT_THEME.border,
        space: 4,
      },
    },
    children: [
      ...(number
        ? [
            new docx.TextRun({
              text: `${number}  `,
              bold: true,
              color:
                EVALUATION_DOCUMENT_THEME.primary,
              size: 20,
              font: "Aptos",
            }),
          ]
        : []),
      new docx.TextRun({
        text:
          title.toUpperCase(),
        bold: true,
        color:
          EVALUATION_DOCUMENT_THEME.navy,
        size: 19,
        font: "Aptos",
      }),
    ],
  });
}

function docxNumberedSectionTitle(
  docx: any,
  evaluation: Evaluation,
  title: string,
): any {
  return docxSectionTitle(
    docx,
    getEvaluationSectionLabel(
      evaluation,
      title,
    ),
  );
}

function docxCell(
  docx: any,
  text: string,
  options: {
    fill?: string;
    bold?: boolean;
    color?: string;
    size?: number;
    alignment?: any;
    widthPercent?: number;
  } = {},
): any {
  return new docx.TableCell({
    width:
      options.widthPercent
        ? {
            size:
              options.widthPercent,
            type:
              docx.WidthType.PERCENTAGE,
          }
        : undefined,
    verticalAlign:
      docx.VerticalAlign.CENTER,
    shading: {
      fill:
        options.fill ??
        EVALUATION_DOCUMENT_THEME.white,
    },
    margins: {
      top: 85,
      right: 90,
      bottom: 85,
      left: 90,
    },
    children: [
      docxParagraph(
        docx,
        text,
        {
          bold:
            options.bold,
          color:
            options.color ??
            EVALUATION_DOCUMENT_THEME.ink,
          size:
            options.size ??
            16,
          alignment:
            options.alignment,
          after: 0,
        },
      ),
    ],
  });
}

function docxSpacer(
  docx: any,
  after = 70,
): any {
  return new docx.Paragraph({
    spacing: {
      after,
    },
    children: [
      new docx.TextRun({
        text: "",
      }),
    ],
  });
}

function docxCoverHeaderTable(
  docx: any,
  evaluation: Evaluation,
): any {
  return new docx.Table({
    width: {
      size: 100,
      type:
        docx.WidthType.PERCENTAGE,
    },
    rows: [
      new docx.TableRow({
        cantSplit: true,
        children: [
          new docx.TableCell({
            width: {
              size: 70,
              type:
                docx.WidthType.PERCENTAGE,
            },
            margins: {
              top: 50,
              right: 70,
              bottom: 70,
              left: 0,
            },
            children: [
              new docx.Paragraph({
                spacing: {
                  after: 0,
                },
                children: [
                  new docx.TextRun({
                    text: "FADES-RH",
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.primary,
                    size: 15,
                    font: "Aptos",
                  }),
                  new docx.TextRun({
                    text:
                      "  ·  ÉVALUATION PROFESSIONNELLE",
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.navy,
                    size: 14,
                    font: "Aptos",
                  }),
                ],
              }),
            ],
          }),
          new docx.TableCell({
            width: {
              size: 30,
              type:
                docx.WidthType.PERCENTAGE,
            },
            margins: {
              top: 50,
              right: 0,
              bottom: 70,
              left: 70,
            },
            children: [
              docxParagraph(
                docx,
                evaluation.reference,
                {
                  bold: true,
                  color:
                    EVALUATION_DOCUMENT_THEME.text,
                  size: 13,
                  alignment:
                    docx.AlignmentType.RIGHT,
                  after: 0,
                },
              ),
            ],
          }),
        ],
      }),
    ],
    borders: {
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 9,
        color:
          EVALUATION_DOCUMENT_THEME.navy,
      },
      top: {
        style:
          docx.BorderStyle.SINGLE,
        size: 2,
        color:
          EVALUATION_DOCUMENT_THEME.gold,
      },
      left: {
        style:
          docx.BorderStyle.NIL,
        size: 0,
        color:
          EVALUATION_DOCUMENT_THEME.white,
      },
      right: {
        style:
          docx.BorderStyle.NIL,
        size: 0,
        color:
          EVALUATION_DOCUMENT_THEME.white,
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.NIL,
        size: 0,
        color:
          EVALUATION_DOCUMENT_THEME.white,
      },
      insideVertical: {
        style:
          docx.BorderStyle.NIL,
        size: 0,
        color:
          EVALUATION_DOCUMENT_THEME.white,
      },
    },
  });
}

function docxMetaGrid(
  docx: any,
  items: Array<
    [
      string,
      string,
    ]
  >,
): any {
  const rows: any[] = [];

  for (
    let index = 0;
    index < items.length;
    index += 2
  ) {
    const rowItems =
      items.slice(
        index,
        index + 2,
      );

    while (
      rowItems.length < 2
    ) {
      rowItems.push(
        [
          "",
          "",
        ],
      );
    }

    rows.push(
      new docx.TableRow({
        cantSplit: true,
        children: rowItems.map(
          (
            [
              label,
              value,
            ],
          ) =>
            new docx.TableCell({
              width: {
                size: 50,
                type:
                  docx.WidthType.PERCENTAGE,
              },
              shading: {
                fill:
                  EVALUATION_DOCUMENT_THEME.white,
              },
              margins: {
                top: 80,
                right: 100,
                bottom: 80,
                left: 100,
              },
              children: [
                docxParagraph(
                  docx,
                  label,
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.primary,
                    size: 12,
                    after: 28,
                  },
                ),
                docxParagraph(
                  docx,
                  value,
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.ink,
                    size: 15,
                    after: 0,
                  },
                ),
              ],
            }),
        ),
      }),
    );
  }

  return new docx.Table({
    width: {
      size: 100,
      type:
        docx.WidthType.PERCENTAGE,
    },
    rows,
    borders: {
      top: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      left: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      right: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideVertical: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
    },
  });
}

function docxMetricStrip(
  docx: any,
  items: Array<
    [
      string,
      string,
    ]
  >,
): any {
  return new docx.Table({
    width: {
      size: 100,
      type:
        docx.WidthType.PERCENTAGE,
    },
    rows: [
      new docx.TableRow({
        cantSplit: true,
        children: items.map(
          (
            [
              label,
              value,
            ],
          ) =>
            new docx.TableCell({
              width: {
                size:
                  100 /
                  items.length,
                type:
                  docx.WidthType.PERCENTAGE,
              },
              shading: {
                fill:
                  EVALUATION_DOCUMENT_THEME.white,
              },
              margins: {
                top: 75,
                right: 65,
                bottom: 75,
                left: 65,
              },
              children: [
                docxParagraph(
                  docx,
                  label,
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.text,
                    size: 11,
                    alignment:
                      docx.AlignmentType.CENTER,
                    after: 25,
                  },
                ),
                docxParagraph(
                  docx,
                  value,
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.primary,
                    size: 17,
                    alignment:
                      docx.AlignmentType.CENTER,
                    after: 0,
                  },
                ),
              ],
            }),
        ),
      }),
    ],
    borders: {
      top: {
        style:
          docx.BorderStyle.SINGLE,
        size: 5,
        color:
          EVALUATION_DOCUMENT_THEME.gold,
      },
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      left: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      right: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideVertical: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
    },
  });
}

function docxCallout(
  docx: any,
  text: string,
  options: {
    label?: string;
    accent?: "green" | "gold" | "navy";
  } = {},
): any {
  const accent =
    options.accent === "gold"
      ? EVALUATION_DOCUMENT_THEME.gold
      : options.accent === "navy"
        ? EVALUATION_DOCUMENT_THEME.navy
        : EVALUATION_DOCUMENT_THEME.primary;

  const children: any[] = [];

  if (
    options.label
  ) {
    children.push(
      docxParagraph(
        docx,
        options.label,
        {
          bold: true,
          color: accent,
          size: 12,
          after: 35,
        },
      ),
    );
  }

  children.push(
    docxParagraph(
      docx,
      text,
      {
        color:
          EVALUATION_DOCUMENT_THEME.text,
        size: 17,
        after: 0,
      },
    ),
  );

  return new docx.Table({
    width: {
      size: 100,
      type:
        docx.WidthType.PERCENTAGE,
    },
    rows: [
      new docx.TableRow({
        cantSplit: true,
        children: [
          new docx.TableCell({
            shading: {
              fill:
                EVALUATION_DOCUMENT_THEME.white,
            },
            margins: {
              top: 100,
              right: 120,
              bottom: 100,
              left: 125,
            },
            borders: {
              left: {
                style:
                  docx.BorderStyle.SINGLE,
                size: 18,
                color: accent,
              },
              top: {
                style:
                  docx.BorderStyle.SINGLE,
                size: 3,
                color:
                  EVALUATION_DOCUMENT_THEME.border,
              },
              bottom: {
                style:
                  docx.BorderStyle.SINGLE,
                size: 3,
                color:
                  EVALUATION_DOCUMENT_THEME.border,
              },
              right: {
                style:
                  docx.BorderStyle.SINGLE,
                size: 3,
                color:
                  EVALUATION_DOCUMENT_THEME.border,
              },
            },
            children,
          }),
        ],
      }),
    ],
    borders: {
      top: {
        style:
          docx.BorderStyle.NIL,
        size: 0,
        color:
          EVALUATION_DOCUMENT_THEME.white,
      },
      bottom: {
        style:
          docx.BorderStyle.NIL,
        size: 0,
        color:
          EVALUATION_DOCUMENT_THEME.white,
      },
      left: {
        style:
          docx.BorderStyle.NIL,
        size: 0,
        color:
          EVALUATION_DOCUMENT_THEME.white,
      },
      right: {
        style:
          docx.BorderStyle.NIL,
        size: 0,
        color:
          EVALUATION_DOCUMENT_THEME.white,
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.NIL,
        size: 0,
        color:
          EVALUATION_DOCUMENT_THEME.white,
      },
      insideVertical: {
        style:
          docx.BorderStyle.NIL,
        size: 0,
        color:
          EVALUATION_DOCUMENT_THEME.white,
      },
    },
  });
}

function docxSubsectionHeading(
  docx: any,
  text: string,
): any {
  return new docx.Paragraph({
    keepNext: true,
    spacing: {
      before: 90,
      after: 50,
    },
    children: [
      new docx.TextRun({
        text:
          normalizeExportText(
            text,
          ),
        bold: true,
        color:
          EVALUATION_DOCUMENT_THEME.navy,
        size: 17,
        font: "Aptos",
      }),
    ],
  });
}

function docxTwoColumnListPanel(
  docx: any,
  left: {
    title: string;
    items: string[];
  },
  right: {
    title: string;
    items: string[];
  },
): any {
  const makePanelCell = (
    panel: {
      title: string;
      items: string[];
    },
  ): any =>
    new docx.TableCell({
      width: {
        size: 50,
        type:
          docx.WidthType.PERCENTAGE,
      },
      shading: {
        fill:
          EVALUATION_DOCUMENT_THEME.white,
      },
      margins: {
        top: 95,
        right: 110,
        bottom: 95,
        left: 110,
      },
      children: [
        docxSubsectionHeading(
          docx,
          panel.title,
        ),
        ...docxList(
          docx,
          panel.items,
        ),
      ],
    });

  return new docx.Table({
    width: {
      size: 100,
      type:
        docx.WidthType.PERCENTAGE,
    },
    rows: [
      new docx.TableRow({
        cantSplit: true,
        children: [
          makePanelCell(left),
          makePanelCell(right),
        ],
      }),
    ],
    borders: {
      top: {
        style:
          docx.BorderStyle.SINGLE,
        size: 5,
        color:
          EVALUATION_DOCUMENT_THEME.gold,
      },
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      left: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      right: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideVertical: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
    },
  });
}

function docxEvidenceTable(
  docx: any,
  links: Evaluation["evidenceLinks"],
): any {
  return new docx.Table({
    width: {
      size: 100,
      type:
        docx.WidthType.PERCENTAGE,
    },
    rows: [
      new docx.TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          docxCell(
            docx,
            "Élément",
            {
              widthPercent: 30,
              fill:
                EVALUATION_DOCUMENT_THEME.navy,
              bold: true,
              color:
                EVALUATION_DOCUMENT_THEME.white,
            },
          ),
          docxCell(
            docx,
            "Lien / description",
            {
              widthPercent: 70,
              fill:
                EVALUATION_DOCUMENT_THEME.navy,
              bold: true,
              color:
                EVALUATION_DOCUMENT_THEME.white,
            },
          ),
        ],
      }),
      ...links.map(
        (
          link,
          index,
        ) =>
          new docx.TableRow({
            cantSplit: true,
            children: [
              docxCell(
                docx,
                link.title,
                {
                  widthPercent: 30,
                  fill:
                    index % 2 === 0
                      ? EVALUATION_DOCUMENT_THEME.white
                      : EVALUATION_DOCUMENT_THEME.greenSoft,
                  bold: true,
                  color:
                    EVALUATION_DOCUMENT_THEME.ink,
                },
              ),
              docxCell(
                docx,
                `${link.url}${link.description ? ` — ${link.description}` : ""}`,
                {
                  widthPercent: 70,
                  fill:
                    index % 2 === 0
                      ? EVALUATION_DOCUMENT_THEME.white
                      : EVALUATION_DOCUMENT_THEME.greenSoft,
                  color:
                    EVALUATION_DOCUMENT_THEME.text,
                },
              ),
            ],
          }),
      ),
    ],
    borders: {
      top: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      left: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      right: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideVertical: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
    },
  });
}

function docxPairTable(
  docx: any,
  rows: Array<
    [
      string,
      string,
    ]
  >,
): any {
  return new docx.Table({
    width: {
      size: 100,
      type:
        docx.WidthType.PERCENTAGE,
    },
    rows: rows.map(
      (
        [
          label,
          value,
        ],
      ) =>
        new docx.TableRow({
          cantSplit: true,
          children: [
            docxCell(
              docx,
              label,
              {
                widthPercent: 38,
                fill:
                  EVALUATION_DOCUMENT_THEME.greenSoft,
                bold: true,
                color:
                  EVALUATION_DOCUMENT_THEME.primary,
              },
            ),
            docxCell(
              docx,
              value,
              {
                widthPercent: 62,
                fill:
                  EVALUATION_DOCUMENT_THEME.white,
                color:
                  EVALUATION_DOCUMENT_THEME.ink,
              },
            ),
          ],
        }),
    ),
    borders: {
      top: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      left: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      right: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideVertical: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
    },
  });
}

function docxList(
  docx: any,
  items: string[],
): any[] {
  return items
    .filter(Boolean)
    .map(
      (item) =>
        new docx.Paragraph({
          bullet: {
            level: 0,
          },
          spacing: {
            after: 70,
            line: 260,
          },
          children: [
            new docx.TextRun({
              text:
                normalizeExportText(
                  item,
                ),
              font: "Aptos",
              size: 17,
              color: EVALUATION_DOCUMENT_THEME.text,
            }),
          ],
        }),
    );
}

function docxPageBreak(
  docx: any,
): any {
  return new docx.Paragraph({
    children: [
      new docx.PageBreak(),
    ],
  });
}

function docxCoverSummaryTable(
  docx: any,
  evaluation: Evaluation,
): any {
  const items: Array<[string, string]> = [
    [
      "Direction",
      evaluation.agentSnapshot.directionName ??
        "Rattachement à régulariser",
    ],
    [
      "Service",
      evaluation.agentSnapshot.serviceName ??
        "Aucun service précisé",
    ],
    [
      "Risque RH",
      riskLabels[
        evaluation.intelligence.riskLevel
      ],
    ],
    [
      "Potentiel",
      potentialLabels[
        evaluation.intelligence.potentialLevel
      ],
    ],
    [
      "Fiabilité des données",
      confidenceLabels[
        evaluation.intelligence.dataConfidence
      ],
    ],
    [
      "Statut",
      statusLabels[evaluation.status],
    ],
  ];

  const rows: any[] = [];

  for (
    let index = 0;
    index < items.length;
    index += 3
  ) {
    rows.push(
      new docx.TableRow({
        cantSplit: true,
        children: items
          .slice(
            index,
            index + 3,
          )
          .map(
            (
              [
                label,
                value,
              ],
            ) =>
              new docx.TableCell({
                width: {
                  size: 33.33,
                  type:
                    docx.WidthType.PERCENTAGE,
                },
                shading: {
                  fill:
                    EVALUATION_DOCUMENT_THEME.white,
                },
                margins: {
                  top: 85,
                  right: 90,
                  bottom: 85,
                  left: 90,
                },
                children: [
                  docxParagraph(
                    docx,
                    label,
                    {
                      bold: true,
                      color: EVALUATION_DOCUMENT_THEME.primary,
                      size: 12,
                      after: 30,
                    },
                  ),
                  docxParagraph(
                    docx,
                    value,
                    {
                      bold: true,
                      color:
                        EVALUATION_DOCUMENT_THEME.ink,
                      size: 15,
                      after: 0,
                    },
                  ),
                ],
              }),
          ),
      }),
    );
  }

  return new docx.Table({
    width: {
      size: 100,
      type:
        docx.WidthType.PERCENTAGE,
    },
    rows,
    borders: {
      top: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      left: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      right: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideVertical: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
    },
  });
}

function docxTocTable(
  docx: any,
  evaluation: Evaluation,
): any {
  const items =
    buildEvaluationTocItems(
      evaluation,
    );

  const rows: any[] = [];

  for (
    let index = 0;
    index < items.length;
    index += 2
  ) {
    const cells: any[] = [];

    for (
      let column = 0;
      column < 2;
      column += 1
    ) {
      const item =
        items[
          index + column
        ];

      if (!item) {
        cells.push(
          docxCell(
            docx,
            "",
            {
              widthPercent: 50,
              fill:
                EVALUATION_DOCUMENT_THEME.white,
            },
          ),
        );
        continue;
      }

      cells.push(
        new docx.TableCell({
          width: {
            size: 50,
            type:
              docx.WidthType.PERCENTAGE,
          },
          shading: {
            fill:
              EVALUATION_DOCUMENT_THEME.white,
          },
          margins: {
            top: 70,
            right: 90,
            bottom: 70,
            left: 90,
          },
          children: [
            new docx.Paragraph({
              spacing: {
                after: 0,
                line: 250,
              },
              children: [
                new docx.TextRun({
                  text:
                    `${String(index + column + 1).padStart(2, "0")}  `,
                  bold: true,
                  color:
                    EVALUATION_DOCUMENT_THEME.primary,
                  size: 13,
                  font: "Aptos",
                }),
                new docx.TextRun({
                  text:
                    normalizeExportText(
                      item,
                    ),
                  bold: true,
                  color:
                    EVALUATION_DOCUMENT_THEME.navy,
                  size: 14,
                  font: "Aptos",
                }),
              ],
            }),
          ],
        }),
      );
    }

    rows.push(
      new docx.TableRow({
        cantSplit: true,
        children: cells,
      }),
    );
  }

  return new docx.Table({
    width: {
      size: 100,
      type:
        docx.WidthType.PERCENTAGE,
    },
    rows,
    borders: {
      top: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      left: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      right: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.SINGLE,
        size: 3,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideVertical: {
        style:
          docx.BorderStyle.SINGLE,
        size: 3,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
    },
  });
}

function docxTocMarkersTable(
  docx: any,
  evaluation: Evaluation,
): any {
  const items = [
    [
      "Objectifs",
      `${evaluation.intelligence.objectiveIndex} / 100`,
    ],
    [
      "Assiduité",
      `${evaluation.intelligence.attendanceIndex} / 100`,
    ],
    [
      "Fiabilité",
      `${evaluation.intelligence.reliabilityIndex} / 100`,
    ],
    [
      "Constance",
      `${evaluation.intelligence.consistencyIndex} / 100`,
    ],
  ];

  return new docx.Table({
    width: {
      size: 100,
      type:
        docx.WidthType.PERCENTAGE,
    },
    rows: [
      new docx.TableRow({
        cantSplit: true,
        children: items.map(
          (
            [
              label,
              value,
            ],
          ) =>
            new docx.TableCell({
              width: {
                size: 25,
                type:
                  docx.WidthType.PERCENTAGE,
              },
              shading: {
                fill:
                  EVALUATION_DOCUMENT_THEME.white,
              },
              margins: {
                top: 70,
                right: 70,
                bottom: 70,
                left: 70,
              },
              children: [
                docxParagraph(
                  docx,
                  label,
                  {
                    bold: true,
                    color: EVALUATION_DOCUMENT_THEME.text,
                    size: 11,
                    after: 20,
                  },
                ),
                docxParagraph(
                  docx,
                  value,
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.primary,
                    size: 16,
                    alignment:
                      docx.AlignmentType.CENTER,
                    after: 0,
                  },
                ),
              ],
            }),
        ),
      }),
    ],
    borders: {
      top: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      left: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      right: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideVertical: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color:
          EVALUATION_DOCUMENT_THEME.border,
      },
    },
  });
}

function docxCriteriaTable(
  docx: any,
  evaluation: Evaluation,
): any {
  const header =
    new docx.TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        docxCell(
          docx,
          "Critère",
          {
            fill: EVALUATION_DOCUMENT_THEME.navy,
            bold: true,
            color: EVALUATION_DOCUMENT_THEME.white,
            widthPercent: 24,
          },
        ),
        docxCell(
          docx,
          "Poids",
          {
            fill: EVALUATION_DOCUMENT_THEME.navy,
            bold: true,
            color: EVALUATION_DOCUMENT_THEME.white,
            widthPercent: 10,
          },
        ),
        docxCell(
          docx,
          "Score",
          {
            fill: EVALUATION_DOCUMENT_THEME.navy,
            bold: true,
            color: EVALUATION_DOCUMENT_THEME.white,
            widthPercent: 10,
          },
        ),
        docxCell(
          docx,
          "Appréciation / base",
          {
            fill: EVALUATION_DOCUMENT_THEME.navy,
            bold: true,
            color: EVALUATION_DOCUMENT_THEME.white,
            widthPercent: 56,
          },
        ),
      ],
    });

  const rows =
    evaluation.criteria.map(
      (
        criterion,
        index,
      ) => {
        const details = [
          criterion.description,
          criterion.scoreBasis,
          ...(criterion.automationDetails ??
            []),
          criterion.comment,
        ]
          .filter(Boolean)
          .join(" — ");

        const fill =
          index % 2 === 0
            ? EVALUATION_DOCUMENT_THEME.white
            : EVALUATION_DOCUMENT_THEME.greenSoft;

        return new docx.TableRow({
          cantSplit: true,
          children: [
            docxCell(
              docx,
              criterion.label,
              {
                fill,
                bold: true,
                widthPercent: 24,
              },
            ),
            docxCell(
              docx,
              `${criterion.weight} %`,
              {
                fill,
                widthPercent: 10,
                alignment:
                  docx.AlignmentType.CENTER,
              },
            ),
            docxCell(
              docx,
              `${criterion.finalScore ?? criterion.systemSuggestedScore ?? 0} / 5`,
              {
                fill,
                widthPercent: 10,
                alignment:
                  docx.AlignmentType.CENTER,
              },
            ),
            docxCell(
              docx,
              details || "—",
              {
                fill,
                widthPercent: 56,
              },
            ),
          ],
        });
      },
    );

  return new docx.Table({
    width: {
      size: 100,
      type:
        docx.WidthType.PERCENTAGE,
    },
    rows: [
      header,
      ...rows,
    ],
    borders: {
      top: {
        style:
          docx.BorderStyle.SINGLE,
        size: 6,
        color: EVALUATION_DOCUMENT_THEME.border,
      },
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 6,
        color: EVALUATION_DOCUMENT_THEME.border,
      },
      left: {
        style:
          docx.BorderStyle.SINGLE,
        size: 6,
        color: EVALUATION_DOCUMENT_THEME.border,
      },
      right: {
        style:
          docx.BorderStyle.SINGLE,
        size: 6,
        color: EVALUATION_DOCUMENT_THEME.border,
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.SINGLE,
        size: 5,
        color: EVALUATION_DOCUMENT_THEME.border,
      },
      insideVertical: {
        style:
          docx.BorderStyle.SINGLE,
        size: 5,
        color: EVALUATION_DOCUMENT_THEME.border,
      },
    },
  });
}

function docxLeaveBreakdownTable(
  docx: any,
  evaluation: Evaluation,
): any | null {
  const items =
    (
      evaluation.performanceSnapshot
        .leaveTypeBreakdown ??
      []
    ).filter(
      (item) =>
        item.requestsTotal > 0,
    );

  if (!items.length) {
    return null;
  }

  const header =
    new docx.TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        docxCell(
          docx,
          "Type de congé",
          {
            fill: EVALUATION_DOCUMENT_THEME.navy,
            bold: true,
            color: EVALUATION_DOCUMENT_THEME.white,
            widthPercent: 35,
          },
        ),
        docxCell(
          docx,
          "Demandes",
          {
            fill: EVALUATION_DOCUMENT_THEME.navy,
            bold: true,
            color: EVALUATION_DOCUMENT_THEME.white,
            widthPercent: 15,
          },
        ),
        docxCell(
          docx,
          "Jours demandés",
          {
            fill: EVALUATION_DOCUMENT_THEME.navy,
            bold: true,
            color: EVALUATION_DOCUMENT_THEME.white,
            widthPercent: 20,
          },
        ),
        docxCell(
          docx,
          "Approuvées",
          {
            fill: EVALUATION_DOCUMENT_THEME.navy,
            bold: true,
            color: EVALUATION_DOCUMENT_THEME.white,
            widthPercent: 15,
          },
        ),
        docxCell(
          docx,
          "Jours approuvés",
          {
            fill: EVALUATION_DOCUMENT_THEME.navy,
            bold: true,
            color: EVALUATION_DOCUMENT_THEME.white,
            widthPercent: 15,
          },
        ),
      ],
    });

  const rows =
    items.map(
      (
        item,
        index,
      ) => {
        const fill =
          index % 2 === 0
            ? EVALUATION_DOCUMENT_THEME.white
            : EVALUATION_DOCUMENT_THEME.greenSoft;

        return new docx.TableRow({
          cantSplit: true,
          children: [
            docxCell(
              docx,
              leaveTypeLabels[
                item.leaveType
              ],
              {
                fill,
                bold: true,
                widthPercent: 35,
              },
            ),
            docxCell(
              docx,
              String(
                item.requestsTotal,
              ),
              {
                fill,
                widthPercent: 15,
                alignment:
                  docx.AlignmentType.CENTER,
              },
            ),
            docxCell(
              docx,
              `${formatDayCount(item.requestedDays)} j`,
              {
                fill,
                widthPercent: 20,
                alignment:
                  docx.AlignmentType.CENTER,
              },
            ),
            docxCell(
              docx,
              String(
                item.approvedRequests,
              ),
              {
                fill,
                widthPercent: 15,
                alignment:
                  docx.AlignmentType.CENTER,
              },
            ),
            docxCell(
              docx,
              `${formatDayCount(item.approvedDays)} j`,
              {
                fill,
                widthPercent: 15,
                alignment:
                  docx.AlignmentType.CENTER,
              },
            ),
          ],
        });
      },
    );

  return new docx.Table({
    width: {
      size: 100,
      type:
        docx.WidthType.PERCENTAGE,
    },
    rows: [
      header,
      ...rows,
    ],
    borders: {
      top: {
        style:
          docx.BorderStyle.SINGLE,
        size: 6,
        color: EVALUATION_DOCUMENT_THEME.border,
      },
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 6,
        color: EVALUATION_DOCUMENT_THEME.border,
      },
      left: {
        style:
          docx.BorderStyle.SINGLE,
        size: 6,
        color: EVALUATION_DOCUMENT_THEME.border,
      },
      right: {
        style:
          docx.BorderStyle.SINGLE,
        size: 6,
        color: EVALUATION_DOCUMENT_THEME.border,
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.SINGLE,
        size: 5,
        color: EVALUATION_DOCUMENT_THEME.border,
      },
      insideVertical: {
        style:
          docx.BorderStyle.SINGLE,
        size: 5,
        color: EVALUATION_DOCUMENT_THEME.border,
      },
    },
  });
}

async function downloadEvaluationWord(
  evaluation: Evaluation,
): Promise<void> {
  const docx =
    await import("docx");

  const snapshot =
    evaluation.performanceSnapshot;

  const children: any[] = [
    // ---------------------------------------------------------------
    // PAGE 1 — Couverture
    // ---------------------------------------------------------------
    docxCoverHeaderTable(
      docx,
      evaluation,
    ),
    docxSpacer(
      docx,
      125,
    ),
    docxParagraph(
      docx,
      "DOSSIER INDIVIDUEL DE PERFORMANCE",
      {
        bold: true,
        color:
          EVALUATION_DOCUMENT_THEME.primary,
        size: 14,
        after: 45,
      },
    ),
    docxParagraph(
      docx,
      evaluation.title,
      {
        bold: true,
        color:
          EVALUATION_DOCUMENT_THEME.navy,
        size: 32,
        after: 75,
      },
    ),
    docxParagraph(
      docx,
      `Exercice ${evaluation.evaluationYear} · ${formatDate(evaluation.periodStartDate)} — ${formatDate(evaluation.periodEndDate)}`,
      {
        color:
          EVALUATION_DOCUMENT_THEME.text,
        size: 16,
        after: 145,
      },
    ),

    new docx.Table({
      width: {
        size: 100,
        type:
          docx.WidthType.PERCENTAGE,
      },
      rows: [
        new docx.TableRow({
          cantSplit: true,
          children: [
            new docx.TableCell({
              width: {
                size: 72,
                type:
                  docx.WidthType.PERCENTAGE,
              },
              shading: {
                fill:
                  EVALUATION_DOCUMENT_THEME.white,
              },
              margins: {
                top: 100,
                right: 120,
                bottom: 100,
                left: 120,
              },
              children: [
                docxParagraph(
                  docx,
                  "AGENT ÉVALUÉ",
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.primary,
                    size: 11,
                    after: 28,
                  },
                ),
                docxParagraph(
                  docx,
                  evaluation.agentSnapshot.fullName,
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.ink,
                    size: 22,
                    after: 38,
                  },
                ),
                docxParagraph(
                  docx,
                  `${evaluation.agentSnapshot.jobTitle} · ${evaluation.agentSnapshot.matricule}`,
                  {
                    color:
                      EVALUATION_DOCUMENT_THEME.text,
                    size: 15,
                    after: 0,
                  },
                ),
              ],
            }),
            new docx.TableCell({
              width: {
                size: 28,
                type:
                  docx.WidthType.PERCENTAGE,
              },
              shading: {
                fill:
                  EVALUATION_DOCUMENT_THEME.white,
              },
              margins: {
                top: 90,
                right: 85,
                bottom: 90,
                left: 85,
              },
              children: [
                docxParagraph(
                  docx,
                  "SCORE GLOBAL",
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.text,
                    size: 10,
                    alignment:
                      docx.AlignmentType.CENTER,
                    after: 30,
                  },
                ),
                docxParagraph(
                  docx,
                  `${evaluation.finalScore} / 100`,
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.primary,
                    size: 25,
                    alignment:
                      docx.AlignmentType.CENTER,
                    after: 32,
                  },
                ),
                docxParagraph(
                  docx,
                  gradeLabels[
                    evaluation.grade
                  ],
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.navy,
                    size: 11,
                    alignment:
                      docx.AlignmentType.CENTER,
                    after: 0,
                  },
                ),
              ],
            }),
          ],
        }),
      ],
      borders: {
        top: {
          style:
            docx.BorderStyle.SINGLE,
          size: 8,
          color:
            EVALUATION_DOCUMENT_THEME.gold,
        },
        bottom: {
          style:
            docx.BorderStyle.SINGLE,
          size: 4,
          color:
            EVALUATION_DOCUMENT_THEME.border,
        },
        left: {
          style:
            docx.BorderStyle.SINGLE,
          size: 4,
          color:
            EVALUATION_DOCUMENT_THEME.border,
        },
        right: {
          style:
            docx.BorderStyle.SINGLE,
          size: 4,
          color:
            EVALUATION_DOCUMENT_THEME.border,
        },
        insideVertical: {
          style:
            docx.BorderStyle.SINGLE,
          size: 4,
          color:
            EVALUATION_DOCUMENT_THEME.border,
        },
        insideHorizontal: {
          style:
            docx.BorderStyle.SINGLE,
          size: 4,
          color:
            EVALUATION_DOCUMENT_THEME.border,
        },
      },
    }),
    docxSpacer(
      docx,
      65,
    ),
    docxCoverSummaryTable(
      docx,
      evaluation,
    ),
    docxSpacer(
      docx,
      70,
    ),
    docxCallout(
      docx,
      evaluation.intelligence
        .hrExecutiveBrief ||
        getExportScoreDescription(
          evaluation.finalScore,
        ),
      {
        label:
          "LECTURE SYNTHÉTIQUE",
        accent:
          "green",
      },
    ),
    docxSpacer(
      docx,
      55,
    ),
    docxParagraph(
      docx,
      "DOCUMENT CONFIDENTIEL RH · Diffusion limitée aux personnes habilitées dans le cadre du processus d’évaluation.",
      {
        bold: true,
        color:
          EVALUATION_DOCUMENT_THEME.gold,
        size: 10,
        after: 0,
      },
    ),
    docxPageBreak(
      docx,
    ),

    // ---------------------------------------------------------------
    // PAGE 2 — Sommaire compact
    // ---------------------------------------------------------------
    docxParagraph(
      docx,
      "STRUCTURE DU DOCUMENT",
      {
        bold: true,
        color:
          EVALUATION_DOCUMENT_THEME.primary,
        size: 12,
        after: 35,
      },
    ),
    docxParagraph(
      docx,
      "Sommaire",
      {
        bold: true,
        color:
          EVALUATION_DOCUMENT_THEME.navy,
        size: 26,
        after: 55,
      },
    ),
    docxParagraph(
      docx,
      "Parcours de lecture conçu pour faciliter l’analyse RH, l’entretien hiérarchique et la décision finale.",
      {
        color:
          EVALUATION_DOCUMENT_THEME.text,
        size: 14,
        after: 85,
      },
    ),
    docxTocTable(
      docx,
      evaluation,
    ),
    docxSpacer(
      docx,
      55,
    ),
    docxTocMarkersTable(
      docx,
      evaluation,
    ),
    docxSpacer(
      docx,
      75,
    ),

    // ---------------------------------------------------------------
    // 01 — Informations générales
    // ---------------------------------------------------------------
    docxNumberedSectionTitle(
      docx,
      evaluation,
      "Informations générales",
    ),
    docxMetaGrid(
      docx,
      [
        [
          "Agent évalué",
          `${evaluation.agentSnapshot.fullName} · ${evaluation.agentSnapshot.matricule}`,
        ],
        [
          "Fonction",
          evaluation.agentSnapshot.jobTitle,
        ],
        [
          "Rattachement",
          `${evaluation.agentSnapshot.directionName ?? "Rattachement à régulariser"} · ${evaluation.agentSnapshot.serviceName ?? "Aucun service précisé"}`,
        ],
        [
          "Période évaluée",
          `${formatDate(evaluation.periodStartDate)} — ${formatDate(evaluation.periodEndDate)}`,
        ],
        [
          "Statut",
          statusLabels[
            evaluation.status
          ],
        ],
        [
          "Référence",
          evaluation.reference,
        ],
      ],
    ),

    // ---------------------------------------------------------------
    // 02 — Synthèse exécutive
    // ---------------------------------------------------------------
    docxNumberedSectionTitle(
      docx,
      evaluation,
      "Synthèse exécutive",
    ),
    docxCallout(
      docx,
      evaluation.executiveSummary,
      {
        accent:
          "navy",
      },
    ),

    // ---------------------------------------------------------------
    // 03 — Lecture HRS
    // ---------------------------------------------------------------
    docxNumberedSectionTitle(
      docx,
      evaluation,
      "Lecture HRS intelligente",
    ),
    docxParagraph(
      docx,
      evaluation.intelligence
        .hrExecutiveBrief,
      {
        color:
          EVALUATION_DOCUMENT_THEME.text,
        size: 17,
        after: 75,
      },
    ),
    docxMetricStrip(
      docx,
      [
        [
          "Objectifs",
          `${evaluation.intelligence.objectiveIndex} / 100`,
        ],
        [
          "Assiduité",
          `${evaluation.intelligence.attendanceIndex} / 100`,
        ],
        [
          "Fiabilité",
          `${evaluation.intelligence.reliabilityIndex} / 100`,
        ],
        [
          "Constance",
          `${evaluation.intelligence.consistencyIndex} / 100`,
        ],
      ],
    ),
    docxSpacer(
      docx,
      55,
    ),
    docxPairTable(
      docx,
      [
        [
          "Niveau de risque",
          riskLabels[
            evaluation.intelligence
              .riskLevel
          ],
        ],
        [
          "Potentiel RH",
          potentialLabels[
            evaluation.intelligence
              .potentialLevel
          ],
        ],
        [
          "Fiabilité des données",
          confidenceLabels[
            evaluation.intelligence
              .dataConfidence
          ],
        ],
        [
          "Décision suggérée",
          decisionLabels[
            evaluation.intelligence
              .recommendedDecision
          ],
        ],
        [
          "Priorité RH",
          evaluation.intelligence
            .developmentPriority,
        ],
      ],
    ),

    // ---------------------------------------------------------------
    // 04 — Note d'aide à la décision
    // ---------------------------------------------------------------
    docxNumberedSectionTitle(
      docx,
      evaluation,
      "Note d’aide à la décision",
    ),
    docxCallout(
      docx,
      evaluation.intelligence
        .directorGeneralBrief,
      {
        label:
          "NOTE À LA DIRECTION",
        accent:
          "gold",
      },
    ),

    // ---------------------------------------------------------------
    // 05 — Données RH
    // ---------------------------------------------------------------
    docxNumberedSectionTitle(
      docx,
      evaluation,
      "Données RH exploitées automatiquement",
    ),
    docxPairTable(
      docx,
      [
        [
          "Tâches terminées",
          `${snapshot.tasksCompleted} / ${snapshot.tasksTotal}`,
        ],
        [
          "Tâches non terminées",
          String(
            snapshot.tasksNotCompleted,
          ),
        ],
        [
          "Taux réalisation tâches",
          `${snapshot.taskCompletionRate} %`,
        ],
        [
          "Progression moyenne tâches",
          `${snapshot.averageTaskProgress} %`,
        ],
        [
          "Feuille de route réalisée",
          `${snapshot.roadmapProgress ?? 0} %`,
        ],
        [
          "Feuille de route",
          `${snapshot.roadmapCompletedItems} / ${snapshot.roadmapTotalItems} élément(s)`,
        ],
        [
          "Reste feuille de route",
          String(
            snapshot.roadmapRemainingItems,
          ),
        ],
        [
          "Jours ouvrés évalués",
          String(
            snapshot.workingDaysExpected,
          ),
        ],
        [
          "Absences non couvertes",
          `${formatDayCount(snapshot.absentDays)} j`,
        ],
        [
          "Congés approuvés neutralisés",
          `${formatDayCount(snapshot.leaveCoveredWorkdays)} j`,
        ],
        [
          "Jours sans pointage non couverts",
          `${formatDayCount(snapshot.unrecordedWorkdays)} j`,
        ],
        [
          "Retard cumulé",
          `${snapshot.lateMinutes} minute(s)`,
        ],
        [
          "Heures supplémentaires",
          formatMinutes(
            snapshot.overtimeMinutes,
          ),
        ],
      ],
    ),
  ];

  if (
    (
      snapshot.automaticDataSummary ??
      []
    ).length > 0
  ) {
    children.push(
      docxSubsectionHeading(
        docx,
        "Synthèse automatique",
      ),
      ...docxList(
        docx,
        snapshot.automaticDataSummary,
      ),
    );
  }

  // ---------------------------------------------------------------
  // 06 — Congés
  // ---------------------------------------------------------------
  children.push(
    docxNumberedSectionTitle(
      docx,
      evaluation,
      "Congés et absences autorisées",
    ),
    docxPairTable(
      docx,
      [
        [
          "Demandes recensées",
          `${snapshot.leaveRequestsTotal} · ${snapshot.leaveDraftRequests} brouillon(s)`,
        ],
        [
          "Jours demandés",
          `${formatDayCount(snapshot.leaveRequestedDays)} j`,
        ],
        [
          "Demandes approuvées",
          String(
            snapshot.leaveApprovedRequests,
          ),
        ],
        [
          "Jours approuvés",
          `${formatDayCount(snapshot.leaveApprovedDays)} j`,
        ],
        [
          "En validation",
          `${snapshot.leaveSubmittedRequests + snapshot.leaveManagerApprovedRequests} · ${formatDayCount(snapshot.leavePendingDays)} j`,
        ],
        [
          "Demandes refusées",
          `${snapshot.leaveRejectedRequests} · ${formatDayCount(snapshot.leaveRejectedDays)} j`,
        ],
        [
          "Demandes annulées",
          `${snapshot.leaveCancelledRequests} · ${formatDayCount(snapshot.leaveCancelledDays)} j`,
        ],
        [
          "Taux d'approbation",
          `${snapshot.leaveApprovalRate} %`,
        ],
        [
          `Solde annuel ${evaluation.evaluationYear}`,
          snapshot.annualLeaveBalanceConfigured
            ? `${formatDayCount(snapshot.annualLeaveAvailableDays)} jour(s) disponible(s)`
            : "Solde non configuré",
        ],
      ],
    ),
  );

  if (
    snapshot.annualLeaveBalanceConfigured
  ) {
    children.push(
      docxSpacer(
        docx,
        50,
      ),
      docxMetricStrip(
        docx,
        [
          [
            "Ouverture",
            `${formatDayCount(snapshot.annualLeaveOpeningDays)} j`,
          ],
          [
            "Droits",
            `${formatDayCount(snapshot.annualLeaveEntitledDays)} j`,
          ],
          [
            "Report",
            `${formatDayCount(snapshot.annualLeaveCarriedOverDays)} j`,
          ],
          [
            "Disponible",
            `${formatDayCount(snapshot.annualLeaveAvailableDays)} j`,
          ],
        ],
      ),
    );
  }

  const leaveBreakdown =
    docxLeaveBreakdownTable(
      docx,
      evaluation,
    );

  if (
    leaveBreakdown
  ) {
    children.push(
      docxSubsectionHeading(
        docx,
        "Répartition des congés",
      ),
      leaveBreakdown,
    );
  }

  // ---------------------------------------------------------------
  // 07 — Grille d'appréciation
  // ---------------------------------------------------------------
  children.push(
    docxNumberedSectionTitle(
      docx,
      evaluation,
      "Grille d’appréciation",
    ),
    docxCriteriaTable(
      docx,
      evaluation,
    ),
  );

  // ---------------------------------------------------------------
  // 08 — Éléments probants
  // ---------------------------------------------------------------
  if (
    evaluation.evidenceLinks.length >
    0
  ) {
    children.push(
      docxNumberedSectionTitle(
        docx,
        evaluation,
        "Liens et éléments probants",
      ),
      docxEvidenceTable(
        docx,
        evaluation.evidenceLinks,
      ),
    );
  }

  // ---------------------------------------------------------------
  // 09 — Forces / alertes / recommandations
  // ---------------------------------------------------------------
  children.push(
    docxNumberedSectionTitle(
      docx,
      evaluation,
      "Forces, alertes et actions recommandées",
    ),
    docxTwoColumnListPanel(
      docx,
      {
        title:
          "Forces observées",
        items:
          evaluation.intelligence
            .strengths,
      },
      {
        title:
          "Points de vigilance",
        items:
          evaluation.intelligence
            .alerts,
      },
    ),
    docxSpacer(
      docx,
      55,
    ),
    docxTwoColumnListPanel(
      docx,
      {
        title:
          "Actions RH recommandées",
        items:
          evaluation.intelligence
            .recommendedActions,
      },
      {
        title:
          "Plan 90 jours",
        items:
          evaluation.intelligence
            .next90DayPlan,
      },
    ),
  );

  // ---------------------------------------------------------------
  // 10 — Entretien contradictoire / réserves
  // ---------------------------------------------------------------
  if (
    evaluation.intelligence
      .managerTalkingPoints.length >
      0 ||
    evaluation.intelligence
      .dataWarnings.length >
      0
  ) {
    children.push(
      docxNumberedSectionTitle(
        docx,
        evaluation,
        "Entretien contradictoire et réserves de lecture",
      ),
      docxTwoColumnListPanel(
        docx,
        {
          title:
            "Points à traiter pendant l’entretien",
          items:
            evaluation.intelligence
              .managerTalkingPoints,
        },
        {
          title:
            "Réserves sur les données",
          items:
            evaluation.intelligence
              .dataWarnings,
        },
      ),
    );
  }

  // ---------------------------------------------------------------
  // 11 — Conclusion RH
  // ---------------------------------------------------------------
  children.push(
    docxNumberedSectionTitle(
      docx,
      evaluation,
      "Conclusion RH",
    ),
    docxCallout(
      docx,
      evaluation.generatedConclusion,
      {
        accent:
          "navy",
      },
    ),
  );

  if (
    evaluation.hrValidation
      ?.finalComment
  ) {
    children.push(
      docxSpacer(
        docx,
        45,
      ),
      docxCallout(
        docx,
        evaluation.hrValidation
          .finalComment,
        {
          label:
            "COMMENTAIRE FINAL RH",
          accent:
            "green",
        },
      ),
    );
  }

  // ---------------------------------------------------------------
  // 12 — Signatures
  // ---------------------------------------------------------------
  children.push(
    docxNumberedSectionTitle(
      docx,
      evaluation,
      "Signatures",
    ),
    new docx.Table({
      width: {
        size: 100,
        type:
          docx.WidthType.PERCENTAGE,
      },
      rows: [
        new docx.TableRow({
          cantSplit: true,
          children: [
            new docx.TableCell({
              width: {
                size: 33.33,
                type:
                  docx.WidthType.PERCENTAGE,
              },
              margins: {
                top: 95,
                right: 90,
                bottom: 420,
                left: 90,
              },
              children: [
                docxParagraph(
                  docx,
                  "Agent évalué",
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.navy,
                    size: 15,
                    after: 45,
                  },
                ),
                docxParagraph(
                  docx,
                  "Nom, date, observations et signature",
                  {
                    color:
                      EVALUATION_DOCUMENT_THEME.text,
                    size: 12,
                    after: 0,
                  },
                ),
              ],
            }),
            new docx.TableCell({
              width: {
                size: 33.33,
                type:
                  docx.WidthType.PERCENTAGE,
              },
              margins: {
                top: 95,
                right: 90,
                bottom: 420,
                left: 90,
              },
              children: [
                docxParagraph(
                  docx,
                  "Responsable hiérarchique",
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.navy,
                    size: 15,
                    after: 45,
                  },
                ),
                docxParagraph(
                  docx,
                  "Nom, fonction, date et signature",
                  {
                    color:
                      EVALUATION_DOCUMENT_THEME.text,
                    size: 12,
                    after: 0,
                  },
                ),
              ],
            }),
            new docx.TableCell({
              width: {
                size: 33.33,
                type:
                  docx.WidthType.PERCENTAGE,
              },
              margins: {
                top: 95,
                right: 90,
                bottom: 420,
                left: 90,
              },
              children: [
                docxParagraph(
                  docx,
                  "Responsable RH / Direction",
                  {
                    bold: true,
                    color:
                      EVALUATION_DOCUMENT_THEME.navy,
                    size: 15,
                    after: 45,
                  },
                ),
                docxParagraph(
                  docx,
                  "Décision, date, visa et signature",
                  {
                    color:
                      EVALUATION_DOCUMENT_THEME.text,
                    size: 12,
                    after: 0,
                  },
                ),
              ],
            }),
          ],
        }),
      ],
      borders: {
        top: {
          style:
            docx.BorderStyle.SINGLE,
          size: 8,
          color:
            EVALUATION_DOCUMENT_THEME.navy,
        },
        bottom: {
          style:
            docx.BorderStyle.SINGLE,
          size: 4,
          color:
            EVALUATION_DOCUMENT_THEME.border,
        },
        left: {
          style:
            docx.BorderStyle.SINGLE,
          size: 4,
          color:
            EVALUATION_DOCUMENT_THEME.border,
        },
        right: {
          style:
            docx.BorderStyle.SINGLE,
          size: 4,
          color:
            EVALUATION_DOCUMENT_THEME.border,
        },
        insideVertical: {
          style:
            docx.BorderStyle.SINGLE,
          size: 4,
          color:
            EVALUATION_DOCUMENT_THEME.border,
        },
        insideHorizontal: {
          style:
            docx.BorderStyle.SINGLE,
          size: 4,
          color:
            EVALUATION_DOCUMENT_THEME.border,
        },
      },
    }),
  );

  const document =
    new docx.Document({
      creator: "FADES-RH",
      title: evaluation.title,
      subject:
        evaluation.reference,
      description:
        "Évaluation professionnelle FADES-RH",
      styles: {
        default: {
          document: {
            run: {
              font: "Aptos",
              size: 18,
              color:
                EVALUATION_DOCUMENT_THEME.text,
            },
            paragraph: {
              spacing: {
                after: 90,
                line: 260,
              },
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: {
                width: 11906,
                height: 16838,
                orientation:
                  docx.PageOrientation.PORTRAIT,
              },
              margin: {
                top: 680,
                right: 680,
                bottom: 700,
                left: 680,
              },
            },
          },
          children,
        },
      ],
    });


  const blob =
    await docx.Packer.toBlob(
      document,
    );

  triggerEvaluationDownload(
    blob,
    `${safeExportFileName(
      evaluation.reference,
    )}-evaluation.docx`,
  );
}

function buildInitialScores(evaluation: Evaluation, mode: "self" | "manager" | "hr"): EvaluationCriterionInput[] {
  return evaluation.criteria.map((criterion) => ({
    key: criterion.key,
    selfScore: mode === "self" ? criterion.selfScore ?? criterion.systemSuggestedScore : criterion.selfScore,
    managerScore: mode === "manager" ? criterion.managerScore ?? criterion.finalScore ?? criterion.systemSuggestedScore : criterion.managerScore,
    hrScore: mode === "hr" ? criterion.hrScore ?? criterion.managerScore ?? criterion.finalScore ?? criterion.systemSuggestedScore : criterion.hrScore,
    comment: criterion.comment,
  }));
}

export default function EvaluationDetailsDrawer({
  evaluation,
  currentRole,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmitSelfReview,
  onSubmitManagerReview,
  onValidateHr,
  onRecomputeIntelligence,
  isRecomputing = false,
}: EvaluationDetailsDrawerProps) {
  const [activePanel, setActivePanel] = useState<"overview" | "self" | "manager" | "hr">("overview");
  const [exporting, setExporting] = useState<"PDF" | "WORD" | "PRINT" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selfForm, setSelfForm] = useState<SubmitEvaluationReviewInput>(() => ({
    comment: evaluation.selfReview?.comment ?? "",
    strengths: evaluation.selfReview?.strengths ?? "",
    improvementAreas: evaluation.selfReview?.improvementAreas ?? "",
    trainingNeeds: evaluation.selfReview?.trainingNeeds ?? "",
    nextObjectives: evaluation.selfReview?.nextObjectives ?? "",
    criteria: buildInitialScores(evaluation, "self"),
  }));
  const [managerForm, setManagerForm] = useState<SubmitEvaluationReviewInput>(() => ({
    comment: evaluation.managerReview?.comment ?? "",
    strengths: evaluation.managerReview?.strengths ?? "",
    improvementAreas: evaluation.managerReview?.improvementAreas ?? "",
    trainingNeeds: evaluation.managerReview?.trainingNeeds ?? "",
    nextObjectives: evaluation.managerReview?.nextObjectives ?? "",
    criteria: buildInitialScores(evaluation, "manager"),
  }));
  const [hrForm, setHrForm] = useState<ValidateEvaluationHrInput>(() => ({
    finalDecision: evaluation.hrValidation?.finalDecision ?? "NO_DECISION",
    finalComment: evaluation.hrValidation?.finalComment ?? "",
    criteria: buildInitialScores(evaluation, "hr"),
  }));

  const canSelfReview = currentRole === "AGENT" || currentRole === "TENANT_ADMIN" || currentRole === "RH_MANAGER";
  const canManagerReview = ["DIRECTION", "SERVICE_MANAGER", "TENANT_ADMIN", "RH_MANAGER"].includes(currentRole);
  const canHrValidate = ["TENANT_ADMIN", "RH_MANAGER"].includes(currentRole);

  const scoreDescription = useMemo(() => {
    if (evaluation.finalScore >= 90) return "L’agent démontre une contribution remarquable, stable et supérieure aux attentes du poste.";
    if (evaluation.finalScore >= 80) return "L’agent présente un niveau de performance solide, fiable et favorable à l’atteinte des objectifs du service.";
    if (evaluation.finalScore >= 70) return "L’agent satisfait globalement aux attentes, avec des points de consolidation identifiés.";
    if (evaluation.finalScore >= 60) return "L’agent doit bénéficier d’un accompagnement ciblé afin d’améliorer durablement certains aspects de sa performance.";
    return "La situation requiert un suivi renforcé, des objectifs de redressement clairs et une supervision rapprochée.";
  }, [evaluation.finalScore]);

  const performanceSnapshot = useMemo(() => {
    const snapshot = evaluation.performanceSnapshot ?? ({} as Evaluation["performanceSnapshot"]);

    return {
      ...snapshot,
      tasksTotal: safeNumber(snapshot.tasksTotal),
      tasksCompleted: safeNumber(snapshot.tasksCompleted),
      tasksNotCompleted: safeNumber(snapshot.tasksNotCompleted),
      tasksInProgress: safeNumber(snapshot.tasksInProgress),
      tasksBlocked: safeNumber(snapshot.tasksBlocked),
      tasksOverdue: safeNumber(snapshot.tasksOverdue),
      taskCompletionRate: safeNumber(snapshot.taskCompletionRate),
      averageTaskProgress: safeNumber(snapshot.averageTaskProgress),
      workingDaysExpected: safeNumber(snapshot.workingDaysExpected),
      attendanceRecords: safeNumber(snapshot.attendanceRecords),
      attendanceMarkedDays: safeNumber(snapshot.attendanceMarkedDays),
      presentDays: safeNumber(snapshot.presentDays),
      lateDays: safeNumber(snapshot.lateDays),
      absentDays: safeNumber(snapshot.absentDays),
      unrecordedWorkdays: safeNumber(snapshot.unrecordedWorkdays),
      leaveRequestsTotal: safeNumber(snapshot.leaveRequestsTotal),
      leaveDraftRequests: safeNumber(snapshot.leaveDraftRequests),
      leaveSubmittedRequests: safeNumber(snapshot.leaveSubmittedRequests),
      leaveManagerApprovedRequests: safeNumber(snapshot.leaveManagerApprovedRequests),
      leaveApprovedRequests: safeNumber(snapshot.leaveApprovedRequests),
      leaveRejectedRequests: safeNumber(snapshot.leaveRejectedRequests),
      leaveCancelledRequests: safeNumber(snapshot.leaveCancelledRequests),
      leaveRequestedDays: safeNumber(snapshot.leaveRequestedDays),
      leavePendingDays: safeNumber(snapshot.leavePendingDays),
      leaveApprovedDays: safeNumber(snapshot.leaveApprovedDays),
      leaveRejectedDays: safeNumber(snapshot.leaveRejectedDays),
      leaveCancelledDays: safeNumber(snapshot.leaveCancelledDays),
      leaveCoveredWorkdays: safeNumber(snapshot.leaveCoveredWorkdays),
      leaveApprovalRate: safeNumber(snapshot.leaveApprovalRate),
      annualLeaveApprovedDays: safeNumber(snapshot.annualLeaveApprovedDays),
      sickLeaveApprovedDays: safeNumber(snapshot.sickLeaveApprovedDays),
      maternityLeaveApprovedDays: safeNumber(snapshot.maternityLeaveApprovedDays),
      paternityLeaveApprovedDays: safeNumber(snapshot.paternityLeaveApprovedDays),
      specialLeaveApprovedDays: safeNumber(snapshot.specialLeaveApprovedDays),
      unpaidLeaveApprovedDays: safeNumber(snapshot.unpaidLeaveApprovedDays),
      trainingLeaveApprovedDays: safeNumber(snapshot.trainingLeaveApprovedDays),
      otherLeaveApprovedDays: safeNumber(snapshot.otherLeaveApprovedDays),
      annualLeaveBalanceConfigured: Boolean(snapshot.annualLeaveBalanceConfigured),
      annualLeaveOpeningDays: safeNumber(snapshot.annualLeaveOpeningDays),
      annualLeaveEntitledDays: safeNumber(snapshot.annualLeaveEntitledDays),
      annualLeaveCarriedOverDays: safeNumber(snapshot.annualLeaveCarriedOverDays),
      annualLeaveAdjustmentDays: safeNumber(snapshot.annualLeaveAdjustmentDays),
      annualLeaveConsumedDays: safeNumber(snapshot.annualLeaveConsumedDays),
      annualLeaveAvailableDays: safeNumber(snapshot.annualLeaveAvailableDays),
      leaveTypeBreakdown: Array.isArray(snapshot.leaveTypeBreakdown)
        ? snapshot.leaveTypeBreakdown
        : [],
      lateMinutes: safeNumber(snapshot.lateMinutes),
      workedMinutes: safeNumber(snapshot.workedMinutes),
      overtimeMinutes: safeNumber(snapshot.overtimeMinutes),
      roadmapProgress: safeNumber(snapshot.roadmapProgress),
      roadmapTotalItems: safeNumber(snapshot.roadmapTotalItems),
      roadmapCompletedItems: safeNumber(snapshot.roadmapCompletedItems),
      roadmapRemainingItems: safeNumber(snapshot.roadmapRemainingItems),
      roadmapRemainingPercent: safeNumber(snapshot.roadmapRemainingPercent),
      automaticDataSummary: Array.isArray(snapshot.automaticDataSummary)
        ? snapshot.automaticDataSummary
        : [],
      dataSources: Array.isArray(snapshot.dataSources) ? snapshot.dataSources : [],
    };
  }, [evaluation.performanceSnapshot]);

  function updateScore(
    mode: "self" | "manager" | "hr",
    key: string,
    value: string,
  ): void {
    const parsed = value === "" ? undefined : Number(value);
    const updater = (items?: EvaluationCriterionInput[]) =>
      (items ?? []).map((item) =>
        item.key === key
          ? {
              ...item,
              ...(mode === "self" ? { selfScore: parsed } : {}),
              ...(mode === "manager" ? { managerScore: parsed } : {}),
              ...(mode === "hr" ? { hrScore: parsed } : {}),
            }
          : item,
      );

    if (mode === "self") setSelfForm((current) => ({ ...current, criteria: updater(current.criteria) }));
    if (mode === "manager") setManagerForm((current) => ({ ...current, criteria: updater(current.criteria) }));
    if (mode === "hr") setHrForm((current) => ({ ...current, criteria: updater(current.criteria) }));
  }

  async function runExport(
    kind: "PDF" | "WORD" | "PRINT",
  ): Promise<void> {
    setExportError(null);
    setExporting(kind);

    try {
      if (kind === "PDF") {
        await downloadEvaluationPdf(evaluation);
      } else if (kind === "WORD") {
        await downloadEvaluationWord(evaluation);
      } else {
        await printPrintableDocument(evaluation);
      }
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "L'export de l'évaluation a échoué.",
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="evaluation-drawer-layer" role="presentation">
      <button className="evaluation-drawer-backdrop" type="button" aria-label="Fermer" onClick={onClose} />
      <aside className="evaluation-drawer" role="dialog" aria-modal="true">
        <header className="evaluation-drawer-header no-print">
          <div>
            <p>DOSSIER D’ÉVALUATION</p>
            <h3>{evaluation.reference}</h3>
          </div>
          <button className="evaluation-icon-button" type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <section className="evaluation-drawer-actions no-print">
          <button
            className="evaluation-secondary-button"
            type="button"
            disabled={Boolean(exporting)}
            onClick={() => void runExport("PDF")}
            title="Télécharger l’évaluation complète en PDF"
          >
            {exporting === "PDF" ? (
              <LoaderCircle size={17} className="is-spinning" />
            ) : (
              <Download size={17} />
            )}
            PDF
          </button>

          <button
            className="evaluation-secondary-button"
            type="button"
            disabled={Boolean(exporting)}
            onClick={() => void runExport("WORD")}
            title="Télécharger un véritable document Microsoft Word (.docx)"
          >
            {exporting === "WORD" ? (
              <LoaderCircle size={17} className="is-spinning" />
            ) : (
              <FileText size={17} />
            )}
            Word (.docx)
          </button>

          <button
            className="evaluation-secondary-button"
            type="button"
            disabled={Boolean(exporting)}
            onClick={() => void runExport("PRINT")}
            title="Ouvrir la version imprimable"
          >
            {exporting === "PRINT" ? (
              <LoaderCircle size={17} className="is-spinning" />
            ) : (
              <Printer size={17} />
            )}
            Imprimer
          </button>
          {canHrValidate && onRecomputeIntelligence && (
            <button className="evaluation-secondary-button" type="button" disabled={isRecomputing} onClick={() => void onRecomputeIntelligence()}>
              {isRecomputing ? <LoaderCircle size={17} className="is-spinning" /> : <Sparkles size={17} />}
              Réanalyser HRS
            </button>
          )}
        </section>

        {errorMessage && <div className="evaluation-error no-print">{errorMessage}</div>}
        {exportError && <div className="evaluation-error no-print">{exportError}</div>}

        <div className="evaluation-tabs no-print">
          <button type="button" className={activePanel === "overview" ? "is-active" : ""} onClick={() => setActivePanel("overview")}>Synthèse</button>
          {canSelfReview && <button type="button" className={activePanel === "self" ? "is-active" : ""} onClick={() => setActivePanel("self")}>Auto-évaluation</button>}
          {canManagerReview && <button type="button" className={activePanel === "manager" ? "is-active" : ""} onClick={() => setActivePanel("manager")}>Hiérarchie</button>}
          {canHrValidate && <button type="button" className={activePanel === "hr" ? "is-active" : ""} onClick={() => setActivePanel("hr")}>Validation RH</button>}
        </div>

        {activePanel === "overview" && (
          <section className="evaluation-printable-document">
            <div className="print-header">
              <div>
                <span>RH · ÉVALUATION PROFESSIONNELLE</span>
                <h2>{evaluation.title}</h2>
                <p>{evaluation.printableIntro}</p>
              </div>
              <strong>{evaluation.finalScore}/100</strong>
            </div>

            <div className="evaluation-score-band">
              <Award size={26} />
              <div>
                <span>Niveau global : {gradeLabels[evaluation.grade]}</span>
                <strong>{scoreDescription}</strong>
              </div>
            </div>

            <div className="print-grid">
              <article className="print-card">
                <span>Agent évalué</span>
                <strong>{evaluation.agentSnapshot.fullName}</strong>
                <p>{evaluation.agentSnapshot.jobTitle} · {evaluation.agentSnapshot.matricule}</p>
              </article>
              <article className="print-card">
                <span>Rattachement</span>
                <strong>{evaluation.agentSnapshot.directionName ?? "Rattachement à régulariser"}</strong>
                <p>{evaluation.agentSnapshot.serviceName ?? "Aucun service précisé"}</p>
              </article>
              <article className="print-card">
                <span>Période évaluée</span>
                <strong>{formatDate(evaluation.periodStartDate)} — {formatDate(evaluation.periodEndDate)}</strong>
                <p>Année : {evaluation.evaluationYear}</p>
              </article>
              <article className="print-card">
                <span>Statut</span>
                <strong>{statusLabels[evaluation.status]}</strong>
                <p>Référence : {evaluation.reference}</p>
              </article>
            </div>

            <section className="evaluation-print-section">
              <h4><Sparkles size={18} /> Synthèse exécutive</h4>
              <p>{evaluation.executiveSummary}</p>
            </section>

            <section className="evaluation-print-section evaluation-intelligence-block">
              <h4><Sparkles size={18} /> Lecture HRS intelligente</h4>
              <p>{evaluation.intelligence.hrExecutiveBrief}</p>
              <div className="intelligence-grid">
                <article>
                  <span>Niveau de risque</span>
                  <strong>{riskLabels[evaluation.intelligence.riskLevel]}</strong>
                </article>
                <article>
                  <span>Potentiel RH</span>
                  <strong>{potentialLabels[evaluation.intelligence.potentialLevel]}</strong>
                </article>
                <article>
                  <span>Fiabilité des données</span>
                  <strong>{confidenceLabels[evaluation.intelligence.dataConfidence]}</strong>
                </article>
                <article>
                  <span>Décision suggérée</span>
                  <strong>{decisionLabels[evaluation.intelligence.recommendedDecision]}</strong>
                </article>
              </div>
              <div className="intelligence-indexes">
                <span>Objectifs : {evaluation.intelligence.objectiveIndex}/100</span>
                <span>Assiduité : {evaluation.intelligence.attendanceIndex}/100</span>
                <span>Fiabilité : {evaluation.intelligence.reliabilityIndex}/100</span>
                <span>Constance : {evaluation.intelligence.consistencyIndex}/100</span>
              </div>
              <p><strong>Priorité RH :</strong> {evaluation.intelligence.developmentPriority}</p>
            </section>

            <section className="evaluation-print-section evaluation-executive-brief">
              <div className="evaluation-section-heading">
                <div>
                  <span>NOTE D’AIDE À LA DÉCISION</span>
                  <h4>Lecture prête pour la Direction / Direction générale</h4>
                </div>
                <strong>{decisionLabels[evaluation.intelligence.recommendedDecision]}</strong>
              </div>
              <p className="evaluation-preline-text">
                {evaluation.intelligence.directorGeneralBrief}
              </p>
            </section>

            <section className="evaluation-print-section">
              <h4><FileSpreadsheet size={18} /> Données RH exploitées automatiquement</h4>
              <p className="evaluation-data-note">
                Ces données sont calculées à partir des modules Tâches, Feuilles de route, Congés et Pointage.
                Les congés définitivement approuvés sont neutralisés dans le calcul de l’assiduité.
              </p>

              <div className="snapshot-grid">
                <span>Tâches terminées : {performanceSnapshot.tasksCompleted}/{performanceSnapshot.tasksTotal}</span>
                <span>Tâches non terminées : {performanceSnapshot.tasksNotCompleted}</span>
                <span>Taux réalisation tâches : {performanceSnapshot.taskCompletionRate}%</span>
                <span>Progression moyenne tâches : {performanceSnapshot.averageTaskProgress}%</span>
                <span>Feuille de route réalisée : {performanceSnapshot.roadmapProgress ?? 0}%</span>
                <span>Feuille de route : {performanceSnapshot.roadmapCompletedItems}/{performanceSnapshot.roadmapTotalItems} élément(s)</span>
                <span>Reste feuille de route : {performanceSnapshot.roadmapRemainingItems}</span>
                <span>Jours ouvrés évalués : {performanceSnapshot.workingDaysExpected}</span>
                <span>Absences non couvertes : {formatDayCount(performanceSnapshot.absentDays)} j</span>
                <span>Congés approuvés neutralisés : {formatDayCount(performanceSnapshot.leaveCoveredWorkdays)} j</span>
                <span>Jours sans pointage non couverts : {formatDayCount(performanceSnapshot.unrecordedWorkdays)} j</span>
                <span>Retard cumulé : {performanceSnapshot.lateMinutes} minute(s)</span>
                <span>Heures sup. : {formatMinutes(performanceSnapshot.overtimeMinutes)}</span>
              </div>

              {(performanceSnapshot.automaticDataSummary ?? []).length > 0 && (
                <ul className="evaluation-automatic-summary">
                  {(performanceSnapshot.automaticDataSummary ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="evaluation-print-section evaluation-leave-block">
              <h4><CalendarDays size={18} /> Congés et absences autorisées</h4>
              <p className="evaluation-data-note">
                Les congés approuvés sont présentés séparément et ne sont jamais assimilés à une absence injustifiée dans la note d’assiduité.
              </p>

              <div className="leave-metrics-grid">
                <article><span>Demandes recensées</span><strong>{performanceSnapshot.leaveRequestsTotal}</strong><small>{performanceSnapshot.leaveDraftRequests} brouillon(s)</small></article>
                <article><span>Jours demandés</span><strong>{formatDayCount(performanceSnapshot.leaveRequestedDays)} j</strong></article>
                <article><span>Demandes approuvées</span><strong>{performanceSnapshot.leaveApprovedRequests}</strong></article>
                <article><span>Jours approuvés</span><strong>{formatDayCount(performanceSnapshot.leaveApprovedDays)} j</strong></article>
                <article><span>En validation</span><strong>{performanceSnapshot.leaveSubmittedRequests + performanceSnapshot.leaveManagerApprovedRequests}</strong><small>{formatDayCount(performanceSnapshot.leavePendingDays)} j</small></article>
                <article><span>Refusées</span><strong>{performanceSnapshot.leaveRejectedRequests}</strong><small>{formatDayCount(performanceSnapshot.leaveRejectedDays)} j</small></article>
                <article><span>Annulées</span><strong>{performanceSnapshot.leaveCancelledRequests}</strong><small>{formatDayCount(performanceSnapshot.leaveCancelledDays)} j</small></article>
                <article><span>Taux d’approbation</span><strong>{performanceSnapshot.leaveApprovalRate}%</strong></article>
              </div>

              <div className="leave-balance-card">
                <div>
                  <span>Solde annuel {evaluation.evaluationYear}</span>
                  <strong>
                    {performanceSnapshot.annualLeaveBalanceConfigured
                      ? `${formatDayCount(performanceSnapshot.annualLeaveAvailableDays)} jour(s) disponible(s)`
                      : "Solde non configuré"}
                  </strong>
                </div>
                {performanceSnapshot.annualLeaveBalanceConfigured && (
                  <div className="leave-balance-details">
                    <span>Ouverture : {formatDayCount(performanceSnapshot.annualLeaveOpeningDays)} j</span>
                    <span>Droits : {formatDayCount(performanceSnapshot.annualLeaveEntitledDays)} j</span>
                    <span>Report : {formatDayCount(performanceSnapshot.annualLeaveCarriedOverDays)} j</span>
                    <span>Ajustement : {formatDayCount(performanceSnapshot.annualLeaveAdjustmentDays)} j</span>
                    <span>Consommés : {formatDayCount(performanceSnapshot.annualLeaveConsumedDays)} j</span>
                  </div>
                )}
              </div>

              {(performanceSnapshot.leaveTypeBreakdown ?? []).some((item) => item.requestsTotal > 0) && (
                <div className="leave-breakdown-list">
                  {(performanceSnapshot.leaveTypeBreakdown ?? [])
                    .filter((item) => item.requestsTotal > 0)
                    .map((item) => (
                      <article key={item.leaveType}>
                        <div>
                          <strong>{leaveTypeLabels[item.leaveType]}</strong>
                          <span>{item.requestsTotal} demande(s) · {formatDayCount(item.requestedDays)} jour(s) demandé(s)</span>
                        </div>
                        <b>{item.approvedRequests} approuvée(s) · {formatDayCount(item.approvedDays)} j</b>
                      </article>
                    ))}
                </div>
              )}
            </section>

            <section className="evaluation-print-section">
              <h4><CheckCircle2 size={18} /> Grille d’appréciation</h4>
              {evaluation.criteria.map((criterion) => (
                <article key={criterion.key} className="criterion-print">
                  <div>
                    <strong>{criterion.label}</strong>
                    <span>Poids : {criterion.weight}% · Score final : {criterion.finalScore ?? criterion.systemSuggestedScore ?? 0}/5</span>
                  </div>
                  <p>{criterion.description}</p>
                  {criterion.scoreBasis && <small className="criterion-score-basis">{criterion.scoreBasis}</small>}
                  {(criterion.automationDetails ?? []).length > 0 && (
                    <ul className="criterion-automation-details">
                      {(criterion.automationDetails ?? []).map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
                  {criterion.comment && <small>{criterion.comment}</small>}
                </article>
              ))}
            </section>

            {evaluation.evidenceLinks.length > 0 && (
              <section className="evaluation-print-section">
                <h4>Liens et éléments probants</h4>
                {evaluation.evidenceLinks.map((link) => (
                  <p key={link.url}><strong>{link.title}</strong> : {link.url}</p>
                ))}
              </section>
            )}

            <section className="evaluation-print-section evaluation-smart-lists">
              <h4>Forces, alertes et actions recommandées</h4>
              <div className="smart-list-grid">
                <div>
                  <strong>Forces observées</strong>
                  <ul>{evaluation.intelligence.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div>
                  <strong>Points de vigilance</strong>
                  <ul>{evaluation.intelligence.alerts.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div>
                  <strong>Actions RH recommandées</strong>
                  <ul>{evaluation.intelligence.recommendedActions.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div>
                  <strong>Plan 90 jours</strong>
                  <ul>{evaluation.intelligence.next90DayPlan.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              </div>
            </section>

            {(evaluation.intelligence.managerTalkingPoints.length > 0 ||
              evaluation.intelligence.dataWarnings.length > 0) && (
              <section className="evaluation-print-section evaluation-interview-block">
                <h4>Entretien contradictoire et réserves de lecture</h4>
                <div className="smart-list-grid">
                  <div>
                    <strong>Points à traiter pendant l’entretien</strong>
                    <ul>
                      {evaluation.intelligence.managerTalkingPoints.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Réserves sur les données</strong>
                    {evaluation.intelligence.dataWarnings.length > 0 ? (
                      <ul>
                        {evaluation.intelligence.dataWarnings.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>Aucune réserve majeure n’est identifiée sur les données disponibles.</p>
                    )}
                  </div>
                </div>
              </section>
            )}

            <section className="evaluation-print-section">
              <h4><ShieldCheck size={18} /> Conclusion RH</h4>
              <p>{evaluation.generatedConclusion}</p>
              {evaluation.hrValidation?.finalComment && <p>{evaluation.hrValidation.finalComment}</p>}
            </section>

            <section className="evaluation-final-page" aria-label="Visa et signatures">
              <div className="signature-grid">
                <div className="signature-box">
                  <strong>Agent évalué</strong>
                  <span>Nom, date, observations et signature</span>
                </div>
                <div className="signature-box">
                  <strong>Responsable hiérarchique</strong>
                  <span>Nom, fonction, date et signature</span>
                </div>
                <div className="signature-box">
                  <strong>Responsable RH / Direction</strong>
                  <span>Décision, date, visa et signature</span>
                </div>
              </div>

              
            </section>
          </section>
        )}

        {activePanel === "self" && canSelfReview && (
          <ReviewForm
            title="Auto-évaluation de l’agent"
            description="L’agent renseigne ici sa propre lecture des résultats, acquis, difficultés et objectifs de progression."
            criteria={evaluation.criteria}
            form={selfForm}
            mode="self"
            isSubmitting={isSubmitting}
            onChange={setSelfForm}
            onScoreChange={updateScore}
            onSubmit={() => onSubmitSelfReview(selfForm)}
          />
        )}

        {activePanel === "manager" && canManagerReview && (
          <ReviewForm
            title="Appréciation hiérarchique"
            description="Le responsable apprécie la contribution opérationnelle, la qualité du travail et le comportement professionnel."
            criteria={evaluation.criteria}
            form={managerForm}
            mode="manager"
            isSubmitting={isSubmitting}
            onChange={setManagerForm}
            onScoreChange={updateScore}
            onSubmit={() => onSubmitManagerReview(managerForm)}
          />
        )}

        {activePanel === "hr" && canHrValidate && (
          <section className="evaluation-review-panel no-print">
            <h4>Validation RH et décision finale</h4>
            <p>La RH consolide les données, arrête la recommandation et valide la fiche imprimable.</p>

            <label className="evaluation-form-field">
              <span>Décision RH</span>
              <select value={hrForm.finalDecision} onChange={(event) => setHrForm((current) => ({ ...current, finalDecision: event.target.value as EvaluationDecision }))}>
                {Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <CriteriaScores criteria={evaluation.criteria} values={hrForm.criteria} mode="hr" onScoreChange={updateScore} />

            <label className="evaluation-form-field">
              <span>Observation finale RH</span>
              <textarea rows={5} value={hrForm.finalComment ?? ""} onChange={(event) => setHrForm((current) => ({ ...current, finalComment: event.target.value }))} placeholder="Conclusion RH, mesures d’accompagnement, décision ou recommandation finale..." />
            </label>

            <button className="evaluation-primary-button" type="button" onClick={() => onValidateHr(hrForm)} disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle size={18} className="is-spinning" /> : <Save size={18} />}
              <span>Valider l’évaluation</span>
            </button>
          </section>
        )}
      </aside>
    </div>
  );
}

type ReviewFormProps = {
  title: string;
  description: string;
  criteria: Evaluation["criteria"];
  form: SubmitEvaluationReviewInput;
  mode: "self" | "manager";
  isSubmitting: boolean;
  onChange: (value: SubmitEvaluationReviewInput) => void;
  onScoreChange: (mode: "self" | "manager" | "hr", key: string, value: string) => void;
  onSubmit: () => Promise<void>;
};

function ReviewForm({ title, description, criteria, form, mode, isSubmitting, onChange, onScoreChange, onSubmit }: ReviewFormProps) {
  return (
    <section className="evaluation-review-panel no-print">
      <h4>{title}</h4>
      <p>{description}</p>
      <CriteriaScores criteria={criteria} values={form.criteria} mode={mode} onScoreChange={onScoreChange} />
      <label className="evaluation-form-field"><span>Synthèse</span><textarea rows={4} value={form.comment ?? ""} onChange={(event) => onChange({ ...form, comment: event.target.value })} /></label>
      <label className="evaluation-form-field"><span>Forces constatées</span><textarea rows={3} value={form.strengths ?? ""} onChange={(event) => onChange({ ...form, strengths: event.target.value })} /></label>
      <label className="evaluation-form-field"><span>Axes d’amélioration</span><textarea rows={3} value={form.improvementAreas ?? ""} onChange={(event) => onChange({ ...form, improvementAreas: event.target.value })} /></label>
      <label className="evaluation-form-field"><span>Besoins de formation</span><textarea rows={3} value={form.trainingNeeds ?? ""} onChange={(event) => onChange({ ...form, trainingNeeds: event.target.value })} /></label>
      <label className="evaluation-form-field"><span>Objectifs de la prochaine période</span><textarea rows={3} value={form.nextObjectives ?? ""} onChange={(event) => onChange({ ...form, nextObjectives: event.target.value })} /></label>
      <button className="evaluation-primary-button" type="button" disabled={isSubmitting} onClick={() => void onSubmit()}>
        {isSubmitting ? <LoaderCircle size={18} className="is-spinning" /> : <Send size={18} />}
        <span>Enregistrer l’appréciation</span>
      </button>
    </section>
  );
}

type CriteriaScoresProps = {
  criteria: Evaluation["criteria"];
  values?: EvaluationCriterionInput[];
  mode: "self" | "manager" | "hr";
  onScoreChange: (mode: "self" | "manager" | "hr", key: string, value: string) => void;
};

function CriteriaScores({ criteria, values, mode, onScoreChange }: CriteriaScoresProps) {
  return (
    <div className="criteria-score-editor">
      {criteria.map((criterion) => {
        const value = values?.find((item) => item.key === criterion.key);
        const score = mode === "self" ? value?.selfScore : mode === "manager" ? value?.managerScore : value?.hrScore;
        return (
          <label key={criterion.key} className="criteria-score-row">
            <span>{criterion.label}</span>
            <small>Suggestion système : {criterion.systemSuggestedScore ?? "—"}/5 · Poids {criterion.weight}%</small>
            <input type="number" min="0" max="5" step="0.5" value={score ?? ""} onChange={(event) => onScoreChange(mode, criterion.key, event.target.value)} />
          </label>
        );
      })}
    </div>
  );
}
