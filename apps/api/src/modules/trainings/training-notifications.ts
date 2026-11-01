import {getPublishedModuleSettings} from "../settings/settings.module-runtime.js";
import mongoose,{Schema,Types,type ClientSession,type Model} from "mongoose";
import {AppError} from "../../core/errors/app-error.js";
import type {TrainingActor} from "./training.access.js";
import {trainingNoticeAudience} from "./training-notification-rules.js";
interface TrainingNotice{tenantId:Types.ObjectId;actorId:Types.ObjectId;audience:"ALL"|"MANAGERS"|"AGENT";agentId?:Types.ObjectId;kind:string;title:string;message:string;sessionId?:Types.ObjectId;needId?:Types.ObjectId;createdAt:Date;}
const schema=new Schema<TrainingNotice>({
 tenantId:{type:Schema.Types.ObjectId,required:true},actorId:{type:Schema.Types.ObjectId,required:true},
 audience:{type:String,enum:["ALL","MANAGERS","AGENT"],required:true},agentId:Schema.Types.ObjectId,
 kind:{type:String,required:true},title:{type:String,required:true},message:{type:String,required:true},
 sessionId:Schema.Types.ObjectId,needId:Schema.Types.ObjectId,
},{timestamps:true});
schema.index({tenantId:1,audience:1,_id:1});
schema.index({tenantId:1,agentId:1,_id:1});
export const TrainingNoticeModel:Model<TrainingNotice>=(mongoose.models.TrainingNotice as Model<TrainingNotice>|undefined)??mongoose.model<TrainingNotice>("TrainingNotice",schema);
export async function createTrainingNotice(a:TrainingActor,action:string,details:Record<string,unknown>,sessionId?:Types.ObjectId,db?:ClientSession){
 const audience=trainingNoticeAudience(action,details);if(!audience)return;
 const title=action==="NEED_IDENTIFIED"?"Nouveau besoin de formation":action==="ENROLLMENT_REQUESTED"?"Nouvelle demande d’inscription":action==="ENROLLMENT_DIRECT"?"Nouvelle inscription directe":action==="ENROLLMENT_REVIEWED"?"Réponse à votre inscription":"Nouvelle formation proposée";
 const message=action==="NEED_IDENTIFIED"?`${a.fullName} a exprimé un besoin : ${String(details.competency??"")}`:action==="ENROLLMENT_REVIEWED"?`${String(details.title??"Formation")} : ${details.decision==="APPROVED"?"votre demande est acceptée":"votre demande est refusée"}.`:action==="ENROLLMENT_REQUESTED"||action==="ENROLLMENT_DIRECT"?`${String(details.agentName??a.fullName)} souhaite participer à « ${String(details.title??"une formation")} ».`:`${String(details.title??"Une formation")} · Découvrez le programme et demandez à participer.`;
 await TrainingNoticeModel.create([{tenantId:a.tenantId,actorId:a.userId,audience,kind:action,title,message,sessionId,needId:details.needId,agentId:details.agentId}],{session:db});
}
export async function trainingPopups(a:TrainingActor,after:unknown){
 if(typeof after!=="string"||! /^[a-f\d]{24}$/i.test(after))throw new AppError("Curseur de notification invalide.",400,"TRAINING_CURSOR_INVALID");
 const published=await getPublishedModuleSettings(a.tenantId);if(!published.notifications.enabled||!published.notifications.inAppEnabled||!published.notifications.trainingPopupEnabled)return {items:[],cursor:after,hasMore:false};
 const rows=await TrainingNoticeModel.find({tenantId:a.tenantId,_id:{$gt:new Types.ObjectId(after)},$or:[{audience:"ALL"},...(["RH_MANAGER","TENANT_ADMIN"].includes(a.role)?[{audience:"MANAGERS"}]:[]),...(a.agentId?[{audience:"AGENT",agentId:a.agentId}]:[])]}).sort({_id:1}).limit(51).lean().exec();
 const page=rows.slice(0,50);
 return {items:page.map(row=>({id:String(row._id),kind:row.kind,title:row.title,message:row.message,createdAt:new Date(row.createdAt).toISOString(),sessionId:row.sessionId?String(row.sessionId):undefined,needId:row.needId?String(row.needId):undefined})),cursor:page.length?String(page[page.length-1]!._id):after,hasMore:rows.length>50};
}
