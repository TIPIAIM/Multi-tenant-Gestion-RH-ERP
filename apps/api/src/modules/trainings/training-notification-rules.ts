/** Audience définie côté serveur, jamais par le navigateur. */
export function trainingNoticeAudience(action:string,details:Record<string,unknown>):"ALL"|"MANAGERS"|"AGENT"|null{
 if(action==="OFFER_PUBLISHED"||(action==="SESSION_STATUS"&&details.status==="OPEN"))return "ALL";
 if(["ENROLLMENT_REQUESTED","ENROLLMENT_DIRECT","NEED_IDENTIFIED"].includes(action))return "MANAGERS";
 if(action==="ENROLLMENT_REVIEWED"&&details.agentId)return "AGENT";
 return null;
}
