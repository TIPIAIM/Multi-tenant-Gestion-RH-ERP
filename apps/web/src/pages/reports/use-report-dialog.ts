import { useEffect, useRef } from "react";

const stack: symbol[] = [];
let previousOverflow = "";

export function useReportDialog(
  busy: boolean,
  onClose: () => void,
  selector: string,
  enabled = true,
) {
  const current = useRef({ busy, onClose });
  useEffect(() => {
    current.current = { busy, onClose };
  }, [busy, onClose]);
  useEffect(() => {
    if (!enabled) return;
    const dialog = document.querySelector<HTMLElement>(selector);
    if (!dialog) return;
    const key = Symbol();
    const previous = document.activeElement as HTMLElement | null;
    if (!stack.length) previousOverflow = document.body.style.overflow;
    stack.push(key);
    document.body.style.overflow = "hidden";
    const controls = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ),
      ).filter((el) => el.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => controls()[0]?.focus());
    const handle = (event: KeyboardEvent) => {
      if (stack.at(-1) !== key) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!current.current.busy) current.current.onClose();
      }
      if (event.key !== "Tab") return;
      const items = controls(),
        first = items[0],
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
    };
    document.addEventListener("keydown", handle);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handle);
      const wasTop = stack.at(-1) === key;
      stack.splice(stack.indexOf(key), 1);
      if (!stack.length) document.body.style.overflow = previousOverflow;
      if (wasTop && previous?.isConnected) previous.focus();
    };
  }, [selector, enabled]);
}
