import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { getCloudinaryConfig } from "../../config/env.js";
import { AppError } from "../../core/errors/app-error.js";
import type { PayrollRecord } from "./payroll.model.js";
import type {
  BrandingSettings,
  InstitutionSettings,
} from "../settings/settings.types.js";

export type PayslipSettings = {
  institution: InstitutionSettings;
  branding: BrandingSettings;
  documents: { confidentialLabel: string; footerText: string };
};
export const payslipFilename = (
  row: Pick<PayrollRecord, "period" | "matricule">,
) =>
  `bulletin-${row.period}-${row.matricule.replace(/[^a-z0-9_-]/gi, "-").slice(0, 60)}.pdf`;

/** Only the configured Cloudinary image host is fetched, without redirects. */
export async function loadPayslipLogo(
  settings: PayslipSettings,
): Promise<Buffer | undefined> {
  const value = settings.branding.printLogoUrl || settings.branding.logoUrl;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const { cloudName } = getCloudinaryConfig();
    if (
      url.protocol !== "https:" ||
      url.hostname !== "res.cloudinary.com" ||
      url.port ||
      url.username ||
      url.password ||
      !url.pathname.startsWith(`/${cloudName}/image/upload/`)
    ) {
      throw new Error("Logo non géré");
    }
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get("content-length") || 0) > 2_000_000
    )
      throw new Error("Logo indisponible");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 2_000_000) {
        await response.body.cancel().catch(() => undefined);
        throw new Error("Logo trop volumineux");
      }
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const png = buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    if (!png && !jpeg) throw new Error("Format non imprimable");
    return buffer;
  } catch {
    throw new AppError(
      "Le logo imprimable est indisponible. Téléversez un logo dans Configuration, puis publiez les modifications.",
      503,
      "PAYROLL_LOGO_UNAVAILABLE",
    );
  }
}

/** Lean MongoDB reads can expose a BSON Binary instead of a Node Buffer. */
export function payslipMarkBytes(value: unknown): Buffer | undefined {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (
    value &&
    typeof value === "object" &&
    "buffer" in value &&
    value.buffer instanceof Uint8Array
  ) {
    const end =
      "position" in value && typeof value.position === "number"
        ? value.position
        : value.buffer.byteLength;
    return Buffer.from(value.buffer.subarray(0, end));
  }
  return undefined;
}

/** Measured single-page A4 layout shared by downloads and communication attachments. */
export function renderPayslipPdf(
  row: PayrollRecord,
  id: string,
  settings: PayslipSettings,
  logo?: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      bufferPages: true,
      info: {
        Title: `Bulletin de paie ${row.period}`,
        Author: settings.institution.legalName,
        Subject: `Bulletin individuel - ${row.matricule}`,
      },
    });
    doc.registerFont(
      "Body",
      fileURLToPath(
        new URL("../../../assets/fonts/DejaVuSans.ttf", import.meta.url),
      ),
    );
    doc.registerFont(
      "Bold",
      fileURLToPath(
        new URL("../../../assets/fonts/DejaVuSans-Bold.ttf", import.meta.url),
      ),
    );
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      const company = settings.institution,
        left = 40,
        width = doc.page.width - 80;
      const ink = "#153244",
        muted = "#526675",
        line = "#DCE4E9",
        soft = "#F3F6F8";
      const accent = /^#[\da-f]{6}$/i.test(settings.branding.primaryColor)
        ? settings.branding.primaryColor
        : "#046242";
      const companyName =
        company.legalName || company.shortName || "Organisation";
      const month = new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${row.period}-01T00:00:00Z`));
      const date = (value: Date | string) =>
        new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC" }).format(
          new Date(value),
        );
      const money = (n: number) =>
        new Intl.NumberFormat("fr-FR", {
          minimumFractionDigits: row.minorUnitDigits,
          maximumFractionDigits: row.minorUnitDigits,
        })
          .format(n / 10 ** row.minorUnitDigits)
          .replace(/[\u202f\u00a0]/g, " ") + ` ${row.currency}`;
      const state = {
        DRAFT: "BROUILLON",
        APPROVED: "VALIDÉ",
        PAID: "PAYÉ",
        CANCELLED: "ANNULÉ",
      }[row.status];
      const compact = (value?: string | null) =>
        value?.replace(/\s+/g, " ").trim() || "";
      // One continuous paragraph, across the whole printable width. No contact columns.
      const footerCopy = [
        companyName,
        [company.address, company.city, company.country]
          .filter(Boolean)
          .join(", "),
        company.phone ? `Tél. : ${company.phone}` : "",
        company.email ? `Courriel : ${company.email}` : "",
        company.website || "",
        company.registrationNumber
          ? `Immatriculation : ${company.registrationNumber}`
          : "",
        settings.documents.footerText,
        settings.documents.confidentialLabel ||
          "Document personnel et confidentiel.",
      ]
        .map(compact)
        .filter(Boolean)
        .join(" · ");
      const stamp = payslipMarkBytes(row.stampImage),
        signature = payslipMarkBytes(row.signatureImage);
      const eligible = ["APPROVED", "PAID"].includes(row.status);
      const showStamp = Boolean(eligible && row.includeStamp),
        showSignature = Boolean(eligible && row.includeSignature);
      if (
        (showStamp && !stamp?.length) ||
        (showSignature && !signature?.length)
      )
        throw new AppError(
          "Le visuel enregistré sur ce bulletin est indisponible. Faites vérifier le bulletin par les RH.",
          409,
          "PAYROLL_MARK_UNAVAILABLE",
        );
      const overflow = () =>
        new AppError(
          "Le contenu dépasse une page A4 à une taille lisible. Raccourcissez les observations ou les règles détaillées avant de télécharger ou partager le bulletin. Aucun texte n’a été supprimé.",
          409,
          "PAYROLL_SINGLE_PAGE_OVERFLOW",
        );
      const measure = (
        value: string,
        w: number,
        size: number,
        bold = false,
        gap = 1.4,
      ) => {
        if (!value) return 0;
        doc.font(bold ? "Bold" : "Body").fontSize(size);
        return doc.heightOfString(value, { width: w, lineGap: gap });
      };
      // Preflight before painting: reduce spacing first, then body size, without truncation.
      const layout = (body: number, spacing: number, draw: boolean) => {
        type Align = "left" | "right" | "justify";
        const text = (
          value: string,
          x: number,
          y: number,
          w: number,
          size = body,
          bold = false,
          color = ink,
          align: Align = "left",
        ) => {
          const h = measure(value, w, size, bold);
          if (draw && value)
            doc
              .font(bold ? "Bold" : "Body")
              .fontSize(size)
              .fillColor(color)
              .text(value, x, y, {
                width: w,
                height: h + 1,
                lineGap: 1.4,
                align,
              });
          return y + h;
        };
        const rule = (y: number, color = line, weight = 0.6) => {
          if (draw)
            doc
              .strokeColor(color)
              .lineWidth(weight)
              .moveTo(left, y)
              .lineTo(left + width, y)
              .stroke();
        };
        const rect = (
          x: number,
          y: number,
          w: number,
          h: number,
          color: string,
        ) => {
          if (draw) doc.rect(x, y, w, h).fill(color);
        };
        const footerSize = 7.2,
          footerHeight = measure(footerCopy, width, footerSize);
        const footerTop = doc.page.height - 43 - footerHeight - 12;
        const marksTop = footerTop - 139;
        const contentBottom =
          showStamp || showSignature ? marksTop - 12 : footerTop - 18;
        if (contentBottom < 350) return false;
        rect(left, 27, 36, 3, accent);
        text(
          "RESSOURCES HUMAINES",
          left + width - 140,
          28,
          140,
          6.2,
          true,
          muted,
          "right",
        );
        const companyX = logo ? left + 75 : left;
        if (draw && logo)
          doc.image(logo, left, 43, { fit: [59, 43], valign: "center" });
        const headEnd = text(
          companyName,
          companyX,
          42,
          width - (companyX - left),
          12,
          true,
        );
        const locEnd = text(
          [company.city, company.country].filter(Boolean).join(" · "),
          companyX,
          headEnd + 4,
          width - (companyX - left),
          7.5,
          false,
          muted,
        );
        let y = Math.max(98, locEnd + 16);
        text("BULLETIN DE PAIE", left, y, width - 150, 18, true);
        text(
          "PÉRIODE DE PAIE",
          left + width - 145,
          y - 6,
          145,
          6.2,
          true,
          muted,
          "right",
        );
        text(month, left + width - 145, y + 7, 145, 10, true, ink, "right");
        text(state, left + width - 145, y + 25, 145, 6.8, true, muted, "right");
        rule(y + 44, accent, 1.2);
        y += 57;
        const identityWidth = width * 0.54,
          metaX = left + identityWidth + 16,
          metaWidth = width - identityWidth - 16;
        rect(left - 8, y - 5, 2, 42, accent);
        text("EMPLOYE", left, y, identityWidth, 6.7, true, muted);
        const nameEnd = text(
          row.agentName,
          left,
          y + 13,
          identityWidth,
          10,
          true,
        );
        const agentEnd = text(
          `Matricule : ${row.matricule}`,
          left,
          nameEnd + 4,
          identityWidth,
          7.7,
          false,
          muted,
        );
        text("RÉFÉRENCE DU BULLETIN", metaX, y, metaWidth, 6.7, true, muted);
        let metaEnd = text(id, metaX, y + 13, metaWidth, 7.1);
        metaEnd = text(
          `Révision ${row.revision} · ${row.currency}${row.approvedAt ? ` · Validé le ${date(row.approvedAt)}` : ""}`,
          metaX,
          metaEnd + 4,
          metaWidth,
          7.1,
          false,
          muted,
        );
        y = Math.max(agentEnd, metaEnd) + 13 * spacing;
        const labelW = width * 0.49,
          gainX = left + width * 0.52,
          gainW = width * 0.22,
          deductionX = left + width * 0.77,
          deductionW = width * 0.21;
        rect(left, y, width, 23, soft);
        text("e", left + 9, y + 6, labelW, 6.8, true, ink);
        text("GAINS", gainX, y + 6, gainW, 6.8, true, ink, "right");
        text(
          "RETENUES",
          deductionX,
          y + 6,
          deductionW,
          6.8,
          true,
          ink,
          "right",
        );
        y += 23;
        for (const [label, gain, deduction, bold] of [
          ["Salaire de base", money(row.base), "", false],
          ["Primes et indemnités", money(row.bonus), "", false],
          ["Rémunération brute", money(row.gross), "", true],
          [
            `Cotisations salariales (${row.employeeRate / 100} %)`,
            "",
            money(row.employeeContribution),
            false,
          ],
          [
            `Impôt configuré (${row.taxRate / 100} %)`,
            "",
            money(row.tax),
            false,
          ],
          ["Autres retenues", "", money(row.deductions), false],
          [
            "Total des retenues",
            "",
            money(row.employeeContribution + row.tax + row.deductions),
            true,
          ],
        ] as const) {
          const h = Math.max(
            21 * spacing,
            measure(label, labelW, body, bold) + 10 * spacing,
            measure(gain, gainW, body, bold) + 10 * spacing,
            measure(deduction, deductionW, body, bold) + 10 * spacing,
          );
          if (bold) rect(left, y, width, h, soft);
          text(label, left + 9, y + 5 * spacing, labelW, body, bold);
          text(gain, gainX, y + 5 * spacing, gainW, body, bold, ink, "right");
          text(
            deduction,
            deductionX,
            y + 5 * spacing,
            deductionW,
            body,
            bold,
            ink,
            "right",
          );
          y += h;
          rule(y);
        }
        y += 10 * spacing;
        if (draw) doc.roundedRect(left, y, width, 46, 5).fill(ink);
        text("NET À PAYER", left + 12, y + 17, 135, 8.5, true, "#FFFFFF");
        let netSize = 15;
        doc.font("Bold").fontSize(netSize);
        while (doc.widthOfString(money(row.net)) > width - 165 && netSize > 9)
          doc.fontSize(--netSize);
        text(
          money(row.net),
          left + 155,
          y + 10,
          width - 167,
          netSize,
          true,
          "#FFFFFF",
          "right",
        );
        y += 56;
        const employerY = y;
        const employerColumn = (width - 22) / 2;
        const leftCaptionEnd = text(
          `Cotisations patronales (${row.employerRate / 100} %)`,
          left,
          employerY,
          employerColumn,
          6.7,
          false,
          muted,
        );
        const rightCaptionEnd = text(
          "Coût total employeur",
          left + employerColumn + 22,
          employerY,
          employerColumn,
          6.7,
          false,
          muted,
        );
        const leftValueEnd = text(
          money(row.employerContribution),
          left,
          leftCaptionEnd + 4,
          employerColumn,
          8.4,
          true,
        );
        const rightValueEnd = text(
          money(row.employerCost),
          left + employerColumn + 22,
          rightCaptionEnd + 4,
          employerColumn,
          8.4,
          true,
        );
        y = Math.max(leftValueEnd, rightValueEnd) + 8 * spacing;
        rule(y);
        y += 3;
        y += 7 * spacing;
        for (const [label, value] of [
          ["RÈGLES APPLIQUÉES", row.rulesNote],
          ["OBSERVATIONS", row.note],
          [
            "PAIEMENT",
            row.paymentReference
              ? `${row.paymentReference}${row.paidAt ? ` · Payé le ${date(row.paidAt)}` : ""}`
              : "",
          ],
        ] as const) {
          if (!value?.trim()) continue;
          y = text(label, left, y, width, 6.6, true, muted) + 3 * spacing;
          y =
            text(value, left, y, width, body, false, ink, "justify") +
            7 * spacing;
        }
        if (y > contentBottom) return false;
        if (showStamp || showSignature) {
          text("Pour l’employeur", left, marksTop, width, 7, true, muted);
          let x = left;
          for (const [enabled, image, label] of [
            [showStamp, stamp, ""],
            [showSignature, signature, ""],//TU PEUX METTRE SIGNATURE DANS LE ""
          ] as const) {
            if (!enabled || !image) continue;
            if (draw)
              doc.image(image, x, marksTop + 15, {
                fit: [label === "" ? 165 : 185, 82],
                valign: "center",
              });
            text(label, x, marksTop + 110, 185, 7, false, muted);
            x += 205;
          }
        }
        rule(footerTop);
        // PDF justification fills complete lines; the last line stays naturally aligned left.
        text(
          footerCopy,
          left,
          footerTop + 10,
          width,
          footerSize,
          false,
          muted,
          "justify",
        );
        text(
          `${row.period} · ${row.matricule} · Page 1 / 1`,
          left,
          doc.page.height - 25,
          width,
          6.6,
          false,
          muted,
        );
        return true;
      };
      const profiles = [
        [8.3, 1],
        [8.1, 0.9],
        [7.8, 0.8],
        [7.5, 0.72],
      ] as const;
      const profile = profiles.find(([size, gap]) => layout(size, gap, false));
      if (!profile) throw overflow();
      // Reuse this tenant's printable logo, behind all content. Graphics state is
      // restored before painting the text, so only the watermark is translucent.
      if (logo) {
        const watermarkWidth = Math.min(300, width * 0.6);
        const watermarkHeight = 250;
        doc.save();
        doc.opacity(0.055);
        doc.image(
          logo,
          (doc.page.width - watermarkWidth) / 2,
          (doc.page.height - watermarkHeight) / 2,
          {
            fit: [watermarkWidth, watermarkHeight],
            align: "center",
            valign: "center",
          },
        );
        doc.restore();
      }

      if (
        !layout(profile[0], profile[1], true) ||
        doc.bufferedPageRange().count !== 1
      )
        throw overflow();
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
