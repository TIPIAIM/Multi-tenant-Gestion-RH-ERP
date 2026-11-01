import {getPublishedModuleSettings} from "../settings/settings.module-runtime.js";
import {createTrainingNotice} from "./training-notifications.js";
import mongoose,{Types,type ClientSession,type HydratedDocument} from "mongoose";
import {AppError} from "../../core/errors/app-error.js";
import {AgentModel} from "../agents/agent.model.js";
import {TrainingCourseModel as Courses,TrainingSessionModel as Sessions,TrainingEnrollmentModel as Enrollments,TrainingAuditModel as Audits,TrainingAgentLockModel as AgentLocks,type TrainingSession,type TrainingEnrollment} from "./training.model.js";
import {canManageTraining,requireTrainingManager,trainingAgentScope,canReadEnrollment,sameId,type TrainingActor} from "./training.access.js";
import {canTransition,escapeSearch,sessionStatuses,enrollmentStatuses} from "./training.rules.js";
import type {CourseInput,SessionInput,TransitionInput,ListInput,ReviewInput} from "./training.schema.js";
import {TrainingNeedModel as Needs} from "./training.need.js";
import {EvaluationModel} from "../evaluations/evaluation.model.js";
import type {NeedInput,ExternalResultInput,OfferInput} from "./training.schema.js";

const fail=(message:string,code="TRAINING_INVALID",status=400):never=>{throw new AppError(message,status,code);};
const pageResult=<T>(items:T[],total:number,q:ListInput)=>({items,pagination:{page:q.page,limit:q.limit,total,totalPages:Math.max(1,Math.ceil(total/q.limit))}});
function sessionView(a:TrainingActor,row:HydratedDocument<TrainingSession>){const data=row.toObject();return {...data,id:row.id,...(!canManageTraining(a)?{totalCost:undefined,currency:undefined}:{})};}
function enrollmentView(row:HydratedDocument<TrainingEnrollment>){return {...row.toObject(),id:row.id};}
async function audit(a:TrainingActor,action:string,details:Record<string,unknown>,sessionId?:Types.ObjectId,enrollmentId?:Types.ObjectId,db?:ClientSession){await Audits.create([{tenantId:a.tenantId,actorId:a.userId,actorName:a.fullName,action,details,sessionId,enrollmentId}],{session:db});await createTrainingNotice(a,action,details,sessionId,db);}
async function sessionOrThrow(a:TrainingActor,id:string,db?:ClientSession){const row=await Sessions.findOne({_id:id,tenantId:a.tenantId}).session(db??null).exec();if(!row)fail("Session introuvable.","TRAINING_SESSION_NOT_FOUND",404);return row!;}
async function enrollmentOrThrow(a:TrainingActor,id:string,db?:ClientSession){const row=await Enrollments.findOne({_id:id,tenantId:a.tenantId}).session(db??null).exec();if(!row)fail("Inscription introuvable.","TRAINING_ENROLLMENT_NOT_FOUND",404);if(!canReadEnrollment(a,row!))fail("Cette inscription ne relève pas de votre périmètre.","TRAINING_SCOPE_FORBIDDEN",403);return row!;}
async function sessionTransaction<T>(a:TrainingActor,id:string,work:(row:HydratedDocument<TrainingSession>,db:ClientSession)=>Promise<T>,agentId?:Types.ObjectId):Promise<T>{
 const key=`${a.tenantId}:${agentId}`;
 if(agentId){try{await AgentLocks.updateOne({_id:key},{$setOnInsert:{revision:0}},{upsert:true}).exec();}catch(e){if((e as {code?:number}).code!==11000)throw e;}}
 const db=await mongoose.startSession();let result:T|undefined;
 try{await db.withTransaction(async()=>{
  if(agentId)await AgentLocks.updateOne({_id:key},{$inc:{revision:1}},{session:db}).exec();
  const row=await Sessions.findOneAndUpdate({_id:id,tenantId:a.tenantId},{$inc:{revision:1}},{new:true,session:db}).exec();
  if(!row)fail("Session introuvable.","TRAINING_SESSION_NOT_FOUND",404);
  result=await work(row!,db);
 });return result as T;}finally{await db.endSession();}
}
export async function listCourses(a:TrainingActor,q:ListInput){const filter={tenantId:a.tenantId,...(!canManageTraining(a)?{active:true}:q.active?{active:q.active==="true"}:{}),...(q.search?{$or:[{title:new RegExp(escapeSearch(q.search),"i")},{code:new RegExp(escapeSearch(q.search),"i")},{category:new RegExp(escapeSearch(q.search),"i")}]}:{})};const [rows,total]=await Promise.all([Courses.find(filter).sort({createdAt:-1,_id:-1}).skip((q.page-1)*q.limit).limit(q.limit).exec(),Courses.countDocuments(filter).exec()]);return pageResult(rows.map(r=>({...r.toObject(),id:r.id})),total,q);}
export async function saveCourse(a:TrainingActor,input:CourseInput,id?:string){requireTrainingManager(a);const row=id?await Courses.findOneAndUpdate({_id:id,tenantId:a.tenantId},{$set:input},{new:true,runValidators:true}).exec():await Courses.create({...input,tenantId:a.tenantId,createdByUserId:a.userId});if(!row)fail("Formation introuvable.","TRAINING_COURSE_NOT_FOUND",404);await audit(a,id?"COURSE_UPDATED":"COURSE_CREATED",{courseId:row!.id,code:input.code});return {...row!.toObject(),id:row!.id};}
export async function listSessions(a:TrainingActor,q:ListInput){const visible=canManageTraining(a)?null:await Enrollments.find({tenantId:a.tenantId,...trainingAgentScope(a)}).select("sessionId").lean().exec();if(q.status&&!sessionStatuses.includes(q.status as typeof sessionStatuses[number]))fail("Statut de session invalide.");const filter={tenantId:a.tenantId,...(visible?{$or:[{status:"OPEN"},{_id:{$in:visible.map(e=>e.sessionId)}}]}:{}),...(canManageTraining(a)?{}:{status:{$ne:"DRAFT"}}),...(q.status?{status:q.status,...(q.status==="OPEN"?{startsAt:{$gt:new Date()}}:{})}:{}),...(!canManageTraining(a)&&q.status==="DRAFT"?{_id:{$exists:false}}:{}),...(q.search?{title:new RegExp(escapeSearch(q.search),"i")}:{})};const [rows,total]=await Promise.all([Sessions.find(filter).sort({createdAt:-1,_id:-1}).skip((q.page-1)*q.limit).limit(q.limit).exec(),Sessions.countDocuments(filter).exec()]);const mine=a.agentId?await Enrollments.find({tenantId:a.tenantId,agentId:a.agentId,sessionId:{$in:rows.map(r=>r._id)}}).select("sessionId status").lean().exec():[];const mineBySession=new Map(mine.map(e=>[e.sessionId.toString(),e.status]));return pageResult(rows.map(r=>({...sessionView(a,r),myEnrollmentStatus:mineBySession.get(r.id)})),total,q);}
export async function saveSession(a:TrainingActor,input:SessionInput,id?:string){requireTrainingManager(a);const course=await Courses.findOne({_id:input.courseId,tenantId:a.tenantId,active:true}).exec();if(!course)fail("Sélectionnez une formation active.");const values={...input,courseId:new Types.ObjectId(input.courseId),title:course!.title,provider:course!.provider,format:course!.format,startsAt:new Date(input.startsAt),endsAt:new Date(input.endsAt)};
 if(!id){const row=await Sessions.create({...values,tenantId:a.tenantId,createdByUserId:a.userId,status:"DRAFT"});await audit(a,"SESSION_CREATED",{title:row.title},row._id);return sessionView(a,row);}
 return sessionTransaction(a,id,async(row,db)=>{if(row.status!=="DRAFT")fail("Une session publiée ne peut plus être modifiée. Annulez-la puis planifiez une nouvelle session si nécessaire.");Object.assign(row,values);await row.save({session:db});await audit(a,"SESSION_UPDATED",{},row._id,undefined,db);return sessionView(a,row);});
}
export async function transitionSession(a:TrainingActor,id:string,input:TransitionInput){requireTrainingManager(a);const policy=(await getPublishedModuleSettings(a.tenantId)).training;return sessionTransaction(a,id,async(row,db)=>{
 if(!canTransition(row.status,input.status))fail("Cette transition de session est interdite.","TRAINING_STATUS_CONFLICT",409);
 if(input.status==="OPEN"&&row.startsAt.getTime()<=Date.now())fail("La publication nécessite une date de début future.");
 if(input.status==="IN_PROGRESS"&&row.startsAt.getTime()>Date.now())fail("La formation n’a pas encore commencé.");
 if(input.status==="COMPLETED"&&row.endsAt.getTime()>Date.now())fail("Attendez la fin de la session avant de la clôturer.");
 if(input.status==="CANCELLED"&&input.reason.trim().length<3)fail("Un motif d’annulation est requis.");
 if(input.status==="COMPLETED"){
  const participants=await Enrollments.find({tenantId:a.tenantId,sessionId:row._id,status:"CONFIRMED"}).session(db).exec();
  for(const e of participants){
   if(e.status!=="CONFIRMED"||!e.externalOutcome)fail(`Renseignez le bilan de l’organisme pour ${e.agentName} avant clôture.`);
   e.status="COMPLETED";await e.save({session:db});
   await Needs.updateOne({_id:e.needId,tenantId:a.tenantId},{$set:{status:e.externalOutcome==="NOT_ATTENDED"?"APPROVED":"COMPLETED",impactDueDate:new Date(row.endsAt.getTime()+policy.impactReviewDelayDays*86400000)}},{session:db});
  }
  const unconfirmed=await Enrollments.find({tenantId:a.tenantId,sessionId:row._id,status:"APPROVED"}).select("needId").session(db).exec();
  await Needs.updateMany({tenantId:a.tenantId,_id:{$in:unconfirmed.map(e=>e.needId)},status:"PLANNED"},{$set:{status:"APPROVED"}},{session:db});
  row.closedAt=new Date();row.closedByName=a.fullName;
  await Enrollments.updateMany({tenantId:a.tenantId,sessionId:row._id,status:{$in:["REQUESTED","APPROVED","CONFIRMED"]}},{$set:{status:"CANCELLED",reviewComment:"Session clôturée sans confirmation de l’organisme."}},{session:db}).exec();
 }
 if(input.status==="CANCELLED"){const linked=await Enrollments.find({tenantId:a.tenantId,sessionId:row._id,status:{$in:["APPROVED","CONFIRMED"]}}).select("needId").session(db).exec();await Needs.updateMany({tenantId:a.tenantId,_id:{$in:linked.map(e=>e.needId)},status:"PLANNED"},{$set:{status:"APPROVED"}},{session:db});}
 if(input.status==="CANCELLED")await Enrollments.updateMany({tenantId:a.tenantId,sessionId:row._id,status:{$in:["REQUESTED","APPROVED","CONFIRMED"]}},{$set:{status:"CANCELLED",reviewComment:input.reason}},{session:db}).exec();
 row.status=input.status;await row.save({session:db});await audit(a,"SESSION_STATUS",{status:input.status,reason:input.reason,title:row.title},row._id,undefined,db);return sessionView(a,row);
 });}
export async function sessionDetails(a:TrainingActor,id:string){const row=await sessionOrThrow(a,id);if(!canManageTraining(a)&&row.status!=="OPEN"){const allowed=await Enrollments.exists({tenantId:a.tenantId,sessionId:row._id,...trainingAgentScope(a)});if(!allowed)fail("Ce programme ne relève pas de votre périmètre.","TRAINING_SCOPE_FORBIDDEN",403);}if(row.status==="DRAFT"&&!canManageTraining(a))fail("Session introuvable.","TRAINING_SESSION_NOT_FOUND",404);const [approved,pending,course]=await Promise.all([Enrollments.countDocuments({tenantId:a.tenantId,sessionId:row._id,status:{$in:["APPROVED","CONFIRMED","COMPLETED"]}}),canManageTraining(a)?Enrollments.countDocuments({tenantId:a.tenantId,sessionId:row._id,status:"REQUESTED"}):Promise.resolve(0),Courses.findOne({_id:row.courseId,tenantId:a.tenantId}).select("objectives category").lean().exec()]);const mine=a.agentId?await Enrollments.findOne({tenantId:a.tenantId,sessionId:row._id,agentId:a.agentId}).select("status").lean().exec():null;return {...sessionView(a,row),myEnrollmentStatus:mine?.status,approvedCount:approved,pendingCount:pending,remainingSeats:Math.max(0,row.capacity-approved),objectives:course?.objectives??"",category:course?.category??""};}
export async function agentOptions(a:TrainingActor,q:ListInput){const scope=trainingAgentScope(a);const {agentId,...rest}=scope;const filter={tenantId:a.tenantId,employmentStatus:"ACTIVE",...rest,...(agentId?{_id:agentId}:{}),...(q.search?{$or:[{firstName:new RegExp(escapeSearch(q.search),"i")},{lastName:new RegExp(escapeSearch(q.search),"i")},{matricule:new RegExp(escapeSearch(q.search),"i")}]}:{})};const [rows,total]=await Promise.all([AgentModel.find(filter).select("firstName lastName matricule").sort({lastName:1,_id:1}).skip((q.page-1)*q.limit).limit(q.limit).lean().exec(),AgentModel.countDocuments(filter).exec()]);return pageResult(rows.map(r=>({id:r._id.toString(),fullName:`${r.firstName} ${r.lastName}`,matricule:r.matricule})),total,q);}
export async function requestEnrollment(a:TrainingActor,sessionId:string,needId?:string,motivation=""){
 // Sans besoin sélectionné par les RH, la demande concerne exclusivement l’agent connecté.
 if(needId&&!canManageTraining(a))fail("Seuls les RH peuvent rattacher un besoin sélectionné.","TRAINING_SCOPE_FORBIDDEN",403);
 const selectedNeed=needId?await Needs.findOne({_id:needId,tenantId:a.tenantId,status:"APPROVED"}).exec():null;
 if(needId&&!selectedNeed)fail("Ce besoin n’est pas disponible.");
 const agentId=selectedNeed?.agentId??a.agentId;
 if(!agentId)fail("Votre compte doit être lié à un agent pour demander une formation.","TRAINING_AGENT_REQUIRED",403);
 const agent=await AgentModel.findOne({_id:agentId,tenantId:a.tenantId,employmentStatus:"ACTIVE"}).lean().exec();
 if(!agent||!agent.directionId)fail("Agent actif introuvable.");
 if(!canReadEnrollment(a,{agentId:agent!._id,directionId:agent!.directionId,serviceId:agent!.serviceId??null}))fail("Agent hors périmètre.","TRAINING_SCOPE_FORBIDDEN",403);
 return sessionTransaction(a,sessionId,async(row,db)=>{
  if(row.status!=="OPEN"||row.startsAt.getTime()<=Date.now())fail("Les inscriptions sont fermées.");
  let e=await Enrollments.findOne({tenantId:a.tenantId,sessionId:row._id,agentId:agent!._id}).session(db).exec();
  if(e&&!["REJECTED","CANCELLED"].includes(e.status))fail("Votre demande pour cette formation existe déjà.","TRAINING_DUPLICATE_ENROLLMENT",409);
  let need=selectedNeed?await Needs.findOne({_id:selectedNeed._id,tenantId:a.tenantId,status:"APPROVED"}).session(db).exec():e?await Needs.findOne({_id:e.needId,tenantId:a.tenantId,status:{$in:["IDENTIFIED","APPROVED"]}}).session(db).exec():null;
  if(selectedNeed&&!need)fail("Ce besoin est déjà planifié.");
  if(!need){const [created]=await Needs.create([{tenantId:a.tenantId,agentId:agent!._id,agentName:`${agent!.firstName} ${agent!.lastName}`,matricule:agent!.matricule,directionId:agent!.directionId,serviceId:agent!.serviceId??null,competency:row.title,justification:motivation.trim()||`Demande de participation à la formation « ${row.title} ».`,priority:"NORMAL",sourceKind:"AGENT_REQUEST",sourceReference:"Demande de l’agent sur une formation proposée",targetDate:row.startsAt.toISOString().slice(0,10),createdByUserId:a.userId,status:"IDENTIFIED"}],{session:db});if(!created)fail("Impossible d’enregistrer la demande.");need=created!;}
  if(!selectedNeed&&need.sourceKind==="AGENT_REQUEST"){need.justification=motivation.trim()||`Demande de participation à la formation « ${row.title} ».`;await need.save({session:db});}
  const direct=canManageTraining(a)&&sameId(a.agentId,agent!._id);
  if(direct){
   const seats=await Enrollments.countDocuments({tenantId:a.tenantId,sessionId:row._id,status:{$in:["APPROVED","CONFIRMED"]}}).session(db).exec();
   if(seats>=row.capacity)fail("La capacité de cette session est atteinte.","TRAINING_CAPACITY_REACHED",409);
   const other=await Enrollments.find({tenantId:a.tenantId,agentId:agent!._id,status:{$in:["APPROVED","CONFIRMED"]}}).select("sessionId").session(db).lean().exec();
   const clash=await Sessions.exists({tenantId:a.tenantId,_id:{$in:other.map(r=>r.sessionId)},status:{$in:["OPEN","IN_PROGRESS"]},startsAt:{$lt:row.endsAt},endsAt:{$gt:row.startsAt}}).session(db);
   if(clash)fail("Vous êtes déjà inscrit à une autre formation sur cette plage horaire.","TRAINING_SCHEDULE_OVERLAP",409);
   const updated=await Needs.updateOne({_id:need._id,tenantId:a.tenantId,status:{$in:["IDENTIFIED","APPROVED"]}},{$set:{status:"PLANNED"}},{session:db}).exec();
   if(updated.modifiedCount!==1)fail("Ce besoin est déjà planifié.","TRAINING_NEED_ALREADY_PLANNED",409);
  }
  if(e){e.status="REQUESTED";e.reviewComment="";e.bookingReference=undefined;e.externalOutcome=undefined;e.externalResultNotes=undefined;e.externalCertificateUrl=undefined;e.externalCertificateReference=undefined;e.requestedByUserId=a.userId;e.reviewedAt=undefined;e.reviewedByUserId=undefined;e.needId=need._id;}
  else e=new Enrollments({tenantId:a.tenantId,sessionId:row._id,agentId:agent!._id,agentName:`${agent!.firstName} ${agent!.lastName}`,matricule:agent!.matricule,directionId:agent!.directionId,serviceId:agent!.serviceId??null,needId:need._id,requestedByUserId:a.userId});
  if(direct){e.status="APPROVED";e.reviewedByUserId=a.userId;e.reviewedAt=new Date();e.reviewComment="Inscription directe RH / administrateur.";}
  await e.save({session:db});await audit(a,direct?"ENROLLMENT_DIRECT":"ENROLLMENT_REQUESTED",{title:row.title,agentName:e.agentName},row._id,e._id,db);return enrollmentView(e);
 },agent!._id);
}
export async function listEnrollments(a:TrainingActor,q:ListInput){if(q.status&&![...enrollmentStatuses,"VALIDATED","FOLLOWED"].includes(q.status as typeof enrollmentStatuses[number]))fail("Statut d’inscription invalide.");const scope=q.mine==="true"?(a.agentId?{agentId:a.agentId}:{agentId:null}):trainingAgentScope(a);const filter={tenantId:a.tenantId,...scope,...(q.sessionId?{sessionId:new Types.ObjectId(q.sessionId)}:{}),...(q.status==="VALIDATED"?{status:{$in:["APPROVED","CONFIRMED"]}}:q.status==="FOLLOWED"?{status:"COMPLETED",externalOutcome:{$in:["ATTENDED","PARTIAL"]}}:q.status?{status:q.status}:{}),...(q.search?{agentName:new RegExp(escapeSearch(q.search),"i")}:{})};const [rows,total]=await Promise.all([Enrollments.find(filter).sort({createdAt:-1,_id:-1}).skip((q.page-1)*q.limit).limit(q.limit).exec(),Enrollments.countDocuments(filter).exec()]);const ids=rows.map(e=>e.sessionId);const sessions=await Sessions.find({tenantId:a.tenantId,_id:{$in:ids}}).select("title startsAt endsAt status").lean().exec();const byId=new Map(sessions.map(r=>[r._id.toString(),r]));return pageResult(rows.map(r=>({...enrollmentView(r),session:byId.get(r.sessionId.toString())})),total,q);}
export async function reviewEnrollment(a:TrainingActor,id:string,input:ReviewInput){requireTrainingManager(a);const target=await enrollmentOrThrow(a,id);
 return sessionTransaction(a,target.sessionId.toString(),async(row,db)=>{const e=await enrollmentOrThrow(a,id,db);if(e.status!=="REQUESTED"||row.status!=="OPEN"||row.startsAt.getTime()<=Date.now())fail("Cette demande ne peut plus être examinée.","TRAINING_STATUS_CONFLICT",409);
 if(input.decision==="APPROVED"){
  const seats=await Enrollments.countDocuments({tenantId:a.tenantId,sessionId:row._id,status:{$in:["APPROVED","CONFIRMED"]}}).session(db).exec();if(seats>=row.capacity)fail("La capacité de cette session est atteinte.","TRAINING_CAPACITY_REACHED",409);
  const other=await Enrollments.find({tenantId:a.tenantId,agentId:e.agentId,_id:{$ne:e._id},status:{$in:["APPROVED","CONFIRMED"]}}).select("sessionId").session(db).lean().exec();
  const clash=await Sessions.exists({tenantId:a.tenantId,_id:{$in:other.map(r=>r.sessionId)},status:{$in:["OPEN","IN_PROGRESS"]},startsAt:{$lt:row.endsAt},endsAt:{$gt:row.startsAt}}).session(db);if(clash)fail("L’agent est déjà inscrit à une autre formation sur cette plage horaire.","TRAINING_SCHEDULE_OVERLAP",409);
 }
 if(input.decision==="APPROVED"){
  const updated=await Needs.updateOne({_id:e.needId,tenantId:a.tenantId,status:{$in:["IDENTIFIED","APPROVED"]}},{$set:{status:"PLANNED"}},{session:db}).exec();
  if(updated.modifiedCount!==1)fail("Ce besoin est déjà planifié ou n’est plus validé.","TRAINING_NEED_ALREADY_PLANNED",409);
 }
 e.status=input.decision;e.reviewComment=input.comment;e.reviewedByUserId=a.userId;e.reviewedAt=new Date();await e.save({session:db});await audit(a,"ENROLLMENT_REVIEWED",{...input,agentId:e.agentId,title:row.title},row._id,e._id,db);return enrollmentView(e);
 },target.agentId);
}
export async function cancelEnrollment(a:TrainingActor,id:string){const target=await enrollmentOrThrow(a,id);if(!canManageTraining(a)&&!sameId(a.agentId,target.agentId))fail("Seul l’agent concerné ou les RH peuvent annuler l’inscription.","TRAINING_CANCEL_FORBIDDEN",403);return sessionTransaction(a,target.sessionId.toString(),async(row,db)=>{const e=await enrollmentOrThrow(a,id,db);if(!canManageTraining(a)&&e.status!=="REQUESTED")fail("Contactez les RH pour annuler une inscription déjà acceptée.","TRAINING_CANCEL_FORBIDDEN",403);const wasPlanned=["APPROVED","CONFIRMED"].includes(e.status);if(!["REQUESTED","APPROVED","CONFIRMED"].includes(e.status)||row.status!=="OPEN"||row.startsAt.getTime()<=Date.now())fail("Cette inscription ne peut plus être annulée.");e.status="CANCELLED";await e.save({session:db});if(wasPlanned)await Needs.updateOne({_id:e.needId,tenantId:a.tenantId,status:"PLANNED"},{$set:{status:"APPROVED"}},{session:db});await audit(a,"ENROLLMENT_CANCELLED",{},row._id,e._id,db);return enrollmentView(e);},target.agentId);}
export async function feedback(a:TrainingActor,id:string,input:{satisfaction:number;feedback:string}){const e=await enrollmentOrThrow(a,id);if(!sameId(a.agentId,e.agentId)||e.status!=="COMPLETED")fail("Le retour d’expérience est réservé au participant après clôture.","TRAINING_FEEDBACK_FORBIDDEN",403);e.satisfaction=input.satisfaction;e.feedback=input.feedback;e.feedbackAt=new Date();await e.save();await audit(a,"FEEDBACK_UPDATED",{satisfaction:input.satisfaction},e.sessionId,e._id);return enrollmentView(e);}
export async function dashboard(a:TrainingActor){const scope=trainingAgentScope(a);const [catalogue,openSessions,approved,completed,requested,spending]=await Promise.all([Courses.countDocuments({tenantId:a.tenantId,active:true}),Sessions.countDocuments({tenantId:a.tenantId,status:"OPEN",startsAt:{$gt:new Date()}}),Enrollments.countDocuments({tenantId:a.tenantId,...scope,status:{$in:["APPROVED","CONFIRMED"]}}),Enrollments.countDocuments({tenantId:a.tenantId,...scope,status:"COMPLETED",externalOutcome:{$in:["ATTENDED","PARTIAL"]}}),Enrollments.countDocuments({tenantId:a.tenantId,...scope,status:"REQUESTED"}),canManageTraining(a)?Sessions.aggregate< {_id:string;total:number} >([{$match:{tenantId:a.tenantId,status:{$in:["OPEN","IN_PROGRESS","COMPLETED"]}}},{$group:{_id:"$currency",total:{$sum:"$totalCost"}}}]):Promise.resolve([])]);return {catalogue,openSessions,approved,completed,requested,spending,ownAgentId:a.agentId?.toString()??null};}
export async function sessionAudit(a:TrainingActor,id:string){requireTrainingManager(a);await sessionOrThrow(a,id);return Audits.find({tenantId:a.tenantId,sessionId:new Types.ObjectId(id)}).sort({createdAt:-1,_id:-1}).limit(100).lean().exec();}

export async function listNeeds(a:TrainingActor,q:ListInput){
 const scope=trainingAgentScope(a);const filter={tenantId:a.tenantId,...(q.needId?{_id:new Types.ObjectId(q.needId)}:{}),...scope,...(q.status?{status:q.status}:{}),...(q.search?{$or:[{agentName:new RegExp(escapeSearch(q.search),"i")},{competency:new RegExp(escapeSearch(q.search),"i")}]}:{})};
 const [rows,total]=await Promise.all([Needs.find(filter).sort({createdAt:-1,_id:-1}).skip((q.page-1)*q.limit).limit(q.limit).exec(),Needs.countDocuments(filter)]);
 return pageResult(rows.map(r=>({...r.toObject(),id:r.id})),total,q);
}
export async function createNeed(a:TrainingActor,input:NeedInput){

 const targetId=input.agentId??a.agentId?.toString();if(!targetId)fail("Sélectionnez un agent ou rattachez votre compte à un agent.");
 const agent=await AgentModel.findOne({_id:targetId,tenantId:a.tenantId,employmentStatus:"ACTIVE"}).exec();
 if(!agent||!canReadEnrollment(a,{agentId:agent._id,directionId:agent.directionId,serviceId:agent.serviceId??null}))fail("Agent hors périmètre.","TRAINING_SCOPE_FORBIDDEN",403);
 if(input.sourceKind==="EVALUATION"){
  if(!input.evaluationId)fail("Une évaluation validée de l’agent est requise.");
  const evaluation=await EvaluationModel.exists({_id:input.evaluationId,tenantId:a.tenantId,agentId:agent!._id,status:"HR_VALIDATED"});
  if(!evaluation)fail("Cette évaluation n’est pas validée ou ne concerne pas cet agent.");
 }
 const db=await mongoose.startSession();try{let result;await db.withTransaction(async()=>{
 const [row]=await Needs.create([{...input,evaluationId:input.sourceKind==="EVALUATION"?input.evaluationId:undefined,tenantId:a.tenantId,agentId:agent!._id,agentName:`${agent!.firstName} ${agent!.lastName}`,matricule:agent!.matricule,directionId:agent!.directionId,serviceId:agent!.serviceId??null,createdByUserId:a.userId}],{session:db});
 if(!row)fail("Impossible d’enregistrer le besoin.");
 await audit(a,"NEED_IDENTIFIED",{needId:row!.id,competency:row!.competency},undefined,undefined,db);result={...row!.toObject(),id:row!.id};});return result!;}finally{await db.endSession();}
}
export async function reviewNeed(a:TrainingActor,id:string,input:ReviewInput){requireTrainingManager(a);const row=await Needs.findOneAndUpdate({_id:id,tenantId:a.tenantId,status:"IDENTIFIED"},{$set:{status:input.decision==="APPROVED"?"APPROVED":"CANCELLED",reviewComment:input.comment}},{new:true}).exec();if(!row)fail("Ce besoin est introuvable ou déjà examiné.","TRAINING_NEED_STATUS_CONFLICT",409);await audit(a,"NEED_REVIEWED",{needId:id,decision:input.decision});return {...row!.toObject(),id:row!.id};}
export async function evaluationOptions(a:TrainingActor,agentId:string){
 if(a.role==="AGENT")fail("Accès réservé aux responsables.","TRAINING_SOURCE_FORBIDDEN",403);
 const agent=await AgentModel.findOne({_id:agentId,tenantId:a.tenantId}).exec();if(!agent||!canReadEnrollment(a,{agentId:agent._id,directionId:agent.directionId,serviceId:agent.serviceId??null}))fail("Agent hors périmètre.","TRAINING_SCOPE_FORBIDDEN",403);
 const rows=await EvaluationModel.find({tenantId:a.tenantId,agentId:agent!._id,status:"HR_VALIDATED"}).select("evaluationYear finalScore managerReview.trainingNeeds selfReview.trainingNeeds").sort({evaluationYear:-1,_id:-1}).limit(50).lean().exec();
 return rows.map(r=>({id:r._id.toString(),year:r.evaluationYear,score:r.finalScore,trainingNeeds:r.managerReview?.trainingNeeds||r.selfReview?.trainingNeeds||""}));
}
export async function confirmExternalEnrollment(a:TrainingActor,id:string,bookingReference:string){requireTrainingManager(a);const target=await enrollmentOrThrow(a,id);return sessionTransaction(a,target.sessionId.toString(),async(row,db)=>{const e=await enrollmentOrThrow(a,id,db);if(e.status!=="APPROVED"||!["OPEN","IN_PROGRESS"].includes(row.status))fail("La validation administrative doit précéder la confirmation par l’organisme.");e.status="CONFIRMED";e.bookingReference=bookingReference;await e.save({session:db});await audit(a,"EXTERNAL_BOOKING_CONFIRMED",{bookingReference},row._id,e._id,db);return enrollmentView(e);},target.agentId);}
export async function externalResult(a:TrainingActor,id:string,input:ExternalResultInput){requireTrainingManager(a);const target=await enrollmentOrThrow(a,id);return sessionTransaction(a,target.sessionId.toString(),async(row,db)=>{const e=await enrollmentOrThrow(a,id,db);if(e.status!=="CONFIRMED"||row.status!=="IN_PROGRESS"||row.endsAt.getTime()>Date.now())fail("Le bilan est enregistré après la fin de la formation externe, avant clôture.");e.externalOutcome=input.outcome;e.externalResultNotes=input.notes;e.externalCertificateUrl=input.certificateUrl;e.externalCertificateReference=input.certificateReference;await e.save({session:db});await audit(a,"EXTERNAL_RESULT_RECORDED",{outcome:input.outcome,reference:input.certificateReference},row._id,e._id,db);return enrollmentView(e);});}
export async function evaluateImpact(a:TrainingActor,id:string,input:{impact:string;comment:string}){if(a.role==="AGENT")fail("Le bilan d’impact appartient au responsable ou aux RH.","TRAINING_IMPACT_FORBIDDEN",403);const row=await Needs.findOne({_id:id,tenantId:a.tenantId,status:"COMPLETED"}).exec();if(!row||!canReadEnrollment(a,row))fail("Besoin terminé hors périmètre ou introuvable.","TRAINING_SCOPE_FORBIDDEN",403);row!.impact=input.impact;row!.impactComment=input.comment;row!.impactReviewedAt=new Date();row!.impactReviewedBy=a.fullName;await row!.save();await audit(a,"IMPACT_REVIEWED",{needId:id,impact:input.impact});return {...row!.toObject(),id:row!.id};}

export async function publishTrainingOffer(a:TrainingActor,input:OfferInput){
 requireTrainingManager(a);if(Date.parse(input.startsAt)<=Date.now())fail("Choisissez une date de début future.");
 const db=await mongoose.startSession();let result:ReturnType<typeof sessionView>|undefined;
 try{await db.withTransaction(async()=>{
  const [course]=await Courses.create([{tenantId:a.tenantId,createdByUserId:a.userId,code:`FOR-${new Types.ObjectId().toString().toUpperCase()}`,title:input.title,provider:input.provider,category:input.category,objectives:input.objectives,format:input.format,durationHours:input.durationHours,active:true}],{session:db});
  if(!course)fail("Impossible de créer la formation.");
  const [row]=await Sessions.create([{...input,tenantId:a.tenantId,courseId:course!._id,startsAt:new Date(input.startsAt),endsAt:new Date(input.endsAt),status:"OPEN",createdByUserId:a.userId}],{session:db});
  if(!row)fail("Impossible de publier la formation.");
  await audit(a,"OFFER_PUBLISHED",{title:input.title,provider:input.provider},row!._id,undefined,db);result=sessionView(a,row!);
 });return result!;}finally{await db.endSession();}
}
