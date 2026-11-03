import {api} from "../../lib/api";
export type Archive={id:string;label:string;modules:string[];bytes:number;documents:number;collections:number;origin:"MANUAL"|"IMPORT"|"SAFETY";createdBy:string;snapshotAt:string;createdAt:string};
export type Operation={id:string;kind:"BACKUP"|"RESTORE";status:"RUNNING"|"COMPLETED"|"FAILED";phase:string;message:string;inserted:number;skipped:number;details:{module:string;restored:number;existing:number}[];safetyId?:string;createdAt:string;updatedAt:string};
export type BackupList={serviceVersion:string;statistics:{copies:number;bytes:number;documents:number;restorations:number;restored:number};audit:{id:string;actorName:string;action:string;createdAt:string}[];items:Archive[];operations:Operation[];modules:{key:string;label:string;available:boolean;dependencies:readonly string[]}[];configured:boolean;limits:{maximumMegabytes:number;maximumDocuments:number};pagination:{page:number;total:number;totalPages:number}};
export type DependencyIssue={label:string;missing:number;unavailable:boolean};
export type Candidate={excluded:number;details:{label:string;changed:number;added:number}[];key:string;missing:number;eligible:boolean;dependencies:string[];blockers:string[];dependencyIssues:DependencyIssue[];changed:number;added:number};
export type Preview={candidates:Candidate[];selected:string[];selection:{excluded:number;missing:number;existing:number;details:{label:string;missing:number;documents:number}[]}|null;dependencyIssues:DependencyIssue[];fileValid:true;canRestore:boolean;changed:number;added:number;blockers:string[];details:{label:string;documents:number;missing:number;changed:number;added:number}[];missing:number;existing:number;collections:number;token:string|null;modules:string[];createdAt:string;label:string;documents:number};
async function write<T>(path:string,body:unknown){return (await api.post<{data:T}>(`/backups${path}`,body)).data.data;}
export const list=(page:number,signal?:AbortSignal)=>api.get<{data:BackupList}>("/backups",{params:{page},signal}).then(r=>r.data.data);
export const create=(modules:string[],label:string)=>write<{operationId:string}>("/",{modules,label});
export const preview=(input:{id:string;modules?:string[]})=>write<Preview>(`/${input.id}/preview`,{modules:input.modules});
export const restore=(id:string,token:string,confirmation:string)=>write(`/${id}/restore`,{token,confirmation});
export const importFile=(file:File)=>{const form=new FormData();form.append("file",file);return write<Archive>("/import",form);};
export async function download(id:string){const response=await api.get(`/backups/${id}/download`,{responseType:"blob"});const url=URL.createObjectURL(response.data as Blob),link=document.createElement("a");try{link.href=url;link.download="sauvegarde.rhbackup";link.click();}finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}}

export const remove=(id:string)=>api.delete(`/backups/${id}`).then(r=>r.data);
