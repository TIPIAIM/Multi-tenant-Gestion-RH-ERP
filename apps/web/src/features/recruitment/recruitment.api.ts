import {api} from "../../lib/api";
import type {Job,JobInput,Application,CandidateInput,Interview,InterviewInput,Dossier,Dashboard,Page,Stage,JobStatus} from "./recruitment.types";
export type Query={page?:number;limit?:number;search?:string;status?:string;jobId?:string;applicationId?:string;upcoming?:"true"|"false"};
async function get<T>(path:string,params?:Query,signal?:AbortSignal){return (await api.get<{success:boolean;data:T}>(`/recruitment${path}`,{params,signal})).data.data;}
async function write<T>(method:"post"|"put",path:string,data:unknown){return (await api[method]<{success:boolean;data:T}>(`/recruitment${path}`,data)).data.data;}
export const dashboard=(signal?:AbortSignal)=>get<Dashboard>("/dashboard",undefined,signal);
export const jobs=(query:Query,signal?:AbortSignal)=>get<Page<Job>>("/jobs",query,signal);
export const saveJob=(input:JobInput,id?:string)=>write<Job>(id?"put":"post",id?`/jobs/${id}`:"/jobs",input);
export const changeJob=(id:string,status:JobStatus,reason:string)=>write<Job>("post",`/jobs/${id}/status`,{status,reason});
export const applications=(query:Query,signal?:AbortSignal)=>get<Page<Application>>("/applications",query,signal);
export const dossier=(id:string,signal?:AbortSignal)=>get<Dossier>(`/applications/${id}`,undefined,signal);
export const saveCandidate=(input:CandidateInput,id?:string)=>write<Application>(id?"put":"post",id?`/applications/${id}`:"/applications",input);
export const move=(id:string,stage:Stage,comment:string,startDate?:string)=>write<Application>("post",`/applications/${id}/stage`,{stage,comment,startDate});
export const note=(id:string,comment:string)=>write("post",`/applications/${id}/notes`,{comment});
export const anonymize=(id:string,confirmation:string)=>write("post",`/applications/${id}/anonymize`,{confirmation});
export const interviews=(query:Query,signal?:AbortSignal)=>get<Page<Interview>>("/interviews",query,signal);
export const saveInterview=(id:string,input:InterviewInput,interviewId?:string)=>write<Interview>(interviewId?"put":"post",`/applications/${id}/interviews${interviewId?`/${interviewId}`:""}`,input);
export const interviewResult=(id:string,input:{status:"DONE"|"CANCELLED";recommendation?:"FAVORABLE"|"RESERVED"|"UNFAVORABLE";comment:string})=>write<Interview>("post",`/interviews/${id}/result`,input);
export async function download(query:Query){const response=await api.get("/recruitment/applications/export",{params:query,responseType:"blob"});const url=URL.createObjectURL(response.data as Blob);const link=document.createElement("a");try{link.href=url;link.download="recrutement-candidatures.csv";link.click();}finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}}
