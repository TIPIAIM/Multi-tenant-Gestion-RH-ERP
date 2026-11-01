import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  MessageCircle,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAuth } from "../auth/auth.context";
import { getApiErrorMessage } from "../auth/auth.api";
import {
  getPayrollShareOptions,
  sharePayrollDocument,
  type Payroll,
} from "./payroll.api";
import { usePayrollDialog } from "./payroll-dialog";

function createDeliveryId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues also supports a development site opened over a local network.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 15) | 64;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export default function PayrollShareDialog({
  row,
  onClose,
}: {
  row: Payroll;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [recipientId, setRecipientId] = useState("");
  const [destination, setDestination] = useState("new");
  const [message, setMessage] = useState("");
  const [requestId] = useState(createDeliveryId);
  const options = useQuery({
    queryKey: [
      "payroll-share-options",
      user?.tenantId,
      user?.id,
      row.id,
      row.revision,
    ],
    queryFn: () => getPayrollShareOptions(row.id),
    staleTime: 0,
  });
  const selectedRecipient =
    recipientId || options.data?.recipients[0]?.id || "";
  const discussions =
    options.data?.discussions.filter(
      (d) => d.recipientUserId === selectedRecipient,
    ) ?? [];
  const mutation = useMutation({
    mutationFn: () =>
      sharePayrollDocument(row.id, {
        revision: row.revision,
        recipientUserId: selectedRecipient,
        discussionId: destination === "new" ? undefined : destination,
        requestId,
        message,
      }),
    onSuccess: async () => {
      // Communications queries use several scopes: refresh their active lists.
      await client.invalidateQueries({
        predicate: (q) =>
          q.queryKey.some(
            (k) =>
              typeof k === "string" && /piece-transfer|communication/.test(k),
          ),
      });
    },
  });
  usePayrollDialog(true, () => {
    if (!mutation.isPending) onClose();
  });
  return (
    <section
      className="payroll-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payroll-share-title"
    >
      <div className="payroll-dialog payroll-share-dialog">
        <div className="payroll-card-heading">
          <h3 id="payroll-share-title">
            <MessageCircle size={19} /> Partager le bulletin
          </h3>
          <button
            type="button"
            aria-label="Fermer le partage"
            disabled={mutation.isPending}
            onClick={onClose}
            aria-busy={mutation.isPending}
          >
            <X size={18} />
          </button>
        </div>
        <p className="payroll-share-summary">
          {row.agentName} · {row.period}
        </p>
        {mutation.isSuccess ? (
          <div className="payroll-share-success" role="status">
            <CheckCircle2 size={26} />
            <strong>Bulletin partagé</strong>
            <p>Le PDF est disponible dans la discussion privée avec l’agent.</p>
            <Link
              className="payroll-link"
              to={`/piece-transfers?conversation=${mutation.data.transferId}`}
              onClick={onClose}
            >
              Ouvrir la discussion
            </Link>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedRecipient && !mutation.isPending && !mutation.isError)
                mutation.mutate();
            }}
          >
            {options.isPending && (
              <p role="status">Recherche du compte de l’agent…</p>
            )}
            {options.isError && (
              <div role="alert">
                <p>{getApiErrorMessage(options.error)}</p>
                <button type="button" onClick={() => void options.refetch()}>
                  Réessayer
                </button>
              </div>
            )}
            {options.data && options.data.recipients.length === 0 && (
              <p role="alert">
                Aucun compte actif n’est lié à cet agent. Associez son compte à
                sa fiche Agent avant de partager ce bulletin.
              </p>
            )}
            {Boolean(options.data?.recipients.length) && (
              <>
                <label>
                  Compte de l’agent
                  <select
                    value={selectedRecipient}
                    disabled={mutation.isPending || mutation.isError}
                    onChange={(e) => {
                      setRecipientId(e.target.value);
                      setDestination("new");
                    }}
                  >
                    {options.data?.recipients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.fullName} · {r.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Destination
                  <select
                    value={destination}
                    disabled={mutation.isPending || mutation.isError}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    <option value="new">Nouvelle discussion privée</option>
                    {discussions.map((d, index) => (
                      <option key={d.id} value={d.id}>
                        {d.title} · discussion {index + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Message d’accompagnement <small>(facultatif)</small>
                  <textarea
                    value={message}
                    maxLength={1000}
                    rows={3}
                    disabled={mutation.isPending || mutation.isError}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Bonjour, voici votre bulletin de paie."
                  />
                </label>
                <p className="payroll-help">
                  <ShieldCheck size={16} /> Seul l’agent concerné est proposé.
                  Le bulletin est envoyé en PDF dans une discussion privée.
                </p>
              </>
            )}
            {mutation.isError && (
              <p role="alert">
                {getApiErrorMessage(mutation.error)} Vérifiez vos communications
                avant de relancer un partage.
              </p>
            )}
            <div className="payroll-actions">
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={onClose}
                aria-busy={mutation.isPending}
              >
                Fermer
              </button>
              <button
                className="payroll-primary"
                type="submit"
                disabled={
                  !selectedRecipient ||
                  !options.isSuccess ||
                  mutation.isPending ||
                  mutation.isError
                }
              >
                <Send size={17} />
                {mutation.isPending ? "Envoi en cours…" : "Partager le PDF"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
