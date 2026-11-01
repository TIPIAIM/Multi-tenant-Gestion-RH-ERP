import {api} from "../../lib/api";
import type {Course,CourseInput,TrainingSession,SessionInput,Enrollment,Page,TrainingDashboard,AgentOption,TrainingAudit,SessionStatus,TrainingNeed,NeedInput,EvaluationOption} from "./training.types";
type Success<T>={success:boolean;data:T};
export type Query={page?:number;limit?:number;search?:string;status?:string;sessionId?:string;mine?:"true"|"false";active?:"true"|"false"};
async function get<T>(path:string,params?:Query,signal?:AbortSignal){return (await api.get<Success<T>>(`/trainings${path}`,{params,signal})).data.data;}
async function write<T>(method:"post"|"put",path:string,data:unknown){return (await api[method]<Success<T>>(`/trainings${path}`,data)).data.data;}
export const getTrainingDashboard=(signal?:AbortSignal)=>get<TrainingDashboard>("/dashboard",undefined,signal);
export const getCourses=(q:Query,signal?:AbortSignal)=>get<Page<Course>>("/courses",q,signal);
export const saveCourse=(data:CourseInput,id?:string)=>write<Course>(id?"put":"post",id?`/courses/${id}`:"/courses",data);
export const getSessions=(q:Query,signal?:AbortSignal)=>get<Page<TrainingSession>>("/sessions",q,signal);
export const getSession=(id:string,signal?:AbortSignal)=>get<TrainingSession>(`/sessions/${id}`,undefined,signal);
export const saveSession=(data:SessionInput,id?:string)=>write<TrainingSession>(id?"put":"post",id?`/sessions/${id}`:"/sessions",data);
export const changeSessionStatus=(id:string,status:SessionStatus,reason="")=>write<TrainingSession>("post",`/sessions/${id}/status`,{status,reason});
export const getEnrollments=(q:Query,signal?:AbortSignal)=>get<Page<Enrollment>>("/enrollments",q,signal);
export const getTrainingAgents=(q:Query,signal?:AbortSignal)=>get<Page<AgentOption>>("/options/agents",q,signal);
export const enroll=(id:string,needId:string)=>write<Enrollment>("post",`/sessions/${id}/enrollments`,{needId});
export const reviewEnrollment=(id:string,decision:"APPROVED"|"REJECTED",comment="")=>write<Enrollment>("post",`/enrollments/${id}/review`,{decision,comment});
export const cancelEnrollment=(id:string)=>write<Enrollment>("post",`/enrollments/${id}/cancel`,{});
export const recordFeedback=(id:string,satisfaction:number,feedback:string)=>write<Enrollment>("put",`/enrollments/${id}/feedback`,{satisfaction,feedback});
export const getTrainingAudit=(id:string,signal?:AbortSignal)=>get<TrainingAudit[]>(`/sessions/${id}/audit`,undefined,signal);
export const getNeeds=(q:Query,signal?:AbortSignal)=>get<Page<TrainingNeed>>("/needs",q,signal);
export const createNeed=(data:NeedInput)=>write<TrainingNeed>("post","/needs",data);
export const reviewNeed=(id:string,decision:"APPROVED"|"REJECTED",comment:string)=>write<TrainingNeed>("post",`/needs/${id}/review`,{decision,comment});
export const getEvaluationOptions=(id:string,signal?:AbortSignal)=>get<EvaluationOption[]>(`/sources/evaluations/${id}`,undefined,signal);
export const confirmExternal=(id:string,bookingReference:string)=>write<Enrollment>("post",`/enrollments/${id}/confirm`,{bookingReference});
export const saveExternalResult=(id:string,data:{outcome:string;notes:string;certificateUrl:string;certificateReference:string})=>write<Enrollment>("put",`/enrollments/${id}/external-result`,data);
export const saveImpact=(id:string,impact:string,comment:string)=>write<TrainingNeed>("put",`/needs/${id}/impact`,{impact,comment});
export async function downloadExport(q?:Query){const response=await api.get("/trainings/enrollments/export",{params:q,responseType:"blob"});const url=URL.createObjectURL(response.data as Blob),link=document.createElement("a");link.href=url;link.download="formations-externes-inscriptions.csv";document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
