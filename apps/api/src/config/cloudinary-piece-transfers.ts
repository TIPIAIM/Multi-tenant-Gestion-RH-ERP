import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";
import type {
  ReadableStream as NodeWebReadableStream,
} from "node:stream/web";
import { v2 as cloudinary } from "cloudinary";
import { AppError } from "../core/errors/app-error.js";
import { getCloudinaryConfig } from "./env.js";
import {
  destroyPrivateDocument,
} from "./cloudinary.js";

/**
 * IMPORTANT
 * ---------
 * Ce fichier est volontairement séparé de `cloudinary.ts`.
 *
 * Le fichier `cloudinary.ts` existant est déjà utilisé par les autres modules
 * FADES-RH et ne doit pas être remplacé/modifié pour intégrer le module
 * Communications.
 */

let isCommunicationCloudinaryConfigured =
  false;

function configureCommunicationCloudinary():
  void {
  if (
    isCommunicationCloudinaryConfigured
  ) {
    return;
  }

  try {
    const config =
      getCloudinaryConfig();

    cloudinary.config({
      cloud_name:
        config.cloudName,
      api_key:
        config.apiKey,
      api_secret:
        config.apiSecret,
      secure: true,
    });

    isCommunicationCloudinaryConfigured =
      true;
  } catch {
    throw new AppError(
      "Le stockage sécurisé des communications n’est pas encore configuré.",
      503,
      "CLOUDINARY_NOT_CONFIGURED",
    );
  }
}

function sanitizeCommunicationFileName(
  fileName: string,
): string {
  const extension =
    extname(
      fileName,
    ).toLowerCase();

  const baseName =
    basename(
      fileName,
      extension,
    )
      .normalize(
        "NFD",
      )
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        "-",
      )
      .replace(
        /-+/g,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      )
      .slice(
        0,
        60,
      );

  return `${baseName || "document"}${extension}`;
}

function getCommunicationRawFormat(
  originalFileName:
    string,
): string {
  const format =
    extname(
      originalFileName,
    )
      .replace(
        ".",
        "",
      )
      .toLowerCase();

  if (!format) {
    throw new AppError(
      "Le format du document est introuvable.",
      500,
      "DOCUMENT_FORMAT_MISSING",
    );
  }

  return format;
}

type UploadedCommunicationDocument = {
  publicId: string;
  bytes: number;
};

type CommunicationDocumentStream = {
  stream: Readable;
  contentLength?: number;
};

async function uploadPrivateCommunicationRawDocument(
  input: {
    publicId: string;
    originalFileName: string;
    fileBuffer: Buffer;
  },
): Promise<UploadedCommunicationDocument> {
  configureCommunicationCloudinary();

  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const uploadStream =
        cloudinary.uploader.upload_stream(
          {
            resource_type:
              "raw",

            type:
              "private",

            public_id:
              input.publicId,

            overwrite:
              false,

            invalidate:
              true,

            filename_override:
              input.originalFileName,
          },
          (
            error,
            result,
          ) => {
            if (
              error ||
              !result
            ) {
              reject(
                error ??
                  new Error(
                    "Le stockage sécurisé n'a pas retourné de résultat.",
                  ),
              );

              return;
            }

            resolve({
              publicId:
                result.public_id,

              bytes:
                result.bytes ??
                input
                  .fileBuffer
                  .length,
            });
          },
        );

      Readable.from([
        input.fileBuffer,
      ]).pipe(
        uploadStream,
      );
    },
  );
}

export async function uploadPrivatePieceTransferDocument(
  input: {
    tenantSlug: string;
    senderUserId: string;
    originalFileName: string;
    fileBuffer: Buffer;
  },
): Promise<UploadedCommunicationDocument> {
  const publicId = [
    "fades-rh",
    input.tenantSlug,
    "piece-transfers",
    input.senderUserId,
    `${randomUUID()}-${sanitizeCommunicationFileName(input.originalFileName)}`,
  ].join("/");

  return uploadPrivateCommunicationRawDocument({
    publicId,
    originalFileName:
      input.originalFileName,
    fileBuffer:
      input.fileBuffer,
  });
}

export async function uploadPrivatePieceTransferMessageDocument(
  input: {
    tenantSlug: string;
    transferId: string;
    senderUserId: string;
    originalFileName: string;
    fileBuffer: Buffer;
  },
): Promise<UploadedCommunicationDocument> {
  const publicId = [
    "fades-rh",
    input.tenantSlug,
    "piece-transfers",
    input.transferId,
    "messages",
    input.senderUserId,
    `${randomUUID()}-${sanitizeCommunicationFileName(input.originalFileName)}`,
  ].join("/");

  return uploadPrivateCommunicationRawDocument({
    publicId,
    originalFileName:
      input.originalFileName,
    fileBuffer:
      input.fileBuffer,
  });
}

function createPrivateCommunicationSourceUrl(
  publicId: string,
  originalFileName:
    string,
): string {
  configureCommunicationCloudinary();

  return cloudinary.utils.private_download_url(
    publicId,
    getCommunicationRawFormat(
      originalFileName,
    ),
    {
      resource_type:
        "raw",

      type:
        "private",

      attachment:
        false,

      expires_at:
        Math.floor(
          Date.now() /
            1000,
        ) +
        75,
    },
  );
}

export async function openPrivateCommunicationDocumentStream(
  input: {
    publicId: string;
    originalFileName: string;
  },
): Promise<CommunicationDocumentStream> {
  const sourceUrl =
    createPrivateCommunicationSourceUrl(
      input.publicId,
      input.originalFileName,
    );

  try {
    const upstreamResponse =
      await fetch(
        sourceUrl,
        {
          redirect:
            "follow",

          signal:
            AbortSignal.timeout(
              30_000,
            ),
        },
      );

    if (
      !upstreamResponse.ok ||
      !upstreamResponse.body
    ) {
      throw new AppError(
        "Le fichier sécurisé est temporairement indisponible.",
        502,
        "DOCUMENT_STORAGE_UNAVAILABLE",
      );
    }

    const contentLength =
      Number(
        upstreamResponse.headers.get(
          "content-length",
        ) ??
          "",
      );

    return {
      stream:
        Readable.fromWeb(
          upstreamResponse.body as unknown as NodeWebReadableStream,
        ),

      contentLength:
        Number.isFinite(
          contentLength,
        )
          ? contentLength
          : undefined,
    };
  } catch (
    error
  ) {
    if (
      error instanceof
      AppError
    ) {
      throw error;
    }

    throw new AppError(
      "Impossible de récupérer le document sécurisé.",
      502,
      "DOCUMENT_STORAGE_UNAVAILABLE",
    );
  }
}

/**
 * Délègue la suppression au helper déjà présent dans votre cloudinary.ts.
 * Aucune modification du fichier historique n'est nécessaire.
 */
export async function destroyPrivateCommunicationDocument(
  publicId: string,
): Promise<void> {
  await destroyPrivateDocument(
    publicId,
  );
}
