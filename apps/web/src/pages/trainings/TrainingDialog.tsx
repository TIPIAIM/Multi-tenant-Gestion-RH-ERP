import {useEffect,useId,useRef,type ReactNode} from "react";
import {LoaderCircle,X,Check} from "lucide-react";
export function TrainingDialog({title,children,busy,onClose,error,wide=false}:{title:string;children:ReactNode;busy:boolean;onClose:()=>void;error?:string;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),heading=useId();
 useEffect(()=>{const node=ref.current,previous=document.activeElement as HTMLElement|null;if(node&&!node.open){node.showModal();node.querySelector<HTMLElement>("input,select,textarea")?.focus();}return()=>{node?.close();previous?.focus();};},[]);
 return <dialog ref={ref} className={`training-dialog ${wide?"training-dialog-wide":""}`} aria-labelledby={heading} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <header><div><p>FORMATION & COMPÉTENCES</p><h3 id={heading}>{title}</h3></div><button className="tr-icon" type="button" title="Fermer" aria-label="Fermer" disabled={busy} onClick={onClose}><X size={18}/></button></header>
  {error&&<p className="tr-alert" role="alert">{error}</p>}{children}
 </dialog>;
}
export function FormButtons({busy,onClose,label="Enregistrer"}:{busy:boolean;onClose:()=>void;label?:string}){return <footer className="tr-form-actions"><button className="tr-button" type="button" disabled={busy} onClick={onClose}>Annuler</button><button className="tr-button tr-primary" type="submit" disabled={busy} aria-busy={busy}>{busy?<LoaderCircle size={16} className="tr-spin"/>:<Check size={16}/>} {label}</button></footer>;}
