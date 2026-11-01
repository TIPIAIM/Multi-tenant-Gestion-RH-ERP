export const jobStatuses=["DRAFT","PUBLISHED","CLOSED","CANCELLED"] as const;
export const applicationStages=["APPLIED","SCREENING","INTERVIEW","OFFERED","HIRED","REJECTED","WITHDRAWN"] as const;
export const terminalStages=["HIRED","REJECTED","WITHDRAWN"] as const;
export type ApplicationStage=typeof applicationStages[number];
export const isRecruitmentManager=(role:string)=>role==="TENANT_ADMIN"||role==="RH_MANAGER";
export function canMoveApplication(from:string,to:string,role:string):boolean{
 if(!isRecruitmentManager(role)||from===to)return false;
 if(to==="HIRED"&&role!=="TENANT_ADMIN")return false;
 const transitions:Record<string,readonly string[]>={APPLIED:["SCREENING","REJECTED","WITHDRAWN"],SCREENING:["INTERVIEW","OFFERED","REJECTED","WITHDRAWN"],INTERVIEW:["SCREENING","OFFERED","REJECTED","WITHDRAWN"],OFFERED:["HIRED","REJECTED","WITHDRAWN"],HIRED:[],REJECTED:[],WITHDRAWN:[]};
 return transitions[from]?.includes(to)??false;
}
export function canMoveJob(from:string,to:string):boolean{return ({DRAFT:["PUBLISHED","CANCELLED"],PUBLISHED:["CLOSED","CANCELLED"],CLOSED:["PUBLISHED","CANCELLED"],CANCELLED:[]} as Record<string,string[]>)[from]?.includes(to)??false;}
export const escapeSearch=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
export const normalizedEmail=(value:string)=>value.trim().toLowerCase();
export function safeCsv(value:unknown):string{let s=String(value??"");if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
