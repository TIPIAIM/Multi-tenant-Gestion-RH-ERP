import type {FeatureFlagSettings} from "./settings.types";
export const featureLabels:Record<keyof FeatureFlagSettings,string>={agents:"Agents",attendance:"Pointage",leave:"Congés et absences",tasks:"Tâches",roadmaps:"Feuilles de route",evaluations:"Évaluations",reports:"Rapports",documents:"Documents RH",payroll:"Paie",recruitment:"Recrutement",training:"Formations"};
export const documentFormats=[{value:"application/pdf",label:"PDF"},{value:"image/jpeg",label:"Image JPEG"},{value:"image/png",label:"Image PNG"},{value:"image/webp",label:"Image WebP"},{value:"application/msword",label:"Document Word"},{value:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",label:"Document Word récent"},{value:"application/vnd.ms-excel",label:"Classeur Excel"},{value:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",label:"Classeur Excel récent"}];
export type NumberingChoice={prefix:string;organization:boolean;year:boolean;digits:number;separator:string;compatible:boolean};
export function parseNumberingPattern(pattern:string):NumberingChoice{
 const separator=pattern.includes("/")?"/":pattern.includes(".")?".":"-";
 const parts=pattern.split(separator);const sequence=parts[parts.length-1]?.match(/^\{SEQ:(\d+)\}$/);
 const staticParts=parts.filter(v=>v!=="{TENANT}"&&v!=="{YEAR}"&&!/^\{SEQ:\d+\}$/.test(v));
 const choice={prefix:staticParts.join(separator),organization:parts.includes("{TENANT}"),year:parts.includes("{YEAR}"),digits:Number(sequence?.[1]??4),separator,compatible:!!sequence};
 return {...choice,compatible:!!sequence&&buildNumberingPattern(choice)===pattern&&choice.digits>=1&&choice.digits<=10&&!/[{}]/.test(choice.prefix)};
}
export function buildNumberingPattern(value:Omit<NumberingChoice,"compatible">):string{return [...(value.organization?["{TENANT}"]:[]),...(value.prefix?[value.prefix]:[]),...(value.year?["{YEAR}"]:[]),`{SEQ:${value.digits}}`].join(value.separator);}
export function numberingExample(pattern:string,acronym:string):string{return pattern.replace(/\{TENANT\}/g,acronym||"ORG").replace(/\{YEAR\}/g,String(new Date().getUTCFullYear())).replace(/\{SEQ:(\d+)\}/g,(_,n:string)=>"1".padStart(Math.min(10,Number(n)),"0")).replace(/\{[^}]*\}/g,"…");}
