import { useState } from "react";
import {
  Archive,
  BadgeCheck,
  Download,
  FilePenLine,
  FileText,
  LockKeyhole,
  LoaderCircle,
  Printer,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type { ManagementReport } from "../../features/reports/report.types";
import "./report-page.css";
type Props = {
  report: ManagementReport;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onEdit: () => void;
  onRecompute: () => Promise<void>;
  onValidate: (comment?: string) => Promise<void>;
  onArchive: () => Promise<void>;
};

const reportTypeLabels = {
  MONTHLY: "Rapport mensuel",
  SEMIANNUAL: "Rapport semestriel",
  ANNUAL: "Rapport annuel",
} as const;
const statusLabels = {
  DRAFT: "Brouillon",
  READY: "Prêt pour validation",
  VALIDATED: "Validé",
  ARCHIVED: "Archivé",
} as const;
const riskLabels = {
  LOW: "Faible",
  MODERATE: "Modéré",
  HIGH: "Élevé",
  CRITICAL: "Critique",
} as const;
const governanceLabels = {
  MAITRISE: "Maîtrisée",
  SOUS_CONTROLE: "Sous contrôle",
  A_RENFORCER: "À renforcer",
  CRITIQUE: "Critique",
} as const;
const confidenceLabels = {
  LOW: "Limitée",
  MEDIUM: "Suffisante",
  HIGH: "Robuste",
} as const;
const leaveTypeLabels: Record<string, string> = {
  ANNUAL_LEAVE: "Congé annuel",
  SICK_LEAVE: "Congé maladie",
  MATERNITY_LEAVE: "Congé maternité",
  PATERNITY_LEAVE: "Congé paternité",
  SPECIAL_LEAVE: "Congé spécial",
  UNPAID_LEAVE: "Congé sans solde",
  TRAINING_LEAVE: "Congé de formation",
  OTHER: "Autre",
};

function formatDate(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
function formatNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}
function formatHours(minutes: number): string {
  const total = Math.round(minutes || 0);
  const hours = Math.floor(total / 60);
  const remaining = total % 60;
  return hours
    ? `${hours} h${remaining ? ` ${remaining} min` : ""}`
    : `${remaining} min`;
}
function formatDelta(value: number): string {
  const normalized = Number.isFinite(value) ? value : 0;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${formatNumber(normalized)} pt`;
}

function deltaClass(value: number): string {
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "is-neutral";
}
function scopeLabel(report: ManagementReport): string {
  if (report.scopeType === "INSTITUTION") return "Organisation";
  if (report.scopeType === "DIRECTION")
    return report.scopeSnapshot.directionName ?? "Direction";
  return `${report.scopeSnapshot.directionName ?? "Direction"} — ${
    report.scopeSnapshot.serviceName ?? "Service"
  }`;
}

function safeFileName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "rapport-rh";
}

/**
 * Normalise le texte destiné aux exports bureautiques.
 *
 * Objectif :
 * - conserver des espaces humains entre chiffres et unités/mots ;
 * - supprimer les retours/espaces techniques issus du DOM ;
 * - stabiliser les séparateurs utilisés dans les rapports.
 */
function normalizeReportText(
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

function decorateReportTables(
  root: HTMLElement,
): void {
  root
    .querySelectorAll<HTMLTableElement>(
      ".report-table",
    )
    .forEach((table) => {
      table.style.width = "100%";
      table.style.maxWidth = "100%";
      table.style.minWidth = "0";
      table.style.tableLayout = "fixed";
      table.style.borderCollapse =
        "collapse";

      table
        .querySelectorAll<HTMLTableCellElement>(
          "th, td",
        )
        .forEach((cell) => {
          cell.style.whiteSpace =
            "normal";
          cell.style.overflowWrap =
            "anywhere";
          cell.style.wordBreak =
            "normal";
        });

      table
        .querySelectorAll<HTMLTableRowElement>(
          "tbody tr",
        )
        .forEach((row, index) => {
          row.style.backgroundColor =
            index % 2 === 0
              ? "#ffffff"
              : "#eef7f1";

          row
            .querySelectorAll<HTMLTableCellElement>(
              "td",
            )
            .forEach((cell) => {
              cell.style.borderColor =
                "#9fbea9";
              cell.style.borderWidth =
                "1px";
              cell.style.borderStyle =
                "solid";
            });

          const firstCell =
            row.querySelector<HTMLTableCellElement>(
              "td:first-child",
            );

          if (firstCell) {
            firstCell.style.backgroundColor =
              index % 2 === 0
                ? "#f7fbf8"
                : "#e5f2e9";
            firstCell.style.fontWeight =
              "700";
          }
        });
    });
}

function prepareExportClone(): HTMLElement | null {
  const source =
    document.querySelector<HTMLElement>(
      ".report-printable-document",
    );

  if (!source) {
    return null;
  }

  const clone =
    source.cloneNode(
      true,
    ) as HTMLElement;

  clone
    .querySelectorAll(
      ".report-official-letterhead, .report-document-footer, .report-screen-only",
    )
    .forEach((element) =>
      element.remove(),
    );

  clone.classList.add(
    "report-export-clone",
  );

  decorateReportTables(clone);

  clone
    .querySelectorAll<HTMLElement>(
      ".report-table-wrap",
    )
    .forEach((wrapper) => {
      wrapper.style.width = "100%";
      wrapper.style.maxWidth = "100%";
      wrapper.style.overflow =
        "visible";
    });

  return clone;
}

function exportDocumentCss(): string {
  return `
    @page {
      size: A4 portrait;
      margin: 13mm 12mm 14mm 12mm;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      width: 100%;
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #173841;
      font-family: Aptos, Calibri, Arial, Helvetica, sans-serif;
      font-size: 10pt;
      line-height: 1.5;
    }

    .report-printable-document,
    .report-export-clone {
      display: block;
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 0;
      border: 0;
      background: #ffffff;
      box-shadow: none;
    }

    .report-official-letterhead,
    .report-document-footer,
    .report-screen-only {
      display: none !important;
    }

    .report-document-title {
      width: 100%;
      margin: 0 0 12pt;
      padding: 13pt;
      border: 1pt solid #bdd8c7;
      background: #eef8f2;
      page-break-inside: avoid;
    }

    .report-document-kicker {
      display: block;
      margin-bottom: 4pt;
      color: #046242;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: .05em;
    }

    .report-document-title h1 {
      margin: 4pt 0 5pt;
      color: #0b2536;
      font-size: 17pt;
      line-height: 1.16;
    }

    .report-document-title p {
      margin: 0;
      color: #536d74;
      font-size: 8.5pt;
      line-height: 1.5;
    }

    .report-index-badge {
      width: fit-content;
      margin-top: 8pt;
      padding: 6pt 10pt;
      border: 1pt solid #046242;
      background: #046242;
      color: #ffffff;
      font-size: 11pt;
      font-weight: 700;
    }

    .report-section {
      width: 100%;
      margin-top: 12pt;
    }

    .report-section-title {
      margin: 0 0 7pt;
      padding: 6pt 8pt;
      border-left: 4pt solid #e9b521;
      background: #f2f7f4;
      color: #0b2536;
      font-size: 9pt;
      font-weight: 700;
      line-height: 1.25;
      text-transform: uppercase;
      page-break-after: avoid;
    }

    .report-section p {
      margin: 0 0 7pt;
      color: #405e66;
      line-height: 1.58;
      text-align: justify;
      white-space: pre-line;
    }

    .report-meta-grid,
    .report-kpi-grid,
    .report-module-grid,
    .report-analysis-grid,
    .report-comparison-grid {
      display: grid;
      width: 100%;
      gap: 7pt;
    }

    .report-meta-grid,
    .report-module-grid,
    .report-analysis-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .report-kpi-grid,
    .report-comparison-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .report-meta-card,
    .report-kpi-card,
    .report-module-card,
    .report-analysis-card,
    .report-editorial-block,
    .report-comparison-grid article {
      min-width: 0;
      padding: 8pt;
      border: 1pt solid #c8ddd0;
      background: #ffffff;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .report-meta-card span,
    .report-kpi-card span,
    .report-module-card span,
    .report-comparison-grid span {
      display: block;
      margin-bottom: 3pt;
      color: #60777f;
      font-size: 7pt;
      font-weight: 700;
    }

    .report-meta-card strong,
    .report-kpi-card strong,
    .report-module-card strong,
    .report-comparison-grid strong {
      display: block;
      color: #173841;
      font-size: 9pt;
      line-height: 1.35;
    }

    .report-module-card small,
    .report-meta-card small,
    .report-kpi-card small {
      display: block;
      margin-top: 4pt;
      color: #60777f;
      font-size: 7pt;
      line-height: 1.4;
    }

    .report-executive-summary,
    .report-director-note,
    .report-warning-box,
    .report-editorial-block {
      padding: 9pt;
      border: 1pt solid #c8ddd0;
      background: #f8fbf9;
      white-space: pre-line;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .report-director-note {
      border-color: #dfc877;
      background: #fff9e9;
    }

    .report-editorial-block {
      margin-bottom: 7pt;
      background: #ffffff;
    }

    .report-editorial-block h4 {
      margin: 0 0 5pt;
      color: #046242;
      font-size: 9pt;
    }

    .report-editorial-block.is-confidential {
      border-color: #d8c06c;
      background: #fffaf0;
    }

    .report-table-wrap {
      width: 100% !important;
      max-width: 100% !important;
      overflow: visible !important;
    }

    .report-table {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      margin-top: 5pt;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 6.8pt;
    }

    .report-table thead {
      display: table-header-group;
    }

    .report-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .report-table th,
    .report-table td {
      padding: 4.5pt 3pt;
      border: 1pt solid #9fbea9;
      vertical-align: middle;
      white-space: normal !important;
      overflow-wrap: anywhere;
      word-break: normal;
    }

    .report-table th {
      background: #046242;
      color: #ffffff;
      font-weight: 700;
      line-height: 1.25;
      text-align: center;
    }

    .report-table td {
      color: #173841;
      line-height: 1.3;
      text-align: center;
    }

    .report-table td:first-child,
    .report-table th:first-child {
      text-align: left;
    }

    .report-table tbody tr:nth-child(odd) {
      background: #ffffff;
    }

    .report-table tbody tr:nth-child(even) {
      background: #eef7f1;
    }

    .report-table tbody tr:nth-child(even) td:first-child {
      background: #e5f2e9;
    }

    .report-list,
    .report-source-list {
      margin: 4pt 0 7pt;
      padding-left: 18pt;
    }

    .report-list li,
    .report-source-list li {
      margin: 2pt 0;
      line-height: 1.45;
    }

    .report-signatures {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12pt;
      width: 100%;
      margin-top: 22pt;
      page-break-inside: avoid;
    }

    .report-signature {
      min-height: 42pt;
      padding-top: 7pt;
      border-top: 1pt solid #173841;
    }

    .report-signature strong,
    .report-signature span {
      display: block;
    }

    .report-signature span {
      margin-top: 3pt;
      color: #60777f;
      font-size: 7pt;
    }

    h1,
    h2,
    h3,
    h4 {
      page-break-after: avoid;
    }
  `;
}

function buildStandaloneHtml(
  report: ManagementReport,
): string | null {
  const clone =
    prepareExportClone();

  if (!clone) {
    return null;
  }

  const safeTitle =
    `${report.reference} - Rapport de gestion`;

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeTitle}</title>
  <style>${exportDocumentCss()}</style>
</head>
<body>
  ${clone.outerHTML}
</body>
</html>`;
}

/* ------------------------------------------------------------------
   WORD (.docx)
   ------------------------------------------------------------------ */

function directChildText(
  element: Element,
  selector: string,
): string {
  return normalizeReportText(
    element.querySelector(
      selector,
    )?.textContent,
  );
}

function createDocxTextParagraph(
  docx: any,
  text: string,
  options: {
    bold?: boolean;
    color?: string;
    size?: number;
    italic?: boolean;
    align?: any;
    shading?: string;
    borderColor?: string;
    before?: number;
    after?: number;
    keepNext?: boolean;
  } = {},
): any {
  const normalized =
    normalizeReportText(text);

  return new docx.Paragraph({
    alignment:
      options.align,
    keepNext:
      options.keepNext,
    spacing: {
      before:
        options.before ?? 0,
      after:
        options.after ?? 120,
      line: 276,
    },
    shading: options.shading
      ? {
          fill:
            options.shading,
        }
      : undefined,
    border: options.borderColor
      ? {
          left: {
            style:
              docx.BorderStyle.SINGLE,
            size: 18,
            color:
              options.borderColor,
            space: 6,
          },
        }
      : undefined,
    children: [
      new docx.TextRun({
        text: normalized,
        bold:
          options.bold,
        italics:
          options.italic,
        color:
          options.color ??
          "173841",
        size:
          options.size ??
          20,
        font: "Aptos",
      }),
    ],
  });
}

function createDocxCell(
  docx: any,
  element: Element | null,
  options: {
    widthPercent: number;
    fill?: string;
    header?: boolean;
  },
): any {
  const paragraphs: any[] = [];

  if (element) {
    const label =
      directChildText(
        element,
        ":scope > span",
      );

    const value =
      directChildText(
        element,
        ":scope > strong",
      );

    const details =
      Array.from(
        element.querySelectorAll(
          ":scope > small, :scope > p",
        ),
      )
        .map((node) =>
          normalizeReportText(
            node.textContent,
          ),
        )
        .filter(Boolean);

    if (label) {
      paragraphs.push(
        createDocxTextParagraph(
          docx,
          label,
          {
            bold: true,
            color:
              options.header
                ? "FFFFFF"
                : "60777F",
            size: 15,
            after: 50,
          },
        ),
      );
    }

    if (value) {
      paragraphs.push(
        createDocxTextParagraph(
          docx,
          value,
          {
            bold: true,
            color:
              options.header
                ? "FFFFFF"
                : "173841",
            size: 19,
            after: 55,
          },
        ),
      );
    }

    for (const detail of details) {
      paragraphs.push(
        createDocxTextParagraph(
          docx,
          detail,
          {
            color:
              options.header
                ? "FFFFFF"
                : "60777F",
            size: 15,
            after: 45,
          },
        ),
      );
    }

    const listItems =
      Array.from(
        element.querySelectorAll(
          ":scope > ul > li, :scope > ol > li",
        ),
      );

    for (const item of listItems) {
      const text =
        normalizeReportText(
          item.textContent,
        );

      if (!text) continue;

      paragraphs.push(
        new docx.Paragraph({
          bullet: {
            level: 0,
          },
          spacing: {
            after: 45,
          },
          children: [
            new docx.TextRun({
              text,
              font: "Aptos",
              size: 15,
              color: "405E66",
            }),
          ],
        }),
      );
    }
  }

  if (!paragraphs.length) {
    paragraphs.push(
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: "",
          }),
        ],
      }),
    );
  }

  return new docx.TableCell({
    width: {
      size:
        options.widthPercent,
      type:
        docx.WidthType.PERCENTAGE,
    },
    verticalAlign:
      docx.VerticalAlign.CENTER,
    shading: {
      fill:
        options.fill ??
        "FFFFFF",
    },
    margins: {
      top: 90,
      right: 100,
      bottom: 90,
      left: 100,
    },
    children: paragraphs,
  });
}

function createDocxCardGrid(
  docx: any,
  grid: Element,
  columns: number,
): any {
  const cards =
    Array.from(grid.children);

  const rows: any[] = [];

  for (
    let index = 0;
    index < cards.length;
    index += columns
  ) {
    const rowCells: any[] = [];

    for (
      let column = 0;
      column < columns;
      column += 1
    ) {
      const card =
        cards[
          index + column
        ] ?? null;

      rowCells.push(
        createDocxCell(
          docx,
          card,
          {
            widthPercent:
              100 / columns,
            fill:
              Math.floor(
                index / columns,
              ) %
                2 ===
              0
                ? "FFFFFF"
                : "F3F8F5",
          },
        ),
      );
    }

    rows.push(
      new docx.TableRow({
        cantSplit: true,
        children: rowCells,
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
        size: 5,
        color: "C8DDD0",
      },
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 5,
        color: "C8DDD0",
      },
      left: {
        style:
          docx.BorderStyle.SINGLE,
        size: 5,
        color: "C8DDD0",
      },
      right: {
        style:
          docx.BorderStyle.SINGLE,
        size: 5,
        color: "C8DDD0",
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color: "D8E5DD",
      },
      insideVertical: {
        style:
          docx.BorderStyle.SINGLE,
        size: 4,
        color: "D8E5DD",
      },
    },
  });
}

function createDocxDataTable(
  docx: any,
  htmlTable: HTMLTableElement,
): any {
  const htmlRows =
    Array.from(
      htmlTable.rows,
    );

  const columnCount =
    Math.max(
      1,
      ...htmlRows.map(
        (row) =>
          row.cells.length,
      ),
    );

  const rows =
    htmlRows.map(
      (row, rowIndex) => {
        const headerRow =
          row.parentElement
            ?.tagName ===
            "THEAD" ||
          rowIndex === 0 &&
            htmlTable.tHead?.rows[
              0
            ] === row;

        const cells =
          Array.from(
            row.cells,
          ).map(
            (
              htmlCell,
              cellIndex,
            ) => {
              const text =
                normalizeReportText(
                  htmlCell.textContent,
                );

              const fill =
                headerRow
                  ? "046242"
                  : rowIndex %
                        2 ===
                      0
                    ? "EEF7F1"
                    : "FFFFFF";

              const firstColumnFill =
                !headerRow &&
                cellIndex === 0
                  ? rowIndex %
                        2 ===
                      0
                    ? "E5F2E9"
                    : "F7FBF8"
                  : fill;

              return new docx.TableCell({
                width: {
                  size:
                    100 /
                    columnCount,
                  type:
                    docx.WidthType.PERCENTAGE,
                },
                verticalAlign:
                  docx.VerticalAlign.CENTER,
                shading: {
                  fill:
                    firstColumnFill,
                },
                margins: {
                  top: 70,
                  right: 70,
                  bottom: 70,
                  left: 70,
                },
                children: [
                  createDocxTextParagraph(
                    docx,
                    text,
                    {
                      bold:
                        headerRow ||
                        cellIndex ===
                          0,
                      color:
                        headerRow
                          ? "FFFFFF"
                          : "173841",
                      size:
                        columnCount >
                        6
                          ? 13
                          : 15,
                      align:
                        cellIndex ===
                        0
                          ? docx
                              .AlignmentType
                              .LEFT
                          : docx
                              .AlignmentType
                              .CENTER,
                      after: 0,
                    },
                  ),
                ],
              });
            },
          );

        while (
          cells.length <
          columnCount
        ) {
          cells.push(
            createDocxCell(
              docx,
              null,
              {
                widthPercent:
                  100 /
                  columnCount,
              },
            ),
          );
        }

        return new docx.TableRow({
          tableHeader:
            headerRow,
          cantSplit: true,
          children: cells,
        });
      },
    );

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
        size: 6,
        color: "9FBEA9",
      },
      bottom: {
        style:
          docx.BorderStyle.SINGLE,
        size: 6,
        color: "9FBEA9",
      },
      left: {
        style:
          docx.BorderStyle.SINGLE,
        size: 6,
        color: "9FBEA9",
      },
      right: {
        style:
          docx.BorderStyle.SINGLE,
        size: 6,
        color: "9FBEA9",
      },
      insideHorizontal: {
        style:
          docx.BorderStyle.SINGLE,
        size: 5,
        color: "AAC8B6",
      },
      insideVertical: {
        style:
          docx.BorderStyle.SINGLE,
        size: 5,
        color: "AAC8B6",
      },
    },
  });
}

function buildDocxBlocks(
  docx: any,
  root: HTMLElement,
): any[] {
  const blocks: any[] = [];

  const processElement = (
    element: Element,
  ): void => {
    if (
      element.classList.contains(
        "report-document-title",
      )
    ) {
      const kicker =
        directChildText(
          element,
          ".report-document-kicker",
        );

      const title =
        directChildText(
          element,
          "h1",
        );

      const subtitle =
        directChildText(
          element,
          "p",
        );

      const index =
        directChildText(
          element,
          ".report-index-badge",
        );

      if (kicker) {
        blocks.push(
          createDocxTextParagraph(
            docx,
            kicker,
            {
              bold: true,
              color: "046242",
              size: 15,
              after: 70,
            },
          ),
        );
      }

      if (title) {
        blocks.push(
          createDocxTextParagraph(
            docx,
            title,
            {
              bold: true,
              color: "0B2536",
              size: 32,
              after: 90,
              keepNext: true,
            },
          ),
        );
      }

      if (subtitle) {
        blocks.push(
          createDocxTextParagraph(
            docx,
            subtitle,
            {
              color: "536D74",
              size: 17,
              after: 90,
            },
          ),
        );
      }

      if (index) {
        blocks.push(
          createDocxTextParagraph(
            docx,
            `Indice de performance : ${index}`,
            {
              bold: true,
              color: "FFFFFF",
              size: 18,
              shading: "046242",
              after: 180,
            },
          ),
        );
      }

      return;
    }

    if (
      element.classList.contains(
        "report-section",
      )
    ) {
      const title =
        directChildText(
          element,
          ":scope > .report-section-title",
        );

      if (title) {
        blocks.push(
          createDocxTextParagraph(
            docx,
            title,
            {
              bold: true,
              color: "0B2536",
              size: 19,
              shading: "F2F7F4",
              borderColor:
                "E9B521",
              before: 160,
              after: 100,
              keepNext: true,
            },
          ),
        );
      }

      Array.from(
        element.children,
      ).forEach((child) => {
        if (
          child.classList.contains(
            "report-section-title",
          )
        ) {
          return;
        }

        processElement(child);
      });

      return;
    }

    if (
      element.classList.contains(
        "report-meta-grid",
      )
    ) {
      blocks.push(
        createDocxCardGrid(
          docx,
          element,
          2,
        ),
      );

      return;
    }

    if (
      element.classList.contains(
        "report-kpi-grid",
      )
    ) {
      blocks.push(
        createDocxCardGrid(
          docx,
          element,
          3,
        ),
      );

      return;
    }

    if (
      element.classList.contains(
        "report-module-grid",
      ) ||
      element.classList.contains(
        "report-analysis-grid",
      )
    ) {
      blocks.push(
        createDocxCardGrid(
          docx,
          element,
          2,
        ),
      );

      return;
    }

    if (
      element.classList.contains(
        "report-comparison-grid",
      )
    ) {
      blocks.push(
        createDocxCardGrid(
          docx,
          element,
          3,
        ),
      );

      return;
    }

    if (
      element.classList.contains(
        "report-table-wrap",
      )
    ) {
      const table =
        element.querySelector<HTMLTableElement>(
          ".report-table",
        );

      if (table) {
        blocks.push(
          createDocxDataTable(
            docx,
            table,
          ),
        );
      }

      return;
    }

    if (
      element.classList.contains(
        "report-executive-summary",
      ) ||
      element.classList.contains(
        "report-director-note",
      ) ||
      element.classList.contains(
        "report-warning-box",
      ) ||
      element.classList.contains(
        "report-editorial-block",
      )
    ) {
      const heading =
        directChildText(
          element,
          ":scope > h4",
        );

      if (heading) {
        blocks.push(
          createDocxTextParagraph(
            docx,
            heading,
            {
              bold: true,
              color:
                element.classList.contains(
                  "is-confidential",
                )
                  ? "86620F"
                  : "046242",
              size: 17,
              after: 55,
              keepNext: true,
            },
          ),
        );
      }

      const paragraphs =
        Array.from(
          element.querySelectorAll(
            ":scope > p",
          ),
        );

      if (
        paragraphs.length
      ) {
        for (
          const paragraph of paragraphs
        ) {
          const text =
            normalizeReportText(
              paragraph.textContent,
            );

          if (!text) continue;

          blocks.push(
            createDocxTextParagraph(
              docx,
              text,
              {
                color: "405E66",
                size: 18,
                shading:
                  element.classList.contains(
                    "is-confidential",
                  )
                    ? "FFFAF0"
                    : element.classList.contains(
                          "report-director-note",
                        )
                      ? "FFF9E9"
                      : "F8FBF9",
                after: 100,
              },
            ),
          );
        }
      } else {
        const text =
          normalizeReportText(
            element.textContent,
          );

        if (text) {
          blocks.push(
            createDocxTextParagraph(
              docx,
              text,
              {
                color: "405E66",
                size: 18,
                shading:
                  "F8FBF9",
                after: 100,
              },
            ),
          );
        }
      }

      return;
    }

    if (
      element.matches(
        "ul.report-list, ul.report-source-list, ol.report-list",
      )
    ) {
      const ordered =
        element.tagName === "OL";

      Array.from(
        element.querySelectorAll(
          ":scope > li",
        ),
      ).forEach(
        (item, index) => {
          const text =
            normalizeReportText(
              item.textContent,
            );

          if (!text) return;

          blocks.push(
            new docx.Paragraph({
              bullet: ordered
                ? undefined
                : {
                    level: 0,
                  },
              spacing: {
                after: 60,
                line: 260,
              },
              children: [
                new docx.TextRun({
                  text: ordered
                    ? `${index + 1}. ${text}`
                    : text,
                  font: "Aptos",
                  size: 17,
                  color: "405E66",
                }),
              ],
            }),
          );
        },
      );

      return;
    }

    if (
      element.classList.contains(
        "report-signatures",
      )
    ) {
      const signatures =
        Array.from(
          element.querySelectorAll(
            ":scope > .report-signature",
          ),
        );

      blocks.push(
        createDocxCardGrid(
          docx,
          element,
          Math.max(
            1,
            signatures.length,
          ),
        ),
      );

      return;
    }

    if (
      element.matches(
        "p.report-comparison-reference, p",
      )
    ) {
      const text =
        normalizeReportText(
          element.textContent,
        );

      if (text) {
        blocks.push(
          createDocxTextParagraph(
            docx,
            text,
            {
              color: "405E66",
              size: 17,
              after: 90,
            },
          ),
        );
      }

      return;
    }

    Array.from(
      element.children,
    ).forEach(
      processElement,
    );
  };

  Array.from(
    root.children,
  ).forEach(
    processElement,
  );

  return blocks;
}

async function downloadWordReport(
  report: ManagementReport,
): Promise<void> {
  const clone =
    prepareExportClone();

  if (!clone) {
    throw new Error(
      "Le contenu du rapport est introuvable.",
    );
  }

  const docx =
    await import("docx");

  const blocks =
    buildDocxBlocks(
      docx,
      clone,
    );

  const document =
    new docx.Document({
      creator: "RH",
      title: report.title,
      subject: report.reference,
      description:
        "Rapport de gestion ",
      styles: {
        default: {
          document: {
            run: {
              font: "Aptos",
              size: 20,
              color: "173841",
            },
            paragraph: {
              spacing: {
                after: 120,
                line: 276,
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
                top: 720,
                right: 650,
                bottom: 720,
                left: 650,
              },
            },
          },
          children: blocks,
        },
      ],
    });

  const blob =
    await docx.Packer.toBlob(
      document,
    );

  triggerBlobDownload(
    blob,
    `${safeFileName(
      report.reference,
    )}.docx`,
  );
}

/* ------------------------------------------------------------------
   PDF - rendu intégral avec découpage contrôlé des pages
   ------------------------------------------------------------------ */

function collectPdfBreakpoints(
  root: HTMLElement,
  scale: number,
): number[] {
  const rootRect =
    root.getBoundingClientRect();

  const selectors = [
    ".report-section",
    ".report-section-title",
    ".report-editorial-block",
    ".report-module-card",
    ".report-analysis-card",
    ".report-kpi-card",
    ".report-meta-card",
    ".report-table tr",
    ".report-signatures",
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
    (a, b) => a - b,
  );
}

function choosePdfSliceEnd(
  start: number,
  target: number,
  total: number,
  breakpoints: number[],
): number {
  if (target >= total) {
    return total;
  }

  const desiredHeight =
    target - start;

  const minUsefulHeight =
    start +
    desiredHeight * 0.58;

  const safeCandidates =
    breakpoints.filter(
      (point) =>
        point > minUsefulHeight &&
        point <= target - 8,
    );

  if (safeCandidates.length) {
    return safeCandidates[
      safeCandidates.length - 1
    ];
  }

  return Math.min(
    target,
    total,
  );
}

async function downloadPdfReport(
  report: ManagementReport,
): Promise<void> {
  const clone =
    prepareExportClone();

  if (!clone) {
    throw new Error(
      "Le contenu du rapport est introuvable.",
    );
  }

  const html2canvasModule =
    await import("html2canvas");

  const html2canvas =
    html2canvasModule.default;

  const { jsPDF } =
    await import("jspdf");

  const host =
    document.createElement("div");

  host.className =
    "report-export-host";

  host.setAttribute(
    "aria-hidden",
    "true",
  );

  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await new Promise<void>(
      (resolve) =>
        requestAnimationFrame(
          () =>
            requestAnimationFrame(
              () => resolve(),
            ),
        ),
    );

    const exportWidthPx = 794;

    clone.style.width =
      `${exportWidthPx}px`;
    clone.style.maxWidth =
      `${exportWidthPx}px`;

    const contentHeight =
      Math.max(
        clone.scrollHeight,
        clone.offsetHeight,
      );

    /**
     * Le scale est ajusté pour conserver de la qualité sans dépasser
     * les limites habituelles de hauteur de canvas des navigateurs.
     */
    const renderScale =
      Math.max(
        1,
        Math.min(
          1.75,
          30000 /
            Math.max(
              contentHeight,
              1,
            ),
        ),
      );

    const canvas =
      await html2canvas(
        clone,
        {
          backgroundColor:
            "#ffffff",
          scale: renderScale,
          useCORS: true,
          logging: false,
          width: exportWidthPx,
          windowWidth:
            exportWidthPx,
          height:
            contentHeight,
          windowHeight:
            contentHeight,
          scrollX: 0,
          scrollY: 0,
        },
      );

    const pdf =
      new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
        putOnlyUsedFonts: true,
      });

    pdf.setProperties({
      title: report.title,
      subject: `${report.reference} — Rapport de gestion `,
      author:
        report.preparedByName,
      creator: "RH",
    });

    const marginLeftMm = 12;
    const marginTopMm = 12;
    const marginBottomMm = 13;
    const contentWidthMm =
      210 -
      marginLeftMm -
      12;

    const contentHeightMm =
      297 -
      marginTopMm -
      marginBottomMm;

    const maxSliceHeightPx =
      Math.floor(
        canvas.width *
          (contentHeightMm /
            contentWidthMm),
      );

    const scaleFromDomToCanvas =
      canvas.width /
      exportWidthPx;

    const breakpoints =
      collectPdfBreakpoints(
        clone,
        scaleFromDomToCanvas,
      );

    let startY = 0;
    let pageIndex = 0;

    while (
      startY <
      canvas.height
    ) {
      const targetY =
        Math.min(
          canvas.height,
          startY +
            maxSliceHeightPx,
        );

      const endY =
        choosePdfSliceEnd(
          startY,
          targetY,
          canvas.height,
          breakpoints,
        );

      const sliceHeight =
        Math.max(
          1,
          endY - startY,
        );

      const pageCanvas =
        document.createElement(
          "canvas",
        );

      pageCanvas.width =
        canvas.width;
      pageCanvas.height =
        sliceHeight;

      const context =
        pageCanvas.getContext(
          "2d",
        );

      if (!context) {
        throw new Error(
          "Impossible de préparer une page PDF.",
        );
      }

      context.fillStyle =
        "#ffffff";
      context.fillRect(
        0,
        0,
        pageCanvas.width,
        pageCanvas.height,
      );

      context.drawImage(
        canvas,
        0,
        startY,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight,
      );

      if (pageIndex > 0) {
        pdf.addPage(
          "a4",
          "portrait",
        );
      }

      const imageHeightMm =
        (sliceHeight /
          canvas.width) *
        contentWidthMm;

      pdf.addImage(
        pageCanvas.toDataURL(
          "image/jpeg",
          0.97,
        ),
        "JPEG",
        marginLeftMm,
        marginTopMm,
        contentWidthMm,
        imageHeightMm,
        undefined,
        "FAST",
      );

      startY = endY;
      pageIndex += 1;
    }

    pdf.save(
      `${safeFileName(
        report.reference,
      )}.pdf`,
    );
  } finally {
    host.remove();
  }
}

function triggerBlobDownload(
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

async function printReport(
  report: ManagementReport,
): Promise<void> {
  const html =
    buildStandaloneHtml(report);

  if (!html) {
    throw new Error(
      "Le contenu du rapport est introuvable.",
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
  popup.document.write(html);
  popup.document.close();
  popup.opener = null;

  window.setTimeout(() => {
    popup.focus();
    popup.print();
  }, 180);
}

export default function ReportDetailsDrawer({
  report,
  isSubmitting,
  errorMessage,
  onClose,
  onEdit,
  onRecompute,
  onValidate,
  onArchive,
}: Props) {
  const [validationOpen, setValidationOpen] = useState(false);
  const [validationComment, setValidationComment] = useState(
    report.validationComment ?? ""
  );
  const [exporting, setExporting] = useState<
    "PDF" | "WORD" | "PRINT" | null
  >(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const {
    isOwner,
    canEdit,
    canRecompute,
    canValidate,
    canArchive,
    canDownload,
  } = report.permissions;

  async function runExport(
    kind: "PDF" | "WORD" | "PRINT",
  ): Promise<void> {
    setExportError(null);
    setExporting(kind);

    try {
      if (kind === "PDF") {
        await downloadPdfReport(report);
      } else if (kind === "WORD") {
        await downloadWordReport(report);
      } else {
        await printReport(report);
      }
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "L'export du rapport a échoué.",
      );
    } finally {
      setExporting(null);
    }
  }
  const w = report.snapshot.workforce;
  const t = report.snapshot.tasks;
  const a = report.snapshot.attendance;
  const l = report.snapshot.leaves;
  const r = report.snapshot.roadmaps;
  const e = report.snapshot.evaluations;

  return (
    <div className="report-drawer-layer">
      <button
        className="report-drawer-backdrop"
        type="button"
        onClick={onClose}
        aria-label="Fermer"
      />
      <aside className="report-drawer" role="dialog" aria-modal="true">
        <header className="report-drawer-header report-screen-only">
          <div>
            <p>RAPPORT DE PILOTAGE</p>
            <h3>{report.reference}</h3>
          </div>
          <button
            type="button"
            className="report-icon-button"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="report-drawer-actions report-screen-only">
          {canDownload && (
            <>
              <button
                type="button"
                className="report-secondary-button"
                disabled={Boolean(exporting)}
                onClick={() => void runExport("PDF")}
                title="Télécharger ce rapport en PDF sans en-tête ni pied de page"
               aria-label="Télécharger ce rapport en PDF sans en-tête ni pied de page">
                {exporting === "PDF" ? (
                  <LoaderCircle size={17} className="is-spinning" />
                ) : (
                  <Download size={17} />
                )}
                PDF
              </button>

              <button
                type="button"
                className="report-secondary-button"
                disabled={Boolean(exporting)}
                onClick={() => void runExport("WORD")}
                title="Télécharger un véritable document Microsoft Word (.docx)"
               aria-label="Télécharger un véritable document Microsoft Word (.docx)">
                {exporting === "WORD" ? (
                  <LoaderCircle size={17} className="is-spinning" />
                ) : (
                  <FileText size={17} />
                )}
                Word (.docx)
              </button>

              <button
                type="button"
                className="report-secondary-button"
                disabled={Boolean(exporting)}
                onClick={() => void runExport("PRINT")}
              >
                {exporting === "PRINT" ? (
                  <LoaderCircle size={17} className="is-spinning" />
                ) : (
                  <Printer size={17} />
                )}
                Imprimer
              </button>
            </>
          )}
          {canEdit && (
            <button
              type="button"
              className="report-secondary-button"
              onClick={onEdit}
            >
              <FilePenLine size={17} /> Compléter
            </button>
          )}
          {canRecompute && (
            <button
              type="button"
              className="report-secondary-button"
              disabled={isSubmitting}
              onClick={() => void onRecompute()}
            >
              {isSubmitting ? (
                <LoaderCircle size={17} className="is-spinning" />
              ) : (
                <RefreshCw size={17} />
              )}{" "}
              {report.status === "VALIDATED"
                ? "Réouvrir et recalculer"
                : "Recalculer"}
            </button>
          )}
          {canValidate && report.status === "READY" && (
            <button
              type="button"
              className="report-primary-button"
              disabled={isSubmitting}
              onClick={() => setValidationOpen(true)}
            >
              <BadgeCheck size={17} /> Valider
            </button>
          )}
          {canArchive && report.status === "VALIDATED" && (
            <button
              type="button"
              className="report-secondary-button"
              disabled={isSubmitting}
              onClick={() => void onArchive()}
            >
              <Archive size={17} /> Archiver
            </button>
          )}
        </div>
        {(errorMessage || exportError) && (
          <div className="report-error report-screen-only">
            {errorMessage ?? exportError}
          </div>
        )}

        <div
          className={`report-access-banner report-screen-only ${
            isOwner ? "is-owner" : "is-readonly"
          }`}
        >
          {isOwner ? (
            <FilePenLine size={18} />
          ) : (
            <LockKeyhole size={18} />
          )}

          <div>
            <strong>
              {isOwner
                ? "Vous êtes le rédacteur de ce rapport"
                : canValidate
                  ? "Validation autorisée — contenu protégé"
                  : "Consultation du rapport — lecture seule"}
            </strong>

            <p>
              {isOwner
                ? report.status === "VALIDATED" || report.status === "ARCHIVED"
                  ? "Le rapport est figé après validation. Son contenu ne peut plus être modifié ni recalculé."
                  : "Vous seul pouvez compléter ou recalculer le contenu de ce rapport avant sa validation."
                : canValidate
                  ? "Vous pouvez examiner et valider le rapport, mais seul son rédacteur peut modifier ou recalculer son contenu."
                  : "Vous pouvez consulter et exporter ce document, sans pouvoir modifier le contenu rédigé par son auteur."}
            </p>
          </div>
        </div>

        <article className="report-printable-document">
          <section className="report-document-title">
            <div>
              <span className="report-document-kicker">
                RH · GOUVERNANCE · PERFORMANCE · DÉCISION
              </span>
              <h1>{report.title}</h1>
              <p>
                {reportTypeLabels[report.reportType]} · {scopeLabel(report)} ·
                Données arrêtées au {formatDate(report.calculationEndDate)}
              </p>
            </div>
            <div className="report-index-badge">
              {report.intelligence.performanceIndex}/100
            </div>
          </section>

          <div className="report-meta-grid">
            <article className="report-meta-card">
              <span>Référence</span>
              <strong>{report.reference}</strong>
            </article>
            <article className="report-meta-card">
              <span>Période</span>
              <strong>
                {formatDate(report.periodStartDate)} —{" "}
                {formatDate(report.periodEndDate)}
              </strong>
            </article>
            <article className="report-meta-card">
              <span>Statut</span>
              <strong>{statusLabels[report.status]}</strong>
            </article>
            <article className="report-meta-card">
              <span>Préparé par</span>
              <strong>{report.preparedByName}</strong>
            </article>
          </div>

          {(report.editorial.introduction ||
            report.editorial.highlights ||
            report.editorial.difficulties ||
            report.editorial.actionsTaken ||
            report.editorial.outlook ||
            report.editorial.confidentialNote) && (
            <section className="report-section report-editorial-section">
              <h2 className="report-section-title">
                Contribution du rédacteur
              </h2>

              <div className="report-editorial-stack">
                {report.editorial.introduction && (
                  <article className="report-editorial-block">
                    <h4>Introduction </h4>
                    <p>{report.editorial.introduction}</p>
                  </article>
                )}

                {report.editorial.highlights && (
                  <article className="report-editorial-block">
                    <h4>Faits marquants et réalisations</h4>
                    <p>{report.editorial.highlights}</p>
                  </article>
                )}

                {report.editorial.difficulties && (
                  <article className="report-editorial-block">
                    <h4>Difficultés et contraintes</h4>
                    <p>{report.editorial.difficulties}</p>
                  </article>
                )}

                {report.editorial.actionsTaken && (
                  <article className="report-editorial-block">
                    <h4>Mesures prises</h4>
                    <p>{report.editorial.actionsTaken}</p>
                  </article>
                )}

                {report.editorial.outlook && (
                  <article className="report-editorial-block">
                    <h4>Perspectives de la période suivante</h4>
                    <p>{report.editorial.outlook}</p>
                  </article>
                )}

                {report.editorial.confidentialNote && (
                  <article className="report-editorial-block is-confidential">
                    <h4>Note confidentielle interne</h4>
                    <p>{report.editorial.confidentialNote}</p>
                  </article>
                )}
              </div>
            </section>
          )}

          <section className="report-section">
            <h2 className="report-section-title">Synthèse exécutive</h2>
            <div className="report-executive-summary">
              {report.intelligence.executiveSummary}
            </div>
          </section>

          <div className="report-kpi-grid">
            <article className="report-kpi-card">
              <span>Indice global</span>
              <strong>{report.intelligence.performanceIndex}/100</strong>
            </article>
            <article className="report-kpi-card">
              <span>Exécution</span>
              <strong>{report.intelligence.executionIndex}/100</strong>
            </article>
            <article className="report-kpi-card">
              <span>Assiduité</span>
              <strong>{report.intelligence.attendanceIndex}/100</strong>
            </article>
            <article className="report-kpi-card">
              <span>Feuilles de route</span>
              <strong>{report.intelligence.roadmapIndex}/100</strong>
            </article>
            <article className="report-kpi-card">
              <span>Évaluations</span>
              <strong>{report.intelligence.evaluationIndex}/100</strong>
            </article>
            <article className="report-kpi-card">
              <span>Qualité données</span>
              <strong>{report.intelligence.dataQualityIndex}/100</strong>
            </article>
          </div>

          {report.snapshot.comparison && (
            <section className="report-section report-avoid-break">
              <h2 className="report-section-title">
                Évolution par rapport au rapport précédent
              </h2>
              <p className="report-comparison-reference">
                Référence de comparaison :{" "}
                <strong>{report.snapshot.comparison.previousReference}</strong>{" "}
                ·{" "}
                {formatDate(report.snapshot.comparison.previousPeriodStartDate)}{" "}
                — {formatDate(report.snapshot.comparison.previousPeriodEndDate)}
              </p>
              <div className="report-comparison-grid">
                <article>
                  <span>Indice global</span>
                  <strong
                    className={deltaClass(
                      report.snapshot.comparison.performanceIndexDelta
                    )}
                  >
                    {formatDelta(
                      report.snapshot.comparison.performanceIndexDelta
                    )}
                  </strong>
                </article>
                <article>
                  <span>Clôture des tâches</span>
                  <strong
                    className={deltaClass(
                      report.snapshot.comparison.taskCompletionRateDelta
                    )}
                  >
                    {formatDelta(
                      report.snapshot.comparison.taskCompletionRateDelta
                    )}
                  </strong>
                </article>
                <article>
                  <span>Présence</span>
                  <strong
                    className={deltaClass(
                      report.snapshot.comparison.attendancePresenceRateDelta
                    )}
                  >
                    {formatDelta(
                      report.snapshot.comparison.attendancePresenceRateDelta
                    )}
                  </strong>
                </article>
                <article>
                  <span>Couverture pointage</span>
                  <strong
                    className={deltaClass(
                      report.snapshot.comparison.attendanceCoverageRateDelta
                    )}
                  >
                    {formatDelta(
                      report.snapshot.comparison.attendanceCoverageRateDelta
                    )}
                  </strong>
                </article>
                <article>
                  <span>Feuille de route</span>
                  <strong
                    className={deltaClass(
                      report.snapshot.comparison.roadmapProgressDelta
                    )}
                  >
                    {formatDelta(
                      report.snapshot.comparison.roadmapProgressDelta
                    )}
                  </strong>
                </article>
                <article>
                  <span>Score évaluations</span>
                  <strong
                    className={deltaClass(
                      report.snapshot.comparison.evaluationScoreDelta
                    )}
                  >
                    {formatDelta(
                      report.snapshot.comparison.evaluationScoreDelta
                    )}
                  </strong>
                </article>
              </div>
            </section>
          )}

          {(report.snapshot.monthlyTrend ?? []).length > 0 && (
            <section className="report-section">
              <h2 className="report-section-title">
                Évolution mensuelle des indicateurs
              </h2>
              <div className="report-table-wrap">
                <table className="report-table report-trend-table">
                  <thead>
                    <tr>
                      <th>Période</th>
                      <th>Tâches créées</th>
                      <th>Tâches clôturées</th>
                      <th>Présence</th>
                      <th>Couverture</th>
                      <th>Congés approuvés</th>
                      <th>Retards</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.snapshot.monthlyTrend ?? []).map((item) => (
                      <tr key={item.periodKey}>
                        <td>{item.label}</td>
                        <td>{item.tasksCreated}</td>
                        <td>{item.tasksCompleted}</td>
                        <td>{item.attendancePresenceRate}%</td>
                        <td>{item.attendanceCoverageRate}%</td>
                        <td>{formatNumber(item.approvedLeaveDays)} j</td>
                        <td>{formatHours(item.lateMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="report-section report-avoid-break">
            <h2 className="report-section-title">Lecture décisionnelle</h2>
            <div className="report-module-grid">
              <article className="report-module-card">
                <span>Gouvernance</span>
                <strong>
                  {governanceLabels[report.intelligence.governanceLevel]}
                </strong>
                <small>Niveau de maîtrise du périmètre</small>
              </article>
              <article className="report-module-card">
                <span>Risque</span>
                <strong>{riskLabels[report.intelligence.riskLevel]}</strong>
                <small>Risque consolidé</small>
              </article>
              <article className="report-module-card">
                <span>Fiabilité</span>
                <strong>
                  {confidenceLabels[report.intelligence.dataConfidence]}
                </strong>
                <small>Confiance des données</small>
              </article>
              <article className="report-module-card">
                <span>Validation</span>
                <strong>{report.validatedByName ?? "En attente"}</strong>
                <small>
                  {report.validatedAt
                    ? formatDate(report.validatedAt)
                    : "Document non validé"}
                </small>
              </article>
            </div>
          </section>

          <section className="report-section">
            <h2 className="report-section-title">
              Note prête pour la Direction générale
            </h2>
            <div className="report-director-note">
              {report.intelligence.directorGeneralNote}
            </div>
          </section>


          <section className="report-section">
            <h2 className="report-section-title">
              1. Effectifs, organisation et conformité documentaire
            </h2>
            <div className="report-module-grid">
              <article className="report-module-card">
                <span>Agents actifs</span>
                <strong>
                  {w.agentsActive}/{w.agentsTotal}
                </strong>
                <small>
                  {w.newHires} arrivée(s) · {w.departures} départ(s)
                </small>
              </article>
              <article className="report-module-card">
                <span>Contrats</span>
                <strong>{w.permanentContracts} permanents</strong>
                <small>
                  {w.fixedTermContracts} durée déterminée · {w.otherContracts}{" "}
                  autres
                </small>
              </article>
              <article className="report-module-card">
                <span>Comptes</span>
                <strong>
                  {w.usersActive}/{w.usersTotal} actifs
                </strong>
                <small>{w.verifiedUsers} adresse(s) vérifiée(s)</small>
              </article>
              <article className="report-module-card">
                <span>Documents RH</span>
                <strong>{w.documentsActive} actifs</strong>
                <small>
                  {w.documentsExpired} expiré(s) · {w.documentsExpiringSoon} à
                  renouveler
                </small>
              </article>
            </div>
          </section>

          <section className="report-section">
            <h2 className="report-section-title">
              2. Tâches et exécution opérationnelle
            </h2>
            <div className="report-module-grid">
              <article className="report-module-card">
                <span>Tâches suivies</span>
                <strong>{t.total}</strong>
                <small>
                  {t.inProgress} en cours · {t.todo} à démarrer
                </small>
              </article>
              <article className="report-module-card">
                <span>Terminées</span>
                <strong>{t.completed}</strong>
                <small>Taux de clôture {t.completionRate} %</small>
              </article>
              <article className="report-module-card">
                <span>Retards / blocages</span>
                <strong>
                  {t.overdue} / {t.blocked}
                </strong>
                <small>À qualifier et arbitrer</small>
              </article>
              <article className="report-module-card">
                <span>Progression moyenne</span>
                <strong>{t.averageProgress} %</strong>
                <small>
                  {t.criticalPriority} critique(s) · {t.highPriority} haute(s)
                </small>
              </article>
            </div>
          </section>

          <section className="report-section">
            <h2 className="report-section-title">
              3. Pointage, présence et charge de travail
            </h2>
            <div className="report-module-grid">
              <article className="report-module-card">
                <span>Couverture pointage</span>
                <strong>{a.coverageRate} %</strong>
                <small>
                  {formatNumber(a.unrecordedDays)} journée(s)-agent non
                  tracée(s)
                </small>
              </article>
              <article className="report-module-card">
                <span>Taux de présence</span>
                <strong>{a.presenceRate} %</strong>
                <small>
                  {a.presentDays} présent(s) · {a.absentDays} absence(s)
                </small>
              </article>
              <article className="report-module-card">
                <span>Ponctualité</span>
                <strong>{a.punctualityRate} %</strong>
                <small>
                  {a.lateDays} retard(s) · {formatHours(a.lateMinutes)}
                </small>
              </article>
              <article className="report-module-card">
                <span>Charge enregistrée</span>
                <strong>{formatHours(a.overtimeMinutes)}</strong>
                <small>
                  Heures supplémentaires : signal, pas bonus automatique
                </small>
              </article>
            </div>
          </section>

          <section className="report-section">
            <h2 className="report-section-title">
              4. Congés et absences autorisées
            </h2>
            <div className="report-module-grid">
              <article className="report-module-card">
                <span>Demandes</span>
                <strong>{l.requestsTotal}</strong>
                <small>
                  {formatNumber(l.requestedDays)} jour(s) demandé(s)
                </small>
              </article>
              <article className="report-module-card">
                <span>Approuvés</span>
                <strong>{l.approvedRequests}</strong>
                <small>
                  {formatNumber(l.approvedDays)} jour(s) neutralisé(s)
                </small>
              </article>
              <article className="report-module-card">
                <span>En validation</span>
                <strong>
                  {l.submittedRequests + l.managerApprovedRequests}
                </strong>
                <small>{formatNumber(l.pendingDays)} jour(s)</small>
              </article>
              <article className="report-module-card">
                <span>Taux d’approbation</span>
                <strong>{l.approvalRate} %</strong>
                <small>
                  {l.rejectedRequests} refus · {l.cancelledRequests}{" "}
                  annulation(s)
                </small>
              </article>
            </div>
            {l.byType.length > 0 && (
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Type de congé</th>
                      <th>Demandes</th>
                      <th>Jours demandés</th>
                      <th>Approuvées</th>
                      <th>Jours approuvés</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.byType.map((item) => (
                      <tr key={item.leaveType}>
                        <td>
                          {leaveTypeLabels[item.leaveType] ?? item.leaveType}
                        </td>
                        <td>{item.requests}</td>
                        <td>{formatNumber(item.requestedDays)}</td>
                        <td>{item.approvedRequests}</td>
                        <td>{formatNumber(item.approvedDays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="report-section">
            <h2 className="report-section-title">
              5. Feuilles de route et objectifs annuels
            </h2>
            <div className="report-module-grid">
              <article className="report-module-card">
                <span>Feuilles suivies</span>
                <strong>{r.total}</strong>
                <small>
                  {r.approved} approuvée(s) · {r.closed} clôturée(s)
                </small>
              </article>
              <article className="report-module-card">
                <span>Progression moyenne</span>
                <strong>{r.averageProgress} %</strong>
                <small>État actuel figé lors de la génération</small>
              </article>
              <article className="report-module-card">
                <span>Éléments réalisés</span>
                <strong>
                  {r.completedItemCount}/{r.itemCount}
                </strong>
                <small>Taux {r.completionRate} %</small>
              </article>
              <article className="report-module-card">
                <span>Reste à réaliser</span>
                <strong>{r.remainingItemCount}</strong>
                <small>{r.returned} feuille(s) retournée(s)</small>
              </article>
            </div>
          </section>

          <section className="report-section">
            <h2 className="report-section-title">
              6. Évaluations et décisions RH
            </h2>
            <div className="report-module-grid">
              <article className="report-module-card">
                <span>Évaluations</span>
                <strong>{e.total}</strong>
                <small>{e.hrValidated} validée(s) RH</small>
              </article>
              <article className="report-module-card">
                <span>Score moyen</span>
                <strong>{formatNumber(e.averageScore)}/100</strong>
                <small>
                  {e.excellent + e.veryGood} niveau(x) excellent ou très bon
                </small>
              </article>
              <article className="report-module-card">
                <span>Risques</span>
                <strong>{e.highRisk + e.criticalRisk}</strong>
                <small>{e.criticalRisk} critique(s)</small>
              </article>
              <article className="report-module-card">
                <span>Décisions</span>
                <strong>{e.promotionRecommended} promotion(s)</strong>
                <small>
                  {e.trainingPlans} formation(s) · {e.improvementPlans}{" "}
                  amélioration(s)
                </small>
              </article>
            </div>
          </section>

          {(report.snapshot.unitBreakdown ?? []).length > 0 && (
            <section className="report-section report-break-before">
              <h2 className="report-section-title">
                7. Analyse comparative par unité
              </h2>
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Unité</th>
                      <th>Agents</th>
                      <th>Tâches</th>
                      <th>Clôture</th>
                      <th>Retards</th>
                      <th>Présence</th>
                      <th>Couverture</th>
                      <th>Congés</th>
                      <th>Roadmap</th>
                      <th>Évaluation</th>
                      <th>Alertes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.snapshot.unitBreakdown ?? []).map((item) => (
                      <tr key={item.unitId}>
                        <td>{item.unitName}</td>
                        <td>{item.agentsActive}</td>
                        <td>
                          {item.tasksCompleted}/{item.tasksTotal}
                        </td>
                        <td>{item.taskCompletionRate}%</td>
                        <td>{item.tasksOverdue}</td>
                        <td>{item.attendancePresenceRate}%</td>
                        <td>{item.attendanceCoverageRate}%</td>
                        <td>{formatNumber(item.approvedLeaveDays)} j</td>
                        <td>{item.roadmapAverageProgress}%</td>
                        <td>{formatNumber(item.evaluationAverageScore)}/100</td>
                        <td>{item.alertsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="report-section">
            <h2 className="report-section-title">
              8. Acquis, alertes et plan d’action
            </h2>
            <div className="report-analysis-grid">
              <article className="report-analysis-card">
                <strong>Acquis de la période</strong>
                <ul className="report-list">
                  {report.intelligence.keyAchievements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="report-analysis-card">
                <strong>Points de vigilance</strong>
                <ul className="report-list">
                  {report.intelligence.alerts.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="report-analysis-card">
                <strong>Recommandations</strong>
                <ul className="report-list">
                  {report.intelligence.recommendations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="report-analysis-card">
                <strong>Priorités prochaine période</strong>
                <ul className="report-list">
                  {report.intelligence.nextPeriodPriorities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </div>
          </section>

          <section className="report-section report-avoid-break">
            <h2 className="report-section-title">
              <ShieldCheck size={15} /> Décisions attendues de la Direction
            </h2>
            <ol className="report-list">
              {report.intelligence.decisionsRequired.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            {report.validationComment && (
              <p>
                <strong>Observation de validation :</strong>{" "}
                {report.validationComment}
              </p>
            )}
          </section>

          {(report.snapshot.warnings ?? []).length > 0 && (
            <section className="report-section">
              <h2 className="report-section-title">Réserves méthodologiques</h2>
              <div className="report-warning-box">
                <ul className="report-list">
                  {(report.snapshot.warnings ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          <section className="report-section">
            <h2 className="report-section-title">Sources consolidées</h2>
            <ul className="report-source-list">
              {(report.snapshot.sources ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <div className="report-signatures" aria-label="Visa et signatures">
            <div className="report-signature">
              <strong>Rédacteur / Responsable du rapport</strong>
              <span>Nom, fonction, date et signature</span>
            </div>
            <div className="report-signature">
              <strong>Responsable RH / Direction</strong>
              <span>Visa, observations et signature</span>
            </div>
            <div className="report-signature">
              <strong>Direction générale</strong>
              <span>Décision, date, cachet et signature</span>
            </div>
          </div>

          
        </article>

        {validationOpen && (
          <div className="report-validation-layer report-screen-only">
            <button
              type="button"
              className="report-validation-backdrop"
              aria-label="Fermer"
              onClick={() => setValidationOpen(false)}
            />
            <section
              className="report-validation-modal"
              role="dialog"
              aria-modal="true"
            >
              <header>
                <div>
                  <p>VALIDATION </p>
                  <h3>Valider le rapport {report.reference}</h3>
                </div>
                <button
                  type="button"
                  className="report-icon-button"
                  onClick={() => setValidationOpen(false)}
                >
                  <X size={18} />
                </button>
              </header>
              <p>
                La validation fige le document pour diffusion. Toute
                modification ultérieure exigera une réouverture et un nouveau
                calcul.
              </p>
              <label className="report-field">
                <span>Observation de validation — facultative</span>
                <textarea
                  rows={5}
                  value={validationComment}
                  onChange={(event) => setValidationComment(event.target.value)}
                  placeholder="Décision, réserves, instructions ou échéances arrêtées..."
                />
              </label>
              <footer>
                <button
                  type="button"
                  className="report-cancel-button"
                  onClick={() => setValidationOpen(false)}
                  disabled={isSubmitting}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="report-primary-button"
                  disabled={isSubmitting}
                  onClick={async () => {
                    await onValidate(validationComment.trim() || undefined);
                    setValidationOpen(false);
                  }}
                >
                  {isSubmitting ? (
                    <LoaderCircle size={17} className="is-spinning" />
                  ) : (
                    <BadgeCheck size={17} />
                  )}{" "}
                  Confirmer la validation
                </button>
              </footer>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
