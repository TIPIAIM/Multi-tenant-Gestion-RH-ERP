import mongoose, { Schema, Types, type Model, type ClientSession } from "mongoose";
import { AppError } from "../../core/errors/app-error.js";
import { AgentModel } from "../agents/agent.model.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
import { getLeaveScopeFilter, type LeaveActor } from "./leave.access.js";
import type { LeaveRequestDocument } from "./leave.types.js";

type EventKind = "SUBMITTED" | "MANAGER_REVIEWED" | "RH_REVIEWED" | "FINAL_REVIEWED" | "CANCELLED";
interface LeavePopupEvent {
  tenantId: Types.ObjectId; requestId: Types.ObjectId; agentId: Types.ObjectId;
  directionId: Types.ObjectId; serviceId: Types.ObjectId | null; actorUserId: Types.ObjectId;
  kind: EventKind; title: string; message: string; createdAt: Date;
}
const schema = new Schema<LeavePopupEvent>({
  tenantId: {type:Schema.Types.ObjectId, required:true}, requestId:{type:Schema.Types.ObjectId, required:true},
  agentId:{type:Schema.Types.ObjectId, required:true}, directionId:{type:Schema.Types.ObjectId, required:true},
  serviceId:{type:Schema.Types.ObjectId, default:null}, actorUserId:{type:Schema.Types.ObjectId, required:true},
  kind:{type:String, required:true, enum:["SUBMITTED","MANAGER_REVIEWED","RH_REVIEWED","FINAL_REVIEWED","CANCELLED"]},
  title:{type:String, required:true}, message:{type:String, required:true}, createdAt:{type:Date, default:Date.now},
}, {versionKey:false});
schema.index({tenantId:1,requestId:1,kind:1},{unique:true});
schema.index({tenantId:1,_id:1});
schema.index({tenantId:1,agentId:1,_id:1});
schema.index({tenantId:1,directionId:1,serviceId:1,_id:1});
const Events: Model<LeavePopupEvent> = (mongoose.models.LeavePopupEvent as Model<LeavePopupEvent> | undefined) ?? mongoose.model<LeavePopupEvent>("LeavePopupEvent",schema);

export async function recordLeavePopup(tenant: TenantDocument, actor: LeaveActor, request: LeaveRequestDocument, kind: EventKind, session: ClientSession): Promise<void> {
  const agent = await AgentModel.findOne({_id:request.agentId,tenantId:tenant._id}).select("firstName lastName").session(session).lean().exec();
  const name = agent ? `${agent.firstName} ${agent.lastName}`.trim() : "Agent";
  const titles: Record<EventKind,string> = {SUBMITTED:"Nouvelle demande de congé",MANAGER_REVIEWED:"Réponse du responsable",RH_REVIEWED:"Réponse des RH",FINAL_REVIEWED:"Décision de l’administrateur",CANCELLED:"Demande de congé annulée"};
  const progress = kind === "SUBMITTED" ? "Demande soumise ; validation hiérarchique attendue."
    : kind === "CANCELLED" ? "La demande a été annulée."
    : request.status === "REJECTED" ? `Demande refusée par ${actor.fullName}.`
    : kind === "MANAGER_REVIEWED" ? "Accord hiérarchique obtenu ; examen RH attendu."
    : kind === "RH_REVIEWED" ? "Accord RH obtenu ; décision finale de l’administrateur attendue."
    : "Congé approuvé définitivement par l’administrateur.";
  await Events.create([{tenantId:tenant._id,requestId:request._id,agentId:request.agentId,directionId:request.directionId,serviceId:request.serviceId,actorUserId:actor.userId,kind,title:titles[kind],message:`${name} · ${request.startDate} au ${request.endDate} · ${progress}`}],{session});
}

export async function listLeavePopups(tenant: TenantDocument, actor: LeaveActor, after: unknown) {
  if (after !== undefined && (typeof after !== "string" || !/^[a-f\d]{24}$/i.test(after))) {
    throw new AppError("Le curseur de notification est invalide.",400,"LEAVE_POPUP_CURSOR_INVALID");
  }
  const cursor = typeof after === "string" ? after : "000000000000000000000000";
  const rows = await Events.find({$and:[{tenantId:tenant._id,_id:{$gt:new Types.ObjectId(cursor)},actorUserId:{$ne:actor.userId}},getLeaveScopeFilter(actor)]})
    .sort({_id:1}).limit(51).lean().exec();
  const items = rows.slice(0,50).map(row => ({id:row._id.toString(),requestId:row.requestId.toString(),kind:row.kind,title:row.title,message:row.message,createdAt:row.createdAt.toISOString()}));
  return {items,cursor:items[items.length - 1]?.id ?? cursor,hasMore:rows.length > 50};
}
