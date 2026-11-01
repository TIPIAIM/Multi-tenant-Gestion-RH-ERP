import mongoose, {Schema, type Model, type Types} from "mongoose";
import {trainingFormats,sessionStatuses,enrollmentStatuses,type SessionStatus,type EnrollmentStatus} from "./training.rules.js";
export interface TrainingCourse {
 tenantId:Types.ObjectId;code:string;title:string;category:string;objectives:string;provider:string;
 format:typeof trainingFormats[number];durationHours:number;active:boolean;createdByUserId:Types.ObjectId;createdAt?:Date;updatedAt?:Date;
}
export interface TrainingSession {
 tenantId:Types.ObjectId;courseId:Types.ObjectId;title:string;provider:string;format:typeof trainingFormats[number];
 startsAt:Date;endsAt:Date;durationHours:number;capacity:number;location:string;trainer:string;
 totalCost:number;currency:"GNF"|"EUR"|"USD";
 status:SessionStatus;revision:number;createdByUserId:Types.ObjectId;closedAt?:Date;closedByName?:string;createdAt?:Date;updatedAt?:Date;
}
export interface TrainingEnrollment {
 needId:Types.ObjectId;bookingReference?:string;externalOutcome?:"ATTENDED"|"PARTIAL"|"NOT_ATTENDED";externalResultNotes?:string;externalCertificateUrl?:string;externalCertificateReference?:string;
 tenantId:Types.ObjectId;sessionId:Types.ObjectId;agentId:Types.ObjectId;agentName:string;matricule:string;
 directionId:Types.ObjectId;serviceId:Types.ObjectId|null;status:EnrollmentStatus;
 reviewComment:string;requestedByUserId:Types.ObjectId;
 reviewedByUserId?:Types.ObjectId;reviewedAt?:Date;
 satisfaction?:number|null;feedback?:string;feedbackAt?:Date;createdAt?:Date;updatedAt?:Date;
}
const oid={type:Schema.Types.ObjectId,required:true};
const courseSchema=new Schema<TrainingCourse>({tenantId:oid,code:{type:String,required:true,trim:true,uppercase:true},title:{type:String,required:true,trim:true},category:{type:String,required:true},objectives:{type:String,default:""},provider:{type:String,default:""},format:{type:String,enum:[...trainingFormats],required:true},durationHours:{type:Number,required:true,min:.5},active:{type:Boolean,default:true},createdByUserId:oid},{timestamps:true,versionKey:false});
courseSchema.index({tenantId:1,code:1},{unique:true});courseSchema.index({tenantId:1,active:1,createdAt:-1});
const sessionSchema=new Schema<TrainingSession>({tenantId:oid,courseId:oid,title:{type:String,required:true},provider:{type:String,default:""},format:{type:String,enum:[...trainingFormats],required:true},startsAt:{type:Date,required:true},endsAt:{type:Date,required:true},durationHours:{type:Number,required:true,min:.5},capacity:{type:Number,required:true,min:1},location:{type:String,default:""},trainer:{type:String,default:""},totalCost:{type:Number,default:0,min:0},currency:{type:String,enum:["GNF","EUR","USD"],default:"GNF"},status:{type:String,enum:[...sessionStatuses],default:"DRAFT"},revision:{type:Number,default:0},createdByUserId:oid,closedAt:Date,closedByName:String},{timestamps:true,versionKey:false});
sessionSchema.index({tenantId:1,status:1,startsAt:-1});sessionSchema.index({tenantId:1,courseId:1,createdAt:-1});
const enrollmentSchema=new Schema<TrainingEnrollment>({needId:{type:Schema.Types.ObjectId,required:true},bookingReference:String,externalOutcome:{type:String,enum:["ATTENDED","PARTIAL","NOT_ATTENDED"]},externalResultNotes:String,externalCertificateUrl:String,externalCertificateReference:String,tenantId:oid,sessionId:oid,agentId:oid,agentName:{type:String,required:true},matricule:{type:String,default:""},directionId:oid,serviceId:{type:Schema.Types.ObjectId,default:null},status:{type:String,enum:[...enrollmentStatuses],default:"REQUESTED"},reviewComment:{type:String,default:""},requestedByUserId:oid,reviewedByUserId:Schema.Types.ObjectId,reviewedAt:Date,satisfaction:{type:Number,min:1,max:5},feedback:String,feedbackAt:Date},{timestamps:true,versionKey:false});
enrollmentSchema.index({tenantId:1,sessionId:1,agentId:1},{unique:true});
enrollmentSchema.index({tenantId:1,needId:1,status:1});enrollmentSchema.index({tenantId:1,agentId:1,status:1,createdAt:-1});enrollmentSchema.index({tenantId:1,directionId:1,serviceId:1,createdAt:-1});
interface TrainingAudit {tenantId:Types.ObjectId;sessionId?:Types.ObjectId;enrollmentId?:Types.ObjectId;actorId:Types.ObjectId;actorName:string;action:string;details:Record<string,unknown>;createdAt?:Date}
const auditSchema=new Schema<TrainingAudit>({tenantId:oid,sessionId:Schema.Types.ObjectId,enrollmentId:Schema.Types.ObjectId,actorId:oid,actorName:{type:String,required:true},action:{type:String,required:true},details:{type:Schema.Types.Mixed,default:{}}},{timestamps:{createdAt:true,updatedAt:false},versionKey:false});auditSchema.index({tenantId:1,sessionId:1,createdAt:-1});
export const TrainingCourseModel:Model<TrainingCourse>=(mongoose.models.TrainingCourse as Model<TrainingCourse>|undefined)??mongoose.model<TrainingCourse>("TrainingCourse",courseSchema);
export const TrainingSessionModel:Model<TrainingSession>=(mongoose.models.TrainingSession as Model<TrainingSession>|undefined)??mongoose.model<TrainingSession>("TrainingSession",sessionSchema);
export const TrainingEnrollmentModel:Model<TrainingEnrollment>=(mongoose.models.TrainingEnrollment as Model<TrainingEnrollment>|undefined)??mongoose.model<TrainingEnrollment>("TrainingEnrollment",enrollmentSchema);
export const TrainingAuditModel:Model<TrainingAudit>=(mongoose.models.TrainingAudit as Model<TrainingAudit>|undefined)??mongoose.model<TrainingAudit>("TrainingAudit",auditSchema);
const lockSchema=new Schema<{_id:string;revision:number}>({_id:{type:String,required:true},revision:{type:Number,default:0}},{versionKey:false});
export const TrainingAgentLockModel=(mongoose.models.TrainingAgentLock as Model<{_id:string;revision:number}>|undefined)??mongoose.model<{_id:string;revision:number}>("TrainingAgentLock",lockSchema);
