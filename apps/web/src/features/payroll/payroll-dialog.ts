import { useEffect, useRef } from "react";
export function usePayrollDialog(active: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const getDialog = () => document.querySelector<HTMLElement>(".payroll-overlay .payroll-dialog");
    const selector =
      'a[href],button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
    const focusReady = () => {
      const first = getDialog()?.querySelector<HTMLElement>(selector);
      if (!first) return false;
      first.focus(); return true;
    };
    const observer = new MutationObserver(() => { if (focusReady()) observer.disconnect(); });
    const frame = requestAnimationFrame(() => {
      if (!focusReady()) observer.observe(document.body, { childList: true, subtree: true });
    });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      const dialog = getDialog();
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(selector),
      ).filter(
        (item) =>
          item.getClientRects().length > 0 &&
          item.getAttribute("aria-hidden") !== "true",
      );
      const first = items[0],
        last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [active]);
}
