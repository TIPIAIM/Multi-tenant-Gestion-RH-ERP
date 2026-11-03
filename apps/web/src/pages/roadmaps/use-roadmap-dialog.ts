import { useEffect, useRef, type RefObject } from "react";

let activeDialogs = 0;
let previousOverflow = "";

/** Contain keyboard focus in the uppermost roadmap dialog and restore it on close. */
export function useRoadmapDialog(ref: RefObject<HTMLElement | null>, onClose: () => void, busy = false) {
  const busyRef = useRef(busy); busyRef.current = busy;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (activeDialogs++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs.item(dialogs.length - 1) !== node || document.querySelector('dialog[open]')) return;
      if (event.key === "Escape") { event.preventDefault(); if (!busyRef.current) closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const elements = [...node.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')]
        .filter(element => element.getClientRects().length && !element.closest('[hidden], [inert]'));
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); node.focus(); }
      else if (!node.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (--activeDialogs === 0) document.body.style.overflow = previousOverflow; if (previous?.isConnected) previous.focus(); };
  }, [ref]);
}
