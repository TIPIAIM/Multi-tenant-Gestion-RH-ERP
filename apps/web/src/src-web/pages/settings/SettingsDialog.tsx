import {useEffect,useId,useRef,type ReactNode} from "react";
import {X} from "lucide-react";
export default function SettingsDialog({title,eyebrow="PARAMÈTRES",busy=false,onClose,children,className=""}:{title:string;eyebrow?:string;busy?:boolean;onClose:()=>void;children:ReactNode;className?:string}){
 const ref=useRef<HTMLDialogElement>(null),id=useId();
 useEffect(()=>{const d=ref.current,previous=document.activeElement as HTMLElement|null;d?.showModal();d?.querySelector<HTMLElement>("textarea,input,select")?.focus();return()=>{d?.close();previous?.focus();};},[]);
 return <dialog ref={ref} aria-labelledby={id} className={`settings-native-dialog ${className}`} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><header><div><p>{eyebrow}</p><h3 id={id}>{title}</h3></div><button type="button" className="settings-icon-button" title="Fermer" aria-label="Fermer" disabled={busy} onClick={onClose}><X size={16}/></button></header>{children}</dialog>;
}
