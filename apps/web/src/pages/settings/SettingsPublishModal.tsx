import { AlertTriangle, LoaderCircle, Send, X } from "lucide-react";
import { useState } from "react";
import type { SettingsImpact } from "../../features/settings/settings.types";

export default function SettingsPublishModal({ open, impact, isSubmitting, onClose, onPublish }: {
  open: boolean; impact: SettingsImpact | null; isSubmitting: boolean; onClose: () => void; onPublish: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  if (!open) return null;
  return <div className="settings-modal-layer"><button type="button" className="settings-modal-backdrop" onClick={onClose} /><section className="settings-publish-modal">
    <header><div><p>PUBLICATION CONTRÔLÉE</p><h3>Publier la nouvelle configuration</h3></div><button type="button" onClick={onClose}><X size={20} /></button></header>
    {impact && <div className="settings-impact-summary"><article><span>Modifications</span><strong>{impact.changesCount}</strong></article><article><span>Agents concernés</span><strong>{impact.affectedAgents}</strong></article><article><span>Utilisateurs</span><strong>{impact.affectedUsers}</strong></article><article><span>Modules affectés</span><strong>{impact.affectedModules.length}</strong></article></div>}
    {impact?.warnings.length ? <div className="settings-impact-warning"><AlertTriangle size={18} /><ul>{impact.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
    <label className="settings-field"><span>Motif de publication</span><textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Expliquez l’objet, la décision ou la politique à l’origine de cette version..." /></label>
    <footer><button type="button" className="settings-cancel-button" onClick={onClose} disabled={isSubmitting}>Annuler</button><button type="button" className="settings-primary-button" disabled={isSubmitting || reason.trim().length < 5} onClick={() => void onPublish(reason.trim())}>{isSubmitting ? <LoaderCircle size={18} className="is-spinning" /> : <Send size={18} />} Publier</button></footer>
  </section></div>;
}
