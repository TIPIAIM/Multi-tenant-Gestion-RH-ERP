import "./notification-popup-portal.css";
export function getNotificationPopupPortal(): HTMLElement {
  const existing = document.getElementById("fades-notification-popup-root");
  if (existing) return existing;
  const root = document.createElement("div");
  root.id = "fades-notification-popup-root";
  root.setAttribute("aria-label", "Notifications de l’application");
  document.body.appendChild(root);
  return root;
}
