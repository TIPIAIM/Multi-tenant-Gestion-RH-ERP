import mongoose,{Types,type ClientSession} from "mongoose";
import {randomBytes} from "node:crypto";
import {AppError} from "../../core/errors/app-error.js";
import {BackupArchive,BackupOperation,BackupLease,BackupPreview,BackupAudit,type Archive} from "./backup.model.js";
import {catalog,modelsFor,schemaFingerprint} from "./backup.catalog.js";
import {digest,encryptionKey,seal,unseal} from "./backup.crypto.js";
import {groups,expandGroups,MAX_BYTES,MAX_DOCUMENTS,MAX_FILE_BYTES,referenceModels,sameTenant} from "./backup.rules.js";
export type BackupActor={tenantId:Types.ObjectId;userId:Types.ObjectId;fullName:string;role:string};
type Snapshot={format:1;tenantId:string;createdAt:string;modules:string[];collections:Array<{model:string;schema:string;documents:Record<string,any>[]}>};
const running=new Set<Promise<unknown>>();
const committing=new Set<string>();
const fail=(message:string,status=400,code="BACKUP_INVALID"):never=>{throw new AppError(message,status,code);};
function guard(a:BackupActor){if(a.role!=="TENANT_ADMIN")fail("Les sauvegardes sont réservées à l’administrateur.",403);}
function bucket(){if(!mongoose.connection.db)fail("La base de données n’est pas disponible.",503);return new mongoose.mongo.GridFSBucket(mongoose.connection.db!,{bucketName:"rhBackupFiles"});}
const json=(v:unknown)=>mongoose.mongo.BSON.EJSON.stringify(v,{relaxed:false});
function canonical(value:any):any{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
export const documentHash=(doc:unknown)=>digest(JSON.stringify(canonical(mongoose.mongo.BSON.EJSON.serialize(doc,{relaxed:false}))));
function publicArchive(row:Archive&{_id:unknown}){return {id:String(row._id),label:row.label,modules:row.modules,bytes:row.bytes,documents:row.documents,collections:row.collections,origin:row.origin,createdBy:row.createdBy,createdAt:row.createdAt,snapshotAt:row.snapshotAt};}
export async function list(a:BackupActor,page:number){guard(a);await expireOperations(a);const filter={tenantId:a.tenantId};const [rows,total,operations,audit,archiveTotals,restoreTotals]=await Promise.all([BackupArchive.find(filter).sort({createdAt:-1,_id:-1}).skip((page-1)*10).limit(10).lean().exec(),BackupArchive.countDocuments(filter),BackupOperation.find(filter).sort({createdAt:-1,_id:-1}).limit(10).lean().exec(),BackupAudit.find(filter).sort({createdAt:-1,_id:-1}).limit(10).lean().exec(),BackupArchive.aggregate([{$match:filter},{$group:{_id:null,bytes:{$sum:"$bytes"},documents:{$sum:"$documents"}}}]),BackupOperation.aggregate([{$match:{...filter,kind:"RESTORE",status:"COMPLETED"}},{$group:{_id:null,count:{$sum:1},inserted:{$sum:"$inserted"}}}])]);return {serviceVersion:"2.4",statistics:{copies:total,bytes:archiveTotals[0]?.bytes??0,documents:archiveTotals[0]?.documents??0,restorations:restoreTotals[0]?.count??0,restored:restoreTotals[0]?.inserted??0},audit:audit.map(e=>({id:String(e._id),actorName:e.actorName,action:e.action,createdAt:e.createdAt})),items:rows.map(publicArchive),operations:operations.map(v=>({id:String(v._id),kind:v.kind,status:v.status,phase:v.phase,message:v.message,inserted:v.inserted,skipped:v.skipped,details:v.details??[],safetyId:v.safetyId?String(v.safetyId):undefined,createdAt:v.createdAt,updatedAt:v.updatedAt})),pagination:{page,total,totalPages:Math.max(1,Math.ceil(total/10))},modules:catalog(),configured:configured(),limits:{maximumMegabytes:20,maximumDocuments:MAX_DOCUMENTS}};}
function configured(){try{encryptionKey();return true;}catch{return false;}}
async function expireOperations(a:BackupActor){const stale=new Date(Date.now()-10*60000);const rows=await BackupOperation.find({tenantId:a.tenantId,status:"RUNNING",heartbeatAt:{$lt:stale}}).select("_id").lean().exec();for(const row of rows){const live=await BackupLease.exists({_id:String(a.tenantId),owner:String(row._id),expiresAt:{$gt:new Date()}});if(!live)await BackupOperation.updateOne({_id:row._id,status:"RUNNING",heartbeatAt:{$lt:stale}},{$set:{status:"FAILED",message:"L’opération a été interrompue. Vous pouvez la relancer ; aucune restauration partielle n’est conservée."}});}}
async function acquire(a:BackupActor,id:Types.ObjectId){const now=new Date();try{const lease=await BackupLease.findOneAndUpdate({_id:String(a.tenantId),expiresAt:{$lte:now}},{$set:{owner:String(id),expiresAt:new Date(Date.now()+10*60000)},$inc:{revision:1}},{upsert:true,new:true}).exec();if(!lease)fail("Une opération est déjà en cours. Attendez sa fin.",409);}catch(e){if((e as {code?:number}).code===11000)fail("Une opération est déjà en cours. Attendez sa fin.",409);throw e;}}
async function release(a:BackupActor,id:Types.ObjectId){await BackupLease.updateOne({_id:String(a.tenantId),owner:String(id)},{$set:{expiresAt:new Date(0)}});}
async function fenced(a:BackupActor,id:Types.ObjectId,session:ClientSession){const lock=await BackupLease.updateOne({_id:String(a.tenantId),owner:String(id),expiresAt:{$gt:new Date()}},{$inc:{revision:1}},{session});if(lock.matchedCount!==1)fail("L’autorisation temporaire de restauration a expiré. Relancez le contrôle.",409);}
async function run(a:BackupActor,kind:"BACKUP"|"RESTORE",modules:string[],work:(id:Types.ObjectId)=>Promise<void>){guard(a);if(!configured())fail("Le service de sauvegarde est temporairement indisponible. Contactez le support de la plateforme.",503);const id=new Types.ObjectId();await acquire(a,id);try{await BackupOperation.create({_id:id,tenantId:a.tenantId,actorId:a.userId,actorName:a.fullName,kind,status:"RUNNING",phase:"PREPARING",modules,heartbeatAt:new Date(),message:""});}catch(e){await release(a,id);throw e;}
 let heartbeat=Promise.resolve();const timer=setInterval(()=>{heartbeat=heartbeat.then(async()=>{if(committing.has(String(id)))return;await BackupLease.updateOne({_id:String(a.tenantId),owner:String(id)},{$set:{expiresAt:new Date(Date.now()+10*60000)}});await BackupOperation.updateOne({_id:id,status:"RUNNING"},{$set:{heartbeatAt:new Date()}});}).catch(()=>{});},30000);timer.unref();
 const task=(async()=>{try{await work(id);await BackupOperation.updateOne({_id:id,status:"RUNNING"},{$set:{status:"COMPLETED",phase:"COMPLETED",message:"Opération terminée."}});}catch(e){console.error("[RH backup]",{operationId:String(id),kind,name:(e as Error)?.name,code:(e as {code?:unknown})?.code});await BackupOperation.updateOne({_id:id},{$set:{status:"FAILED",message:publicFailure(e)}}).catch(()=>{});}finally{clearInterval(timer);await heartbeat;await release(a,id).catch(()=>{});}})();running.add(task);void task.finally(()=>running.delete(task)).catch(()=>{});return {operationId:String(id)};
}
function publicFailure(error:unknown){if(error instanceof AppError)return error.message;if(/replica set|Transaction numbers|mongos/i.test(String((error as Error)?.message)))return "La sauvegarde nécessite une base compatible avec les transactions. Contactez votre responsable technique.";return "L’opération n’a pas abouti. Aucune restauration partielle n’a été conservée. Vérifiez le fichier et réessayez, ou contactez votre responsable technique.";}
async function snapshot(a:BackupActor,selected:string[]):Promise<Snapshot>{
 const choices=catalog();if(selected.some(k=>!choices.some(c=>c.key===k&&c.available)))fail("Un des modules sélectionnés n’est pas disponible dans cette installation.");
 const descriptors=modelsFor(selected);if(!descriptors.length)fail("Aucune donnée disponible pour cette sélection.");
 const data:Snapshot={format:1,tenantId:String(a.tenantId),createdAt:new Date().toISOString(),modules:[...new Set(descriptors.map(d=>d.group))],collections:[]};
 let count=0,bytes=0;const db=await mongoose.startSession();try{await db.withTransaction(async()=>{data.collections=[];count=0;bytes=0;for(const {model} of descriptors){const documents:Record<string,any>[]=[];const cursor=model.collection.find({tenantId:a.tenantId},{session:db,sort:{_id:1}});for await(const document of cursor){count++;bytes+=Buffer.byteLength(json(document));if(count>MAX_DOCUMENTS||bytes>MAX_BYTES)fail("Cette sélection est trop volumineuse. Sauvegardez moins de modules à la fois.",413);documents.push(document);}data.collections.push({model:model.modelName,schema:schemaFingerprint(model),documents});}},{readConcern:{level:"snapshot"},writeConcern:{w:"majority"}});return data;}finally{await db.endSession();}}
async function store(a:BackupActor,data:Snapshot,label:string,origin:Archive["origin"]){const encrypted=await seal(json(data),String(a.tenantId));const fileId=new Types.ObjectId();const stream=bucket().openUploadStreamWithId(fileId,"sauvegarde.rhbackup",{metadata:{tenantId:String(a.tenantId)}});try{await new Promise<void>((resolve,reject)=>{stream.once("finish",resolve);stream.once("error",reject);stream.end(encrypted);});const row=await BackupArchive.create({tenantId:a.tenantId,label,modules:data.modules,fileId,hash:digest(encrypted),bytes:encrypted.length,documents:data.collections.reduce((n,c)=>n+c.documents.length,0),collections:data.collections.length,origin,createdBy:a.fullName,snapshotAt:new Date(data.createdAt)});return row;}catch(e){await bucket().delete(fileId).catch(()=>{});throw e;}}
export async function create(a:BackupActor,selected:string[],label:string){guard(a);const modules=expandGroups(selected);return run(a,"BACKUP",modules,async id=>{const data=await snapshot(a,selected);const row=await store(a,data,label||"Sauvegarde de l’organisation","MANUAL");await BackupOperation.updateOne({_id:id},{$set:{resultId:row._id}});});}
async function archive(a:BackupActor,id:string){guard(a);const row=await BackupArchive.findOne({_id:id,tenantId:a.tenantId}).exec();if(!row)fail("Sauvegarde introuvable.",404);return row!;}
async function bytesFor(row:Archive){const buffers:Buffer[]=[];let size=0;for await(const piece of bucket().openDownloadStream(row.fileId)){const part=Buffer.from(piece);size+=part.length;if(size>MAX_FILE_BYTES)fail("Le fichier dépasse la taille acceptée.",413);buffers.push(part);}const bytes=Buffer.concat(buffers);if(digest(bytes)!==row.hash)fail("L’intégrité de cette sauvegarde n’a pas pu être confirmée.",422);return bytes;}
// EJSON strict preserves BSON numeric types: normalize only the envelope version.
function snapshotVersion(value:unknown):unknown{
 if(value&&typeof value==="object"&&(value as {_bsontype?:string})._bsontype==="Int32")return (value as {valueOf:()=>number}).valueOf();
 return value;
}
function validateSnapshot(a:BackupActor,data:Snapshot){
 if(!data||snapshotVersion(data.format)!==1)fail("Le format de cette sauvegarde n’est pas pris en charge. Vérifiez que la dernière mise à jour du service a été installée.",422,"BACKUP_FORMAT_UNSUPPORTED");
 if(data.tenantId!==String(a.tenantId))fail("Cette copie a été créée dans un autre espace. Sélectionnez une sauvegarde de l’organisation actuellement ouverte.",422,"BACKUP_TENANT_MISMATCH");
 if(!Array.isArray(data.modules)||!Array.isArray(data.collections)||(data.modules.length<1||data.modules.length>13||new Set(data.modules).size!==data.modules.length)||!Number.isFinite(Date.parse(data.createdAt))||data.modules.some(k=>typeof k!=="string"))fail("Le fichier de sauvegarde est incomplet ou invalide.",422);
 let allowed:ReturnType<typeof modelsFor>;try{allowed=modelsFor(data.modules);}catch{fail("Cette sauvegarde n’est pas compatible avec les modules installés.",422);}
 const names=new Set<string>();let total=0;
 for(const collection of data.collections){if(!collection||typeof collection.model!=="string"||!Array.isArray(collection.documents))fail("Le fichier est incomplet.",422);const descriptor=allowed.find(d=>d.model.modelName===collection.model);if(!descriptor||names.has(collection.model)||schemaFingerprint(descriptor.model)!==collection.schema)fail("La structure de cette sauvegarde ne correspond pas à la version installée. Contactez votre responsable technique.",422);names.add(collection.model);const ids=new Set<string>();for(const document of collection.documents){if(!document||((descriptor.model.schema.path("_id")?.instance??"ObjectId")==="String"?!(typeof document._id==="string"&&document._id.length>0&&document._id.length<=300):!(document._id instanceof Types.ObjectId))||!sameTenant(document.tenantId,String(a.tenantId))||ids.has(String(document._id)))fail("Le fichier contient des données incompatibles.",422);ids.add(String(document._id));total++;if(total>MAX_DOCUMENTS)fail("Le fichier contient trop de données.",413);}}
 if(names.size!==allowed.length||!names.size)fail("Le fichier ne contient pas toutes les données annoncées.",422);
}
async function load(a:BackupActor,row:Archive):Promise<Snapshot>{let data:Snapshot;try{data=mongoose.mongo.BSON.EJSON.parse(await unseal(await bytesFor(row),String(a.tenantId)),{relaxed:false}) as Snapshot;}catch(e){if(e instanceof AppError)throw e;fail("Ce fichier ne peut pas être ouvert pour votre organisation. Vérifiez son origine et la clé de sauvegarde de l’installation.",422);}validateSnapshot(a,data!);return data!;}
async function references(a:BackupActor,data:Snapshot,session?:ClientSession,inspectOnly=false,availableData:Snapshot=data,lookupCache=new Map<string,number>()){
 const available=new Map(availableData.collections.map(c=>[c.model,new Set(c.documents.map(d=>String(d._id)))]));const required=new Map<string,Set<string>>();
 for(const collection of data.collections){const model=mongoose.models[collection.model]!;function walk(value:any,key=""){if(value instanceof Types.ObjectId){const schemaPath=model.schema.path(key);const ref=typeof schemaPath?.options.ref==="string"?schemaPath.options.ref:referenceModels[key]??(key==="sessionId"&&collection.model.startsWith("Training")?"TrainingSession":undefined);if(ref&&ref!=="Tenant"&&!available.get(ref)?.has(String(value))){if(!required.has(ref))required.set(ref,new Set());required.get(ref)!.add(String(value));}return;}if(Array.isArray(value)){for(const item of value)walk(item,key);}else if(value&&typeof value==="object"&&!(value instanceof Date)){for(const [field,item]of Object.entries(value))walk(item,field);}}
 for(const document of collection.documents)walk(document);}
 const issues:Array<{label:string;missing:number;unavailable:boolean}>=[];
 for(const [name,ids]of required){
  const label=name==="User"?"Comptes utilisateurs":groups.find(g=>g.prefixes.some(p=>name.startsWith(p)))?.label??"Dossiers liés";
  const model=mongoose.models[name];
  if(!model?.schema.path("tenantId")){issues.push({label,missing:ids.size,unavailable:true});continue;}
  const values=[...ids];let missing=0;
  for(let offset=0;offset<values.length;offset+=500){const batch=values.slice(offset,offset+500);const cacheKey=JSON.stringify([name,...batch.slice().sort()]);let count=lookupCache.get(cacheKey);if(count===undefined){count=await model.collection.countDocuments({tenantId:a.tenantId,_id:{$in:batch.map(v=>new Types.ObjectId(v))}},{session});lookupCache.set(cacheKey,count!);}missing+=batch.length-count!;}
  if(missing)issues.push({label,missing,unavailable:false});
 }
 if(issues.length&&!inspectOnly)fail("Des dossiers liés ou des comptes utilisateurs nécessaires sont absents. Relancez le bilan pour consulter les dépendances manquantes.",409,"BACKUP_MISSING_REFERENCES");
 return issues;
}
/** Inspection is read-only; current records are always preserved. */
async function plan(a:BackupActor,data:Snapshot,session?:ClientSession,inspectOnly=false){
 let missing=0,existing=0,changed=0,added=0;
 const modules:Array<{label:string;documents:number;missing:number;changed:number;added:number}>=[];
 const blockers:string[]=[];
 const descriptors=modelsFor(data.modules);
 for(const collection of data.collections){
  const model=mongoose.models[collection.model]!,saved=new Map(collection.documents.map(d=>[String(d._id),d]));
  let present=0,different=0,newer=0;
  const cursor=model.collection.find({tenantId:a.tenantId},{session});
  for await(const current of cursor){
   const source=saved.get(String(current._id));
   if(!source){newer++;continue;}
   present++;if(documentHash(source)!==documentHash(current))different++;
  }

  const ids=collection.documents.map(d=>d._id);
  for(let offset=0;offset<ids.length;offset+=500){
   const collision=await model.collection.findOne({_id:{$in:ids.slice(offset,offset+500)},tenantId:{$ne:a.tenantId}},{session,projection:{_id:1}});
   if(collision){if(!inspectOnly)fail("La restauration de ces identifiants n’est pas autorisée.",409);if(!blockers.includes("Certains identifiants ne peuvent pas être restaurés dans cet espace."))blockers.push("Certains identifiants ne peuvent pas être restaurés dans cet espace.");}
  }
  missing+=collection.documents.length-present;existing+=present;changed+=different;added+=newer;
  modules.push({label:descriptors.find(d=>d.model.modelName===collection.model)?.group??"settings",documents:collection.documents.length,missing:collection.documents.length-present,changed:different,added:newer});
 }
 const dependencyIssues=await references(a,data,session,inspectOnly);
 for(const issue of dependencyIssues)blockers.push(`${issue.label} : ${issue.missing} référence(s) ${issue.unavailable?"indisponible(s)":"manquante(s)"}.`);

 const grouped=new Map<string,{label:string;documents:number;missing:number;changed:number;added:number}>();
 for(const item of modules){const previous=grouped.get(item.label);if(previous){previous.documents+=item.documents;previous.missing+=item.missing;previous.changed+=item.changed;previous.added+=item.added;}else grouped.set(item.label,{...item});}
 return {missing,existing,changed,added,dependencyIssues,blockers,canRestore:missing>0&&!blockers.length,collections:modules.length,details:[...grouped.values()]};
}
/** Keep live records, then prune missing records whose required links cannot be recovered.
 * Repeat to a fixed point so a rejected parent also excludes its missing children. */
async function recovery(a:BackupActor,data:Snapshot,session?:ClientSession,approved?:Set<string>){
 const collections:Snapshot["collections"]=[];
 let existing=0;
 for(const collection of data.collections){
  const model=mongoose.models[collection.model]!;
  const live=await model.collection.find({tenantId:a.tenantId},{session,projection:{_id:1}}).toArray();
  const ids=new Set(live.map(d=>String(d._id)));
  existing+=collection.documents.filter(d=>ids.has(String(d._id))).length;
  collections.push({...collection,documents:collection.documents.filter(d=>!ids.has(String(d._id)))});
 }
 let candidate:Snapshot={...data,collections};
 const excluded:Array<{model:string;id:string;reasons:string[]}>=[];
 if(approved){candidate={...candidate,collections:candidate.collections.map(c=>({...c,documents:c.documents.filter(d=>{const included=approved.has(`${c.model}:${String(d._id)}`);if(!included)excluded.push({model:c.model,id:String(d._id),reasons:["Fiche non retenue lors de votre confirmation."]});return included;})}))};}
 const lookupCache=new Map<string,number>();
 while(true){
  const rejected=new Set<string>();
  for(const collection of candidate.collections){
   for(const document of collection.documents){
    const single={...candidate,collections:[{...collection,documents:[document]}]};
    const issues=await references(a,single,session,true,candidate,lookupCache);
    const reasons=issues.map(i=>`${i.label} : ${i.missing} lien(s) absent(s).`);
    if(reasons.length){rejected.add(`${collection.model}:${String(document._id)}`);excluded.push({model:collection.model,id:String(document._id),reasons});}
   }
  }
  if(!rejected.size)break;
  candidate={...candidate,collections:candidate.collections.map(c=>({...c,documents:c.documents.filter(d=>!rejected.has(`${c.model}:${String(d._id)}`))}))};
 }
 return {data:candidate,excluded,existing};
}
function scopeSnapshot(data:Snapshot,selected:string[]):Snapshot{
 const descriptors=modelsFor(selected),names=new Set(descriptors.map(d=>d.model.modelName));
 const collections=data.collections.filter(c=>names.has(c.model));
 if(collections.length!==names.size)fail("La copie ne contient pas toutes les dépendances de cette sélection.",422);
 return {...data,modules:[...new Set(descriptors.map(d=>d.group))],collections};
}
export async function preview(a:BackupActor,id:string,requested?:string[]){
 guard(a);const row=await archive(a,id),data=await load(a,row),summary=await plan(a,data,undefined,true);
 const candidates=[];
 for(const key of data.modules){
  const scoped=scopeSnapshot(data,[key]),safe=await recovery(a,scoped),check=await plan(a,safe.data,undefined,true);
  const own=check.details.find(d=>d.label===key);
  candidates.push({key,excluded:safe.excluded.length,missing:own?.missing??0,eligible:check.canRestore&&(own?.missing??0)>0,dependencies:scoped.modules.filter(k=>k!==key),details:check.details,blockers:[...check.blockers,...new Set(safe.excluded.flatMap(d=>d.reasons))],dependencyIssues:(await plan(a,scoped,undefined,true)).dependencyIssues,changed:check.changed,added:check.added});
 }
 const eligible=candidates.filter(c=>c.eligible).map(c=>c.key);
 const selected=requested?[...new Set(requested)]:eligible;
 if(selected.some(key=>!eligible.includes(key)))fail("Cette sélection contient un module incompatible. Actualisez le bilan et choisissez uniquement les modules disponibles.",409,"BACKUP_SELECTION_CONFLICT");
 const safeSelection=selected.length?await recovery(a,scopeSnapshot(data,selected)):null;
 const selection=safeSelection?{...await plan(a,safeSelection.data,undefined,true),existing:safeSelection.existing,excluded:safeSelection.excluded.length}:null;
 const canRestore=!!selection?.canRestore;
 await BackupAudit.create({tenantId:a.tenantId,actorId:a.userId,actorName:a.fullName,archiveId:row._id,action:"CHECKED"});
 let token:string|null=null;
 if(canRestore){token=randomBytes(32).toString("hex");await BackupPreview.create({tenantId:a.tenantId,actorId:a.userId,archiveId:row._id,records:safeSelection!.data.collections.flatMap(c=>c.documents.map(d=>`${c.model}:${String(d._id)}`)),modules:selected,tokenHash:digest(token),expiresAt:new Date(Date.now()+10*60000)});}
 return {...summary,canRestore,fileValid:true,token,candidates,selected,selection,modules:row.modules,createdAt:row.snapshotAt,label:row.label,documents:row.documents};
}
export async function restore(a:BackupActor,id:string,token:string,confirmation:string){guard(a);if(confirmation!=="RESTAURER")fail("Confirmez la restauration.");const approval=await BackupPreview.findOneAndDelete({tenantId:a.tenantId,actorId:a.userId,archiveId:id,tokenHash:digest(token),expiresAt:{$gt:new Date()}}).exec();if(!approval)fail("Le contrôle a expiré. Vérifiez de nouveau la sauvegarde.",409);if(!approval.records?.length||!approval.modules?.length)fail("Actualisez le bilan avant de restaurer cette copie.",409);const source=await archive(a,id);
 const selectedModules=approval.modules,approved=new Set(approval.records);
 return run(a,"RESTORE",selectedModules,async operationId=>{await BackupOperation.updateOne({_id:operationId},{$set:{phase:"VERIFYING",sourceId:source._id}});const data=scopeSnapshot(await load(a,source),selectedModules);const initial=await recovery(a,data,undefined,approved);await plan(a,initial.data);const safety=await store(a,await snapshot(a,data.modules),"Copie de sécurité avant restauration","SAFETY");await BackupOperation.updateOne({_id:operationId},{$set:{safetyId:safety._id,phase:"RESTORING"}});
 await BackupLease.updateOne({_id:String(a.tenantId),owner:String(operationId)},{$set:{expiresAt:new Date(Date.now()+10*60000)}});committing.add(String(operationId));
 const db=await mongoose.startSession();try{await db.withTransaction(async()=>{let inserted=0;const safe=await recovery(a,data,db,approved);const baseline=await plan(a,data,db,true);const summary=await plan(a,safe.data,db);for(const collection of safe.data.collections){const model=mongoose.models[collection.model]!;const current=await model.collection.find({tenantId:a.tenantId},{session:db,projection:{_id:1}}).toArray();const ids=new Set(current.map(d=>String(d._id)));const missing=collection.documents.filter(d=>!ids.has(String(d._id)));for(let offset=0;offset<missing.length;offset+=100){const chunk=missing.slice(offset,offset+100);await Promise.all(chunk.map(d=>model.hydrate(d).validate()));await model.collection.insertMany(chunk as any[],{session:db,ordered:true});inserted+=chunk.length;}}await fenced(a,operationId,db);await BackupOperation.updateOne({_id:operationId,tenantId:a.tenantId,status:"RUNNING"},{$set:{status:"COMPLETED",phase:"COMPLETED",message:`Récupération terminée : ${inserted} fiche(s) récupérée(s), ${safe.existing} déjà présente(s), ${safe.excluded.length} laissée(s) de côté.`,inserted,skipped:safe.existing+safe.excluded.length,details:baseline.details.map(d=>({module:d.label,restored:summary.details.find(v=>v.label===d.label)?.missing??0,existing:d.documents-d.missing}))}},{session:db});},{readConcern:{level:"snapshot"},writeConcern:{w:"majority"},maxCommitTimeMS:60000});}finally{committing.delete(String(operationId));await db.endSession();}});
}
export async function importFile(a:BackupActor,file:Buffer,label:string){guard(a);if(!configured())fail("Le chiffrement des sauvegardes doit être configuré.",503);if(file.length>MAX_FILE_BYTES)fail("Le fichier est trop volumineux.",413);let data:Snapshot;try{data=mongoose.mongo.BSON.EJSON.parse(await unseal(file,String(a.tenantId)),{relaxed:false}) as Snapshot;}catch{fail("Ce fichier ne peut pas être ouvert pour votre organisation.",422);}validateSnapshot(a,data!);const row=await store(a,data!,label||"Sauvegarde importée","IMPORT");await BackupAudit.create({tenantId:a.tenantId,actorId:a.userId,actorName:a.fullName,archiveId:row._id,action:"IMPORTED"});return publicArchive(row);}
export async function download(a:BackupActor,id:string){const row=await archive(a,id);const buffer=await bytesFor(row);await BackupAudit.create({tenantId:a.tenantId,actorId:a.userId,actorName:a.fullName,archiveId:row._id,action:"DOWNLOAD_REQUESTED"});return {buffer,name:`sauvegarde-${row.createdAt.toISOString().slice(0,10)}.rhbackup`};}
export async function drainBackupOperations(){await Promise.allSettled([...running]);}

/** Serialized with creation and restoration through the tenant lease. */
export async function remove(a:BackupActor,id:string){
 guard(a);const lockId=new Types.ObjectId();await acquire(a,lockId);
 try{
  const row=await archive(a,id);
  // GridFS removal and registry removal are intentionally retryable: metadata stays
  // visible if the binary cannot be deleted. A missing binary may be retried.
  try{await bucket().delete(row.fileId);}catch(error){
   const exists=await bucket().find({_id:row.fileId}).hasNext();if(exists)throw error;
  }
  await BackupAudit.create({tenantId:a.tenantId,actorId:a.userId,actorName:a.fullName,archiveId:row._id,action:"DELETED"});
  await BackupArchive.deleteOne({_id:row._id,tenantId:a.tenantId});
  await BackupPreview.deleteMany({tenantId:a.tenantId,archiveId:row._id});
  return {deleted:true};
 }finally{await release(a,lockId);}
}
