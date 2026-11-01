import {Types} from "mongoose";
import {AppError} from "../../core/errors/app-error.js";
import {UserModel} from "../users/user.model.js";
import {AgentModel} from "../agents/agent.model.js";
import type {UserRole} from "../users/user.types.js";
export type TrainingActor={tenantId:Types.ObjectId;userId:Types.ObjectId;fullName:string;role:UserRole;agentId?:Types.ObjectId;directionId?:Types.ObjectId;serviceId?:Types.ObjectId|null};
export const canManageTraining=(a:TrainingActor)=>a.role==="TENANT_ADMIN"||a.role==="RH_MANAGER";
export const sameId=(a:unknown,b:unknown)=>a!=null&&b!=null&&String(a)===String(b);
export function requireTrainingManager(a:TrainingActor){if(!canManageTraining(a))throw new AppError("La gestion des formations est réservée aux RH et à l’administrateur.",403,"TRAINING_MANAGE_FORBIDDEN");}
export function trainingAgentScope(a:TrainingActor):Record<string,unknown>{
 if(canManageTraining(a))return {};
 if(!a.agentId||!a.directionId)throw new AppError("Votre compte doit être lié à un agent pour accéder à ce suivi.",403,"TRAINING_AGENT_REQUIRED");
 if(a.role==="DIRECTION")return {directionId:a.directionId};
 if(a.role==="SERVICE_MANAGER"){
  if(!a.serviceId)throw new AppError("Votre compte doit être rattaché à un service.",403,"TRAINING_SERVICE_REQUIRED");
  return {directionId:a.directionId,serviceId:a.serviceId};
 }
 return {agentId:a.agentId};
}
export function canReadEnrollment(a:TrainingActor,row:{agentId:Types.ObjectId;directionId:Types.ObjectId;serviceId:Types.ObjectId|null}){
 if(canManageTraining(a)||sameId(a.agentId,row.agentId))return true;
 if(a.role==="DIRECTION")return sameId(a.directionId,row.directionId);
 return a.role==="SERVICE_MANAGER"&&sameId(a.directionId,row.directionId)&&sameId(a.serviceId,row.serviceId)&&Boolean(a.serviceId);
}
export async function resolveTrainingActor(tenantId:Types.ObjectId,userId:string):Promise<TrainingActor>{
 const user=await UserModel.findOne({_id:userId,tenantId,isActive:true}).select("_id fullName role agentId").lean().exec();
 if(!user||!["TENANT_ADMIN","RH_MANAGER","DIRECTION","SERVICE_MANAGER","AGENT"].includes(user.role))throw new AppError("Compte non autorisé.",403,"TRAINING_ACTOR_FORBIDDEN");
 const raw=user as unknown as {_id:Types.ObjectId;fullName:string;role:UserRole;agentId?:Types.ObjectId|null};
 const agent=await AgentModel.findOne({tenantId,...(raw.agentId?{_id:raw.agentId}:{userId:raw._id})}).select("_id directionId serviceId").lean().exec();
 return {tenantId,userId:raw._id,fullName:raw.fullName,role:raw.role,agentId:agent?._id,directionId:agent?.directionId,serviceId:agent?.serviceId??null};
}
