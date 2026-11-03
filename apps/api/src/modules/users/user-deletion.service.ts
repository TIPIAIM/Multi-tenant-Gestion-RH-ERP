import type { Model } from "mongoose";
import type { User } from "./user.types.js";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import { AuthSessionModel } from "../auth/auth-session.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { UserModel } from "./user.model.js";
import { UserAdminActivityModel } from "./user-admin-activity.model.js";

/** Toutes les écritures sont validées ensemble ; aucun dossier RH n'est supprimé. */
export async function deleteManagedUserAccount(
  tenant: TenantDocument,
  actorId: string,
  id: string,
): Promise<{
  deletedUserId: string;
  revokedSessions: number;
  unlinkedAgents: number;
}> {
  if (actorId === id)
    throw new AppError(
      "Vous ne pouvez pas supprimer votre propre compte.",
      400,
      "SELF_DELETE_FORBIDDEN",
    );

  const users = UserModel as unknown as Model<User>;
  const session = await users.db.startSession();
  try {
    let result = { deletedUserId: id, revokedSessions: 0, unlinkedAgents: 0 };
    await session.withTransaction(async () => {
      const actor = await users
        .findOne({
          _id: actorId,
          tenantId: tenant._id,
          isActive: true,
        })
        .session(session)
        .lean()
        .exec();
      if (!actor || actor.role !== "TENANT_ADMIN") {
        throw new AppError(
          "Seul l’administrateur peut supprimer un utilisateur.",
          403,
          "USER_DELETE_FORBIDDEN",
        );
      }
      const target = await users
        .findOne({ _id: id, tenantId: tenant._id })
        .session(session)
        .lean()
        .exec();
      if (!target)
        throw new AppError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
      // Évite les suppressions concurrentes des administrateurs actifs.
      // La désactivation existante contrôle déjà le dernier administrateur actif.
      if (target.role === "TENANT_ADMIN" && target.isActive) {
        throw new AppError(
          "Désactivez cet administrateur avant de supprimer son compte.",
          409,
          "ACTIVE_ADMIN_DELETE_FORBIDDEN",
        );
      }
      const sessions = await AuthSessionModel.deleteMany(
        { tenantId: tenant._id, userId: target._id },
        { session },
      );
      const agents = await AgentModel.updateMany(
        { tenantId: tenant._id, userId: target._id },
        { $set: { userId: null } },
        { session },
      );
      await UserAdminActivityModel.create(
        [
          {
            tenantId: tenant._id,
            actorUserId: actor._id,
            actorName: actor.fullName,
            targetUserId: target._id,
            targetName: target.fullName,
            action: "USER_DELETED",
            message:
              "Compte utilisateur supprimé. Fiche RH et historiques conservés.",
            metadata: {
              revokedSessions: sessions.deletedCount,
              unlinkedAgents: agents.modifiedCount,
            },
          },
        ],
        { session },
      );
      const deleted = await users.deleteOne(
        { _id: target._id, tenantId: tenant._id },
        { session },
      );
      if (deleted.deletedCount !== 1)
        throw new AppError(
          "Le compte a changé. Actualisez la liste.",
          409,
          "USER_DELETE_CONFLICT",
        );
      result = {
        deletedUserId: id,
        revokedSessions: sessions.deletedCount,
        unlinkedAgents: agents.modifiedCount,
      };
    });
    return result;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === 20 || error.code === 263)
    ) {
      throw new AppError(
        "La suppression est indisponible sur cette installation. Contactez le responsable technique.",
        503,
        "USER_DELETE_TRANSACTIONS_REQUIRED",
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
