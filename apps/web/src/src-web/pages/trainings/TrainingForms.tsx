import {useTenantSettings} from "../../features/settings/settings.context";
import {useState,type FormEvent} from "react";
import {FormButtons} from "./TrainingDialog";
import type {Course,CourseInput,TrainingSession,SessionInput,TrainingFormat} from "../../features/trainings/training.types";
export function CourseForm({value,busy,onClose,onSave}:{value?:Course;busy:boolean;onClose:()=>void;onSave:(v:CourseInput)=>void}){
 const {settings:publishedSettings}=useTenantSettings();const defaults=publishedSettings?.training;
 function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const data=new FormData(e.currentTarget);onSave({code:String(data.get("code")),title:String(data.get("title")),category:String(data.get("category")),objectives:String(data.get("objectives")),provider:String(data.get("provider")),format:String(data.get("format")) as TrainingFormat,durationHours:Number(data.get("durationHours")),active:data.get("active")==="on"});}
 return <form onSubmit={submit}><fieldset disabled={busy} className="tr-fields">
  <label>Code de formation<input name="code" required minLength={2} maxLength={40} defaultValue={value?.code} placeholder="FOR-001" autoFocus/></label>
  <label>Intitulé<input name="title" required minLength={3} maxLength={180} defaultValue={value?.title}/></label>
  <label>Domaine / compétence<input name="category" required minLength={2} maxLength={100} defaultValue={value?.category} placeholder="Management, bureautique…"/></label>
  <label>Organisme / prestataire<input name="provider" required minLength={2} maxLength={180} defaultValue={value?.provider}/></label>
  <label>Modalité<select name="format" defaultValue={value?.format??"IN_PERSON"}><option value="IN_PERSON">Présentiel</option><option value="REMOTE">À distance</option><option value="HYBRID">Hybride</option></select></label>
  <label>Volume prévu (heures)<input name="durationHours" type="number" required min={.5} max={2000} step={.5} defaultValue={value?.durationHours??defaults?.defaultDurationHours??7}/></label>
  <label className="tr-full">Objectifs pédagogiques<textarea name="objectives" rows={4} maxLength={4000} defaultValue={value?.objectives}/></label>

  <label className="tr-check"><input name="active" type="checkbox" defaultChecked={value?.active??true}/>Formation active dans le catalogue</label>
 </fieldset><FormButtons busy={busy} onClose={onClose}/></form>;
}
export function SessionForm({value,courses,courseSearch,onCourseSearch,busy,onSave,onClose}:{value?:TrainingSession;courses:Course[];courseSearch:string;onCourseSearch:(v:string)=>void;busy:boolean;onSave:(v:SessionInput)=>void;onClose:()=>void}){
 const {settings:publishedSettings}=useTenantSettings();const defaults=publishedSettings?.training;
 const [courseId,setCourseId]=useState(value?.courseId??""),[hours,setHours]=useState(value?.durationHours??defaults?.defaultDurationHours??7);
 function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);onSave({courseId,startsAt:`${String(f.get("startsAt"))}:00Z`,endsAt:`${String(f.get("endsAt"))}:00Z`,durationHours:hours,capacity:Number(f.get("capacity")),location:String(f.get("location")),trainer:String(f.get("trainer")),totalCost:Number(f.get("totalCost")),currency:String(f.get("currency")) as SessionInput["currency"]});}
 return <form onSubmit={submit}><fieldset disabled={busy} className="tr-fields">
 <label className="tr-full">Rechercher une formation active<input type="search" value={courseSearch} onChange={e=>onCourseSearch(e.target.value)} placeholder="Titre, code ou domaine"/></label>
 <label className="tr-full">Formation<select value={courseId} required onChange={e=>{setCourseId(e.target.value);const c=courses.find(c=>c.id===e.target.value);if(c)setHours(c.durationHours);}}><option value="">Sélectionner une formation</option>{value&&!courses.some(c=>c.id===value.courseId)&&<option value={value.courseId}>{value.title}</option>}{courses.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select></label>
 <label>Début (heure de Conakry)<input name="startsAt" type="datetime-local" required defaultValue={value?.startsAt.slice(0,16)}/></label>
 <label>Fin (heure de Conakry)<input name="endsAt" type="datetime-local" required defaultValue={value?.endsAt.slice(0,16)}/></label>
 <label>Volume réel (heures)<input name="durationHours" type="number" required min={.5} max={2000} step={.5} value={hours} onChange={e=>setHours(Number(e.target.value))}/></label>
 <label>Places prévues pour nos agents<input name="capacity" type="number" required min={1} max={10000} defaultValue={value?.capacity??15}/></label>
 <label>Lieu ou lien de connexion<input name="location" maxLength={250} defaultValue={value?.location}/></label>
 <label>Contact / interlocuteur de l’organisme<input name="trainer" maxLength={180} defaultValue={value?.trainer}/></label>
 <label>Coût total prévu de la session<input name="totalCost" type="number" min={0} max={1e13} step="any" defaultValue={value?.totalCost??0}/></label>
 <label>Devise<select name="currency" defaultValue={value?.currency??defaults?.defaultCurrency??"GNF"}><option>GNF</option><option>EUR</option><option>USD</option></select></label>


 </fieldset><p className="tr-help">Le projet est créé en brouillon. Retenez-le dans le plan, puis rattachez les besoins validés des agents. Aucune inscription n’est envoyée automatiquement à l’organisme.</p><FormButtons busy={busy} onClose={onClose}/></form>;
}

export function NeedForm({agents,evaluations,onAgentChange,busy,onClose,onSave}:{agents:import("../../features/trainings/training.types").AgentOption[];evaluations:import("../../features/trainings/training.types").EvaluationOption[];onAgentChange:(id:string)=>void;busy:boolean;onClose:()=>void;onSave:(data:import("../../features/trainings/training.types").NeedInput)=>void}){
 const [agentId,setAgent]=useState(""),[sourceKind,setSource]=useState<"EVALUATION"|"REPORT"|"MANAGER_OBSERVATION">("MANAGER_OBSERVATION"),[evaluationId,setEvaluation]=useState(""),[reference,setReference]=useState("Besoin exprimé auprès des RH"),[justification,setJustification]=useState("");
 return <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onSave({agentId,competency:String(f.get("competency")),justification,priority:String(f.get("priority")) as "NORMAL"|"HIGH"|"URGENT",sourceKind,sourceReference:reference,evaluationId:sourceKind==="EVALUATION"?evaluationId:undefined,targetDate:String(f.get("targetDate"))});}}><fieldset className="tr-fields" disabled={busy}>
 <label className="tr-full">Agent concerné<select required value={agentId} onChange={e=>{setAgent(e.target.value);setEvaluation("");setReference("Besoin exprimé auprès des RH");onAgentChange(e.target.value);}}><option value="">Choisir un agent de mon périmètre</option>{agents.map(a=><option key={a.id} value={a.id}>{a.fullName} · {a.matricule}</option>)}</select></label>
 <label className="tr-full">Formation recommandée / compétence à renforcer<input name="competency" required minLength={3} maxLength={180} placeholder="Ex. Rédaction de rapports administratifs"/></label>
 <details className="tr-full"><summary>Préciser la source ou la priorité (facultatif)</summary><div className="tr-fields"><label>Source du besoin<select value={sourceKind} onChange={e=>setSource(e.target.value as typeof sourceKind)}><option value="EVALUATION">Évaluation individuelle validée</option><option value="REPORT">Rapport</option><option value="MANAGER_OBSERVATION">Constat du responsable</option></select></label>
 <label>Priorité<select name="priority" defaultValue="NORMAL"><option value="NORMAL">Normale</option><option value="HIGH">Élevée</option><option value="URGENT">Urgente</option></select></label>
 {sourceKind==="EVALUATION"&&<label className="tr-full">Évaluation validée de l’agent<select required value={evaluationId} onChange={e=>{setEvaluation(e.target.value);const selected=evaluations.find(v=>v.id===e.target.value);if(selected){setReference(`Évaluation ${selected.year}`);if(!justification)setJustification(selected.trainingNeeds);}}}><option value="">Choisir une évaluation</option>{evaluations.map(v=><option key={v.id} value={v.id}>{v.year} · {v.score}/100</option>)}</select></label>}
 <label className="tr-full">Référence de la source<input required minLength={3} maxLength={300} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Titre et période du rapport, ou référence de l’évaluation"/></label></div></details>
 <label className="tr-full">Besoin constaté et résultat attendu au poste<textarea required minLength={10} maxLength={3000} rows={4} value={justification} onChange={e=>setJustification(e.target.value)}/></label>
 <label>Échéance souhaitée<input name="targetDate" type="date" required defaultValue={new Date(Date.now()+90*86400000).toISOString().slice(0,10)}/></label>
 </fieldset><FormButtons busy={busy} onClose={onClose} label="Proposer le besoin"/></form>;
}

export function PersonalNeedForm({busy,onClose,onSave}:{busy:boolean;onClose:()=>void;onSave:(v:import("../../features/trainings/training.types").NeedInput)=>void}){
 return <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onSave({competency:String(f.get("title")),justification:String(f.get("reason")),priority:"NORMAL",sourceKind:"AGENT_REQUEST",sourceReference:"Besoin exprimé par l’agent",targetDate:String(f.get("date"))});}}><fieldset className="tr-fields" disabled={busy}>
 <label className="tr-full">Quelle formation ou compétence souhaitez-vous développer ?<input name="title" required minLength={3} maxLength={180} placeholder="Ex. Mieux utiliser Excel"/></label>
 <label className="tr-full">Pourquoi cette formation vous serait-elle utile ?<textarea name="reason" required minLength={10} maxLength={3000} rows={4} placeholder="Expliquez simplement votre besoin dans votre travail."/></label>
 <label className="tr-full">À quelle échéance ?<input name="date" type="date" required defaultValue={new Date(Date.now()+90*86400000).toISOString().slice(0,10)}/></label>
 </fieldset><p className="tr-help">Votre besoin sera transmis aux RH pour examen.</p><FormButtons busy={busy} onClose={onClose} label="Envoyer mon besoin"/></form>;
}
export function OfferForm({busy,onClose,onSave}:{busy:boolean;onClose:()=>void;onSave:(v:import("../../features/trainings/training.types").OfferInput)=>void}){
 const {settings:publishedSettings}=useTenantSettings();const defaults=publishedSettings?.training;
 return <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onSave({title:String(f.get("title")),provider:String(f.get("provider")),startsAt:`${f.get("start")}:00Z`,endsAt:`${f.get("end")}:00Z`,location:String(f.get("location")),capacity:Number(f.get("capacity")),durationHours:Number(f.get("hours")),totalCost:Number(f.get("cost")),currency:String(f.get("currency")) as "GNF"|"EUR"|"USD",format:String(f.get("format")) as TrainingFormat,category:"Formation continue",objectives:String(f.get("objectives")),trainer:""});}}><fieldset className="tr-fields" disabled={busy}>
 <label className="tr-full">Nom de la formation<input name="title" required minLength={3} maxLength={180} placeholder="Ex. Excel pour le suivi administratif"/></label>
 <label className="tr-full">Organisme qui assure la formation<input name="provider" required minLength={2} maxLength={180}/></label>
 <label>Début · heure de Conakry<input name="start" type="datetime-local" required/></label><label>Fin · heure de Conakry<input name="end" type="datetime-local" required/></label>
 <label>Lieu ou lien de connexion<input name="location" maxLength={250}/></label><label>Nombre de places pour nos agents<input name="capacity" type="number" required min={1} max={10000} defaultValue={defaults?.defaultCapacity??20}/></label>
 <details className="tr-full"><summary>Durée, budget et informations complémentaires</summary><div className="tr-fields">
 <label>Nombre d’heures<input name="hours" type="number" required min={.5} max={2000} step={.5} defaultValue={defaults?.defaultDurationHours??7}/></label><label>Modalité<select name="format"><option value="IN_PERSON">Présentiel</option><option value="REMOTE">À distance</option><option value="HYBRID">Hybride</option></select></label>
 <label>Budget total prévu<input name="cost" type="number" min={0} max={1e13} step="any" defaultValue={0}/></label><label>Devise<select name="currency" defaultValue={defaults?.defaultCurrency??"GNF"}><option>GNF</option><option>EUR</option><option>USD</option></select></label>
 <label className="tr-full">À qui s’adresse la formation et que va-t-on apprendre ?<textarea name="objectives" maxLength={4000} rows={3}/></label></div></details>
 </fieldset><p className="tr-help">La formation sera visible par les agents dès sa publication. Les demandes resteront soumises à votre accord.</p><FormButtons busy={busy} onClose={onClose} label="Publier la formation"/></form>;
}

export {TrainingDialog,FormButtons} from "./TrainingDialog";
