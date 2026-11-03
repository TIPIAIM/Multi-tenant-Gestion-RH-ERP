export type RecruitmentPopup={id:string;kind:string;title:string;message:string;createdAt:string;jobId:string;applicationId?:string};
export type RecruitmentPopupState={cursor:string;items:RecruitmentPopup[]};
export const recruitmentPopupKey=(p:RecruitmentPopup)=>`${p.id}:${p.createdAt}`;
const id=(v:unknown)=>typeof v==="string"&&/^[a-f\d]{24}$/i.test(v);
export function isRecruitmentPopup(v:unknown):v is RecruitmentPopup{if(!v||typeof v!=="object")return false;const p=v as Partial<RecruitmentPopup>;return id(p.id)&&id(p.jobId)&&(p.applicationId===undefined||id(p.applicationId))&&typeof p.kind==="string"&&typeof p.title==="string"&&typeof p.message==="string"&&typeof p.createdAt==="string"&&Number.isFinite(Date.parse(p.createdAt));}
export function mergeRecruitmentPopups(current:RecruitmentPopup[],incoming:RecruitmentPopup[],closed:string[]):RecruitmentPopup[]{const hidden=new Set(closed),rows=new Map<string,RecruitmentPopup>();for(const p of [...current,...incoming])if(isRecruitmentPopup(p)&&!hidden.has(recruitmentPopupKey(p)))rows.set(recruitmentPopupKey(p),p);return [...rows.values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||b.id.localeCompare(a.id));}
export const recruitmentPopupHref=(p:RecruitmentPopup)=>p.applicationId?`/recruitment?application=${encodeURIComponent(p.applicationId)}`:`/recruitment?job=${encodeURIComponent(p.jobId)}`;
