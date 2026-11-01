export const groups=[
 {key:"settings",label:"Paramètres",prefixes:["TenantSettings"],dependencies:[]},
 {key:"organization",label:"Organisation",prefixes:["OrganizationUnit"],dependencies:[]},
 {key:"agents",label:"Agents",prefixes:["Agent"],dependencies:["organization"]},
 {key:"tasks",label:"Tâches",prefixes:["Task"],dependencies:["agents"]},
 {key:"attendance",label:"Pointage",prefixes:["Attendance"],dependencies:["agents"]},
 {key:"leaves",label:"Congés et absences",prefixes:["Leave"],dependencies:["agents"]},
 {key:"roadmaps",label:"Feuilles de route",prefixes:["Roadmap"],dependencies:["agents"]},
 {key:"evaluations",label:"Évaluations",prefixes:["Evaluation"],dependencies:["agents","roadmaps","attendance","leaves","tasks"]},
 {key:"reports",label:"Rapports",prefixes:["Report","ManagementReport"],dependencies:["evaluations"]},
 {key:"training",label:"Formations",prefixes:["Training"],dependencies:["agents","evaluations"]},
 {key:"recruitment",label:"Recrutement",prefixes:["Recruitment"],dependencies:[]},
 {key:"payroll",label:"Paie",prefixes:["Payroll"],dependencies:["agents"]},
 {key:"communications",label:"Communications",prefixes:["PieceTransfer"],dependencies:["agents"]},
] as const;
export type BackupGroup=typeof groups[number]["key"];
export const MAX_BYTES=20*1024*1024;
export const MAX_DOCUMENTS=50000;
export const MAX_FILE_BYTES=25*1024*1024;
export function expandGroups(selected:string[]):BackupGroup[]{
 const found=new Set<string>();function visit(key:string){const group=groups.find(g=>g.key===key);if(!group)throw new Error("Module non reconnu.");if(found.has(key))return;found.add(key);for(const dependency of group.dependencies)visit(dependency);}
 if(!selected.length)throw new Error("Choisissez au moins un module.");for(const key of selected)visit(key);return groups.filter(g=>found.has(g.key)).map(g=>g.key);
}
/** Ne jamais archiver les sessions, mots de passe, files d’envoi ou actifs de stockage. */
export function eligibleModel(name:string,hasTenant:boolean):boolean{
 return hasTenant&&groups.some(g=>g.prefixes.some(prefix=>name.startsWith(prefix)))&&!/(Asset|Photo|Notice|Popup|Notification|Lock|Delivery|Queue|Token|SessionToken|Mention)/i.test(name)&&(!/Sequence/i.test(name)||name==="TaskSequence");
}
export const referenceModels:Record<string,string>={agentId:"Agent",supervisorAgentId:"Agent",directionId:"OrganizationUnit",serviceId:"OrganizationUnit",userId:"User",createdBy:"User",createdByUserId:"User",actorId:"User",actorUserId:"User",requestedByUserId:"User",reviewedByUserId:"User",jobId:"RecruitmentJob",applicationId:"RecruitmentApplication",courseId:"TrainingCourse",needId:"TrainingNeed",taskId:"Task",roadmapId:"Roadmap",evaluationId:"Evaluation"};
export function sameTenant(value:unknown,tenantId:string):boolean{return value!=null&&String(value)===tenantId;}
