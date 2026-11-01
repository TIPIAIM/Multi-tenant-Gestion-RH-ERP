import { Router, type RequestHandler } from "express";
import { Types } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { resolveRoadmapActor } from "./roadmap.access.js";
import { RoadmapActivityModel, RoadmapModel } from "./roadmap.model.js";

export const roadmapNotificationRouter = Router();
const getPopups: RequestHandler = async (request, response, next) => {
  try {
    if (!request.tenant || !request.auth?.userId) {
      throw new AppError("Authentification requise.", 401, "AUTH_REQUIRED");
    }
    const tenantId = request.tenant._id;
    const actor = await resolveRoadmapActor(request.tenant, request.auth.userId);
    if (actor.role !== "TENANT_ADMIN" && actor.role !== "RH_MANAGER") {
      throw new AppError("Ces notifications sont réservées aux RH et à l’administrateur.", 403, "ROADMAP_NOTICE_FORBIDDEN");
    }
    const cursor = String(request.query.after ?? "000000000000000000000000");
    if (!/^[a-f\d]{24}$/i.test(cursor)) {
      throw new AppError("Curseur invalide.", 400, "ROADMAP_NOTICE_CURSOR_INVALID");
    }
    // Le journal métier constitue déjà une trace durable de chaque soumission.
    // Aucun changement de validation ni écriture de notification supplémentaire.
    const rows = await RoadmapActivityModel.find({
      tenantId, action: "ITEM_COMPLETED", _id: { $gt: new Types.ObjectId(cursor) },
    }).select("_id roadmapId actorName summary metadata createdAt")
      .sort({ _id: 1 }).limit(101).lean().exec();
    const page = rows.slice(0, 100);
    const roadmaps = page.length ? await RoadmapModel.find({
      tenantId, _id: { $in: page.map(row => row.roadmapId) },
    }).select("_id reference title").lean().exec() : [];
    const allowed = new Map(roadmaps.map(roadmap => [String(roadmap._id), roadmap]));
    const items = page.flatMap(row => {
      const roadmap = allowed.get(String(row.roadmapId));
      const itemId = String(row.metadata?.itemId ?? "");
      if (!roadmap || !/^[a-f\d]{24}$/i.test(itemId)) return [];
      return [{
        id: String(row._id), taskId: String(row.roadmapId), itemId,
        kind: "COMPLETED" as const,
        title: `${roadmap.reference} · Objectif réalisé`,
        message: `${row.actorName} — ${row.summary}`,
        createdAt: row.createdAt?.toISOString() ?? new Types.ObjectId(String(row._id)).getTimestamp().toISOString(),
      }];
    });
    response.json({ success: true, data: {
      items, cursor: page.length ? String(page[page.length - 1]!._id) : cursor,
      hasMore: rows.length > 100,
    } });
  } catch (error) { next(error); }
};
// Le routeur parent applique authentification, entreprise et activation du module.
roadmapNotificationRouter.get("/popups", getPopups);
