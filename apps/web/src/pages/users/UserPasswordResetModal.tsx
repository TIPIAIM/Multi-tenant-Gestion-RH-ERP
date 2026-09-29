import { useState } from "react";
import { KeyRound, LoaderCircle, X } from "lucide-react";

type Props = {
  userName: string;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onConfirm: (password?: string) => Promise<void>;
};

export default function UserPasswordResetModal({
  userName,
  isSubmitting = false,
  errorMessage,
  onClose,
  onConfirm,
}: Props) {
  const [password, setPassword] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setClientError(null);

    if (password && password.length < 8) {
      setClientError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    await onConfirm(password || undefined);
  }

  return (
    <div className="users-modal-layer">
      <button
        className="users-modal-backdrop"
        type="button"
        aria-label="Fermer"
        onClick={onClose}
      />

      <section className="users-modal users-modal-small" role="dialog" aria-modal="true">
        <header className="users-modal-header">
          <div>
            <p>SÉCURITÉ</p>
            <h3>Réinitialiser le mot de passe</h3>
          </div>

          <button type="button" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>

        {(clientError || errorMessage) && (
          <div className="users-error">{clientError || errorMessage}</div>
        )}

        <div className="users-reset-panel">
          <KeyRound size={28} />
          <p>
            Le mot de passe de <strong>{userName}</strong> sera remplacé. Si le champ
            reste vide, un mot de passe temporaire sera généré automatiquement.
          </p>

          <label>
            <span>Nouveau mot de passe facultatif</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Laisser vide pour générer"
            />
          </label>
        </div>

        <footer className="users-modal-actions">
          <button type="button" onClick={onClose}>
            Annuler
          </button>
          <button type="button" disabled={isSubmitting} onClick={() => void submit()}>
            {isSubmitting && <LoaderCircle className="is-spinning" size={16} />}
            Réinitialiser
          </button>
        </footer>
      </section>
    </div>
  );
}
