export type TrainingPopup={id:string;kind:string;title:string;message:string;createdAt:string;sessionId?:string;needId?:string};
export type TrainingPopupState={cursor:string;items:TrainingPopup[]};
export const trainingPopupKey=(item:TrainingPopup)=>`${item.id}:${item.createdAt}`;
const id=(v:unknown)=>typeof v==="string"&&/^[a-f\d]{24}$/i.test(v);
export function isTrainingPopup(v:unknown):v is TrainingPopup{
 if(!v||typeof v!=="object")return false;const p=v as Partial<TrainingPopup>;
 return id(p.id)&&typeof p.kind==="string"&&typeof p.title==="string"&&typeof p.message==="string"&&typeof p.createdAt==="string"&&Number.isFinite(Date.parse(p.createdAt))&&(p.sessionId===undefined||id(p.sessionId))&&(p.needId===undefined||id(p.needId));
}
export function mergeTrainingPopups(current:TrainingPopup[],incoming:TrainingPopup[],closed:string[]):TrainingPopup[]{
 const hidden=new Set(closed),items=new Map<string,TrainingPopup>();
 for(const p of [...current,...incoming])if(isTrainingPopup(p)&&!hidden.has(trainingPopupKey(p)))items.set(trainingPopupKey(p),p);
 return [...items.values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||b.id.localeCompare(a.id));
}
export function trainingPopupHref(p:TrainingPopup):string{return p.sessionId?`/trainings?session=${encodeURIComponent(p.sessionId)}`:p.needId?`/trainings?tab=needs&need=${encodeURIComponent(p.needId)}`:"/trainings";}
