import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";

/** Native modal provides focus containment, Escape and inert background, including over a drawer. */
export function useRoadmapConfirm() {
  const [message, setMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resolveRef = useRef<((accepted: boolean) => void) | null>(null);
  const previousRef = useRef<HTMLElement | null>(null);
  const finish = useCallback((accepted: boolean) => {
    dialogRef.current?.close();
    resolveRef.current?.(accepted); resolveRef.current = null; setMessage(null);
    previousRef.current?.focus();
  }, []);
  const confirm = useCallback((text: string) => {
    resolveRef.current?.(false);
    previousRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMessage(text);
    return new Promise<boolean>(resolve => { resolveRef.current = resolve; });
  }, []);
  useEffect(() => { if (message && !dialogRef.current?.open) dialogRef.current?.showModal(); }, [message]);
  useEffect(() => () => { resolveRef.current?.(false); }, []);
  const confirmation = message ? createPortal(
    <dialog ref={dialogRef} className="roadmap-confirm" aria-label="Confirmer cette action"
      onCancel={event => { event.preventDefault(); finish(false); }}
      onKeyDown={event => event.stopPropagation()}
      onClick={event => { if (event.target === event.currentTarget) finish(false); }}>
      <header><span><Trash2 size={20}/> Confirmer cette action</span><button type="button" aria-label="Fermer la confirmation" onClick={() => finish(false)}><X size={18}/></button></header>
      <p>{message}</p><footer><button type="button" autoFocus onClick={() => finish(false)}>Annuler</button><button type="button" className="is-danger" onClick={() => finish(true)}>Confirmer</button></footer>
    </dialog>, document.body) : null;
  return { confirm, confirmation };
}
