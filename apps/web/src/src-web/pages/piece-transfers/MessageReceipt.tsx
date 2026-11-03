import { Check, CheckCheck } from "lucide-react";
import "./message-receipt.css";

export default function MessageReceipt({ receipt }: {
  receipt?: { readCount: number; recipientCount: number };
}) {
  const total = Math.max(0, receipt?.recipientCount ?? 0);
  const read = Math.min(total, Math.max(0, receipt?.readCount ?? 0));
  const allRead = total > 0 && read === total;
  const label = !receipt ? "Envoyé · confirmation de lecture en attente"
    : total === 0 ? "Envoyé · aucun autre participant actif"
    : allRead ? total === 1 ? "Lu" : `Lu par tous · ${read} sur ${total}`
    : read > 0 ? `Lu par ${read} sur ${total}` : "Envoyé · pas encore lu";
  const Icon = read > 0 ? CheckCheck : Check;
  return <span className={`communication-message-receipt${allRead ? " is-read" : ""}`}
    role="img" aria-label={label} title={label}>
    <Icon size={16} strokeWidth={2} aria-hidden="true" />
    {total > 1 && <span aria-hidden="true">{read}/{total}</span>}
  </span>;
}
