import { AppError } from "../../core/errors/app-error.js";
import { PieceTransferModel } from "./piece-transfer.model.js";

const OPTIONAL_FILE_INDEX = "storagePublicId_optional_unique";
let indexPreparation: Promise<void> | undefined;

/** Repair only the historical optional-file index, preserving file uniqueness. */
export async function ensureOptionalPieceTransferFileIndex(): Promise<void> {
  if (!indexPreparation) {
    indexPreparation = prepareIndex().catch((error: unknown) => {
      indexPreparation = undefined; // Allow a retry after an operator fixes permissions.
      console.error("[piece-transfers] Optional-file index preparation failed", error);
      throw new AppError(
        "La création est temporairement indisponible. Réessayez ou contactez l’administrateur.",
        503,
        "PIECE_TRANSFER_INDEX_NOT_READY",
      );
    });
  }
  await indexPreparation;
}

async function prepareIndex(): Promise<void> {
  const collection = PieceTransferModel.collection;
  const indexes = await collection.listIndexes().toArray().catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 26) {
      return [];
    }
    throw error;
  });

  const storageIndexes = indexes.filter((index) =>
    index.key && Object.keys(index.key).length === 1 && index.key.storagePublicId === 1,
  );
  const healthy = storageIndexes.find((index) =>
    index.name === OPTIONAL_FILE_INDEX && index.unique &&
    index.partialFilterExpression?.storagePublicId?.$type === "string",
  );
  const legacy = storageIndexes.filter((index) =>
    index.unique && !index.partialFilterExpression,
  );

  if (storageIndexes.some((index) =>
    !index.unique || (index.partialFilterExpression && index !== healthy),
  )) {
    throw new Error("Unexpected storagePublicId index definition; manual inspection required.");
  }

  if (!healthy) {
    // Build first; if creation fails, the historical unique constraint stays in place.
    // Index only actual string identifiers; optional missing/null values are ignored.
    await collection.createIndex(
      { storagePublicId: 1 },
      { name: OPTIONAL_FILE_INDEX, unique: true,
        partialFilterExpression: { storagePublicId: { $type: "string" } } },
    );
  }

  for (const index of legacy) {
    if (!index.name) throw new Error("Historical index name is missing.");
    await collection.dropIndex(index.name).catch((error: unknown) => {
      // Another API instance may already have removed exactly this legacy index.
      if (typeof error === "object" && error !== null && "code" in error && error.code === 27) return;
      throw error;
    });
  }
}
