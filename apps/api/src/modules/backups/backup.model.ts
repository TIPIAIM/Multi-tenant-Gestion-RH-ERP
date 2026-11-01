import mongoose,{Schema,type Model,type Types} from "mongoose";
export interface Archive{tenantId:Types.ObjectId;label:string;modules:string[];fileId:Types.ObjectId;hash:string;bytes:number;documents:number;collections:number;origin:"MANUAL"|"IMPORT"|"SAFETY";createdBy:string;snapshotAt:Date;createdAt:Date;}
export interface Operation{tenantId:Types.ObjectId;actorId:Types.ObjectId;actorName:string;kind:"BACKUP"|"RESTORE";status:"RUNNING"|"COMPLETED"|"FAILED";phase:string;modules:string[];sourceId?:Types.ObjectId;resultId?:Types.ObjectId;safetyId?:Types.ObjectId;inserted:number;skipped:number;details?:Array<{module:string;restored:number;existing:number}>;message:string;heartbeatAt:Date;createdAt:Date;updatedAt:Date;}
export interface Lease{_id:string;owner:string;expiresAt:Date;revision:number;}
export interface BackupAuditEntry{tenantId:Types.ObjectId;actorId:Types.ObjectId;actorName:string;archiveId?:Types.ObjectId;action:"CHECKED"|"DOWNLOAD_REQUESTED"|"IMPORTED"|"DELETED";createdAt:Date;}
export interface Preview{records?:string[];modules?:string[];tenantId:Types.ObjectId;actorId:Types.ObjectId;archiveId:Types.ObjectId;tokenHash:string;expiresAt:Date;}
const oid=Schema.Types.ObjectId;
const archive=new Schema<Archive>({tenantId:{type:oid,required:true},label:String,modules:[String],fileId:{type:oid,required:true},hash:String,bytes:Number,documents:Number,collections:Number,origin:String,createdBy:String,snapshotAt:{type:Date,required:true}},{timestamps:{createdAt:true,updatedAt:false}});archive.index({tenantId:1,createdAt:-1,_id:-1});
const operation=new Schema<Operation>({tenantId:{type:oid,required:true},actorId:oid,actorName:String,kind:String,status:{type:String,enum:["RUNNING","COMPLETED","FAILED"]},phase:String,modules:[String],sourceId:oid,resultId:oid,safetyId:oid,inserted:{type:Number,default:0},skipped:{type:Number,default:0},details:[{_id:false,module:String,restored:Number,existing:Number}],message:String,heartbeatAt:Date},{timestamps:true});operation.index({tenantId:1,createdAt:-1});
const lease=new Schema<Lease>({_id:String,owner:String,expiresAt:Date,revision:{type:Number,default:0}},{versionKey:false});
const preview=new Schema<Preview>({records:[String],modules:[String],tenantId:oid,actorId:oid,archiveId:oid,tokenHash:String,expiresAt:Date});preview.index({expiresAt:1},{expireAfterSeconds:0});preview.index({tenantId:1,tokenHash:1},{unique:true});
const audit=new Schema<BackupAuditEntry>({tenantId:{type:oid,required:true},actorId:oid,actorName:String,archiveId:oid,action:String},{timestamps:{createdAt:true,updatedAt:false}});audit.index({tenantId:1,createdAt:-1});
export const BackupAudit:Model<BackupAuditEntry>=(mongoose.models.BackupAudit as Model<BackupAuditEntry>|undefined)??mongoose.model<BackupAuditEntry>("BackupAudit",audit);
export const BackupArchive:Model<Archive>=(mongoose.models.BackupArchive as Model<Archive>|undefined)??mongoose.model<Archive>("BackupArchive",archive);
export const BackupOperation:Model<Operation>=(mongoose.models.BackupOperation as Model<Operation>|undefined)??mongoose.model<Operation>("BackupOperation",operation);
export const BackupLease:Model<Lease>=(mongoose.models.BackupLease as Model<Lease>|undefined)??mongoose.model<Lease>("BackupLease",lease);
export const BackupPreview:Model<Preview>=(mongoose.models.BackupPreview as Model<Preview>|undefined)??mongoose.model<Preview>("BackupPreview",preview);
export async function ensureBackupIndexes(){for(const model of [BackupArchive,BackupOperation,BackupLease,BackupPreview,BackupAudit])await model.createIndexes();}
