import mongoose,{Schema,type Types,type Model} from "mongoose";
import {jobStatuses,applicationStages,type ApplicationStage} from "./recruitment.rules.js";
export interface RecruitmentJob{tenantId:Types.ObjectId;title:string;department:string;location:string;contract:"CDI"|"CDD"|"INTERNSHIP"|"CONSULTING";positions:number;deadline:string;description:string;requirements:string;reference:string;status:typeof jobStatuses[number];revision:number;createdBy:Types.ObjectId;createdAt:Date;updatedAt:Date;}
export interface RecruitmentApplication{tenantId:Types.ObjectId;jobId:Types.ObjectId;fullName:string;email?:string;phone:string;source:string;cvUrl:string;summary:string;stage:ApplicationStage;startDate?:string;decisionComment?:string;anonymizedAt?:Date;createdBy:Types.ObjectId;createdAt:Date;updatedAt:Date;}
export interface RecruitmentInterview{tenantId:Types.ObjectId;jobId:Types.ObjectId;applicationId:Types.ObjectId;startsAt:Date;endsAt:Date;interviewer:string;location:string;mode:"IN_PERSON"|"REMOTE"|"PHONE";status:"SCHEDULED"|"DONE"|"CANCELLED";recommendation?:"FAVORABLE"|"RESERVED"|"UNFAVORABLE";notes:string;comment:string;createdBy:Types.ObjectId;createdAt:Date;updatedAt:Date;}
export interface RecruitmentEvent{tenantId:Types.ObjectId;jobId:Types.ObjectId;applicationId?:Types.ObjectId;actorId:Types.ObjectId;actorName:string;action:string;comment:string;createdAt:Date;}
export interface RecruitmentNotice{tenantId:Types.ObjectId;jobId:Types.ObjectId;applicationId?:Types.ObjectId;kind:string;title:string;message:string;createdAt:Date;}
const oid=Schema.Types.ObjectId;
const jobSchema=new Schema<RecruitmentJob>({tenantId:{type:oid,required:true},title:{type:String,required:true},department:String,location:String,contract:String,positions:Number,deadline:String,description:String,requirements:String,reference:String,status:{type:String,enum:jobStatuses,default:"DRAFT"},revision:{type:Number,default:0},createdBy:{type:oid,required:true}},{timestamps:true});
jobSchema.index({tenantId:1,status:1,createdAt:-1,_id:-1});
jobSchema.index({tenantId:1,reference:1},{unique:true});
const applicationSchema=new Schema<RecruitmentApplication>({tenantId:{type:oid,required:true},jobId:{type:oid,required:true},fullName:{type:String,required:true},email:String,phone:String,source:String,cvUrl:String,summary:String,stage:{type:String,enum:applicationStages,default:"APPLIED"},startDate:String,decisionComment:String,anonymizedAt:Date,createdBy:{type:oid,required:true}},{timestamps:true});
applicationSchema.index({tenantId:1,jobId:1,email:1},{unique:true,partialFilterExpression:{email:{$type:"string"}}});
applicationSchema.index({tenantId:1,stage:1,createdAt:-1,_id:-1});
const interviewSchema=new Schema<RecruitmentInterview>({tenantId:{type:oid,required:true},jobId:{type:oid,required:true},applicationId:{type:oid,required:true},startsAt:Date,endsAt:Date,interviewer:String,location:String,mode:String,status:{type:String,enum:["SCHEDULED","DONE","CANCELLED"],default:"SCHEDULED"},recommendation:String,notes:String,comment:{type:String,default:""},createdBy:{type:oid,required:true}},{timestamps:true});
interviewSchema.index({tenantId:1,startsAt:1,status:1});
interviewSchema.index({tenantId:1,applicationId:1,startsAt:1});
const eventSchema=new Schema<RecruitmentEvent>({tenantId:{type:oid,required:true},jobId:{type:oid,required:true},applicationId:oid,actorId:oid,actorName:String,action:String,comment:String},{timestamps:{createdAt:true,updatedAt:false}});
eventSchema.index({tenantId:1,applicationId:1,createdAt:-1,_id:-1});
const noticeSchema=new Schema<RecruitmentNotice>({tenantId:{type:oid,required:true},jobId:{type:oid,required:true},applicationId:oid,kind:String,title:String,message:String},{timestamps:{createdAt:true,updatedAt:false}});
noticeSchema.index({tenantId:1,_id:1});
export const RecruitmentJobModel:Model<RecruitmentJob>=(mongoose.models.RecruitmentJob as Model<RecruitmentJob>|undefined)??mongoose.model<RecruitmentJob>("RecruitmentJob",jobSchema);
export const RecruitmentApplicationModel:Model<RecruitmentApplication>=(mongoose.models.RecruitmentApplication as Model<RecruitmentApplication>|undefined)??mongoose.model<RecruitmentApplication>("RecruitmentApplication",applicationSchema);
export const RecruitmentInterviewModel:Model<RecruitmentInterview>=(mongoose.models.RecruitmentInterview as Model<RecruitmentInterview>|undefined)??mongoose.model<RecruitmentInterview>("RecruitmentInterview",interviewSchema);
export const RecruitmentEventModel:Model<RecruitmentEvent>=(mongoose.models.RecruitmentEvent as Model<RecruitmentEvent>|undefined)??mongoose.model<RecruitmentEvent>("RecruitmentEvent",eventSchema);
export const RecruitmentNoticeModel:Model<RecruitmentNotice>=(mongoose.models.RecruitmentNotice as Model<RecruitmentNotice>|undefined)??mongoose.model<RecruitmentNotice>("RecruitmentNotice",noticeSchema);
