import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  FileText,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  Search,
  Send,
  UsersRound,
  X,
} from "lucide-react";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import { useAuth } from "../../features/auth/auth.context";
import { useQuery } from "@tanstack/react-query";
import { getPieceTransferRecipients } from "../../features/piece-transfers/piece-transfer.api";
import type {
  CreatePieceTransferInput,
  PieceTransferAudienceMode,
  PieceTransferRecipientOption,
} from "../../features/piece-transfers/piece-transfer.types";

type Props = {
  open: boolean;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: CreatePieceTransferInput) => void;
};

function formatRole(value: string): string {
  const labels: Record<string, string> = {
    TENANT_ADMIN: "Administrateur",
    RH_MANAGER: "Responsable RH",
    DIRECTION: "Direction",
    SERVICE_MANAGER: "Chef de service",
    AGENT: "Agent",
  };

  return labels[value] ?? value;
}

export default function PieceTransferComposer({
  open,
  pending = false,
  error,
  onClose,
  onSubmit,
}: Props) {
  const { user } = useAuth();
  const formRef = useRef<HTMLFormElement | null>(null);
  const closeRef = useRef(onClose);
  const pendingRef = useRef(pending);
  closeRef.current = onClose;
  pendingRef.current = pending;
  const [fileError, setFileError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Map<string, PieceTransferRecipientOption>>(() => new Map());
  const [recipientPage, setRecipientPage] = useState(1);
  const [groupName, setGroupName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audienceMode, setAudienceMode] =
    useState<PieceTransferAudienceMode>("SELECTED");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] =
    useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (open) {
      return;
    }

    setRecipientPage(1);
    setGroupName("");
    setDescription("");
    setFile(null);
    setAudienceMode("SELECTED");
    setSearch("");
    setSelectedIds(new Set());
    setSelectedContacts(new Map());
    setFileError(null);
  }, [open]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setRecipientPage(1); setDebouncedSearch(search.trim()); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = formRef.current;
    dialog?.querySelector<HTMLInputElement>("input")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pendingRef.current) closeRef.current();
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
      )).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, [open]);

  const recipientsQuery = useQuery({
    queryKey: ["piece-transfers", "recipients", user?.id, debouncedSearch, recipientPage],
    queryFn: () =>
      getPieceTransferRecipients({
        search: debouncedSearch || undefined,
        page: recipientPage,
        limit: 100,
      }),
    enabled: open && audienceMode === "SELECTED",
    staleTime: 30_000,
  });

  const items = recipientsQuery.data?.items ?? [];
  const selectedCount = selectedIds.size;

  const isGroup = audienceMode === "ALL" || selectedCount > 1;
  const canSubmit =
    Boolean(
      (audienceMode === "ALL" || selectedCount > 0),
    ) && (!isGroup || Boolean(groupName.trim())) && !pending && !fileError;

  const selectedFromResults = useMemo(
    () => [...selectedContacts.values()],
    [selectedContacts],
  );

  if (!open) {
    return null;
  }

  function toggleRecipient(
    recipient: PieceTransferRecipientOption,
  ): void {
    if (pending) return;
    setSelectedContacts((current) => {
      const next = new Map(current);
      if (next.has(recipient.userId)) next.delete(recipient.userId);
      else next.set(recipient.userId, recipient);
      return next;
    });
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(recipient.userId)) {
        next.delete(recipient.userId);
      } else {
        next.add(recipient.userId);
      }

      return next;
    });
  }

  function submit(event: FormEvent): void {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      file: file ?? undefined,
      title: isGroup ? groupName.trim() : "",
      description: description.trim() || undefined,
      audienceMode,
      recipientUserIds:
        audienceMode === "ALL" ? [] : [...selectedIds],
    });
  }

  return (
    <div
      className="piece-transfer-modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onClose();
        }
      }}
    >
      <form ref={formRef} role="dialog" aria-modal="true" aria-labelledby="piece-transfer-compose-title" aria-busy={pending} className="piece-transfer-composer piece-transfer-composer-v5" onSubmit={submit}>
        <header className="piece-transfer-composer-header">
          <div>
            <span>NOUVELLE COMMUNICATION</span>
            <h2 id="piece-transfer-compose-title">Nouvelle discussion</h2>
          </div>

          <button
            type="button"
            className="piece-transfer-icon-button"
            onClick={onClose}
            disabled={pending}
            aria-label="Fermer"
          >
            <X size={19} />
          </button>
        </header>

        <fieldset disabled={pending} className="piece-transfer-compose-fields">
        <div className="piece-transfer-compose-grid">
          {isGroup && <label className="piece-transfer-field"><span>Nom du groupe</span><input value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={180} required placeholder="Ex. Coordination des activités" aria-label="Nom du groupe" /><small>Ce nom sera visible par tous les participants.</small></label>}

          <label className="piece-transfer-field">
            <span>Message <em>facultatif</em></span>
            <div className="piece-transfer-message-input-shell">
              <MessageSquareText size={17} />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Ajouter un message…"
              />
            </div>
            <small className="piece-transfer-character-count">{description.length}/2 000</small>
          </label>

          <label className={`piece-transfer-optional-file ${file ? "has-file" : ""}`}>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                setFileError(null);
                if (selected && selected.size > 10 * 1024 * 1024) {
                  setFileError("Cette pièce dépasse 10 Mo. Choisissez un fichier plus léger.");
                  event.target.value = "";
                  return;
                }
                setFile(selected ?? null);
              }}
            />
            <Paperclip size={18} />
            <span>{file ? file.name : "Joindre un fichier"}</span>
            <em>facultatif · 10 Mo max</em>
            {file && (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setFile(null);
                  setFileError(null);
                }}
                aria-label="Retirer la pièce"
              >
                <X size={14} />
              </button>
            )}
          </label>
        </div>

        <section className="piece-transfer-audience piece-transfer-audience-v5">
          <div className="piece-transfer-audience-mode piece-transfer-audience-mode-v5">
            <button
              type="button"
              className={audienceMode === "SELECTED" ? "is-active" : ""}
              onClick={() => setAudienceMode("SELECTED")}
            >
              <UsersRound size={17} />
              <span>Sélection</span>
            </button>

            <button
              type="button"
              className={audienceMode === "ALL" ? "is-active" : ""}
              onClick={() => setAudienceMode("ALL")}
            >
              <Send size={17} />
              <span>Tout le monde</span>
            </button>
          </div>

          {audienceMode === "SELECTED" ? (
            <>
              <label className="piece-transfer-search piece-transfer-recipient-search-v5">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Rechercher un destinataire"
                  maxLength={120}
                  placeholder="Rechercher un membre…"
                />
              </label>

              {selectedCount > 0 && (
                <div className="piece-transfer-selected-chips">
                  {selectedFromResults.map((item) => (
                    <button
                      key={item.userId}
                      type="button"
                      onClick={() => toggleRecipient(item)}
                    >
                      {item.fullName}
                      <X size={12} />
                    </button>
                  ))}


                </div>
              )}

              <p className="piece-transfer-selection-summary" role="status">{selectedCount} destinataire{selectedCount > 1 ? "s" : ""} sélectionné{selectedCount > 1 ? "s" : ""}</p>
              {recipientsQuery.isError && <div className="piece-transfer-error" role="alert">{getApiErrorMessage(recipientsQuery.error)}</div>}
              <label className="piece-transfer-field communication-recipient-dropdown">
                <span>Choisir un agent</span>
                <select aria-label="Choisir un agent" value="" disabled={pending || recipientsQuery.isFetching || selectedCount >= 500} onChange={event => {
                  const recipient = items.find(item => item.userId === event.target.value);
                  if (recipient && !selectedIds.has(recipient.userId)) toggleRecipient(recipient);
                }}>
                  <option value="">{recipientsQuery.isFetching ? "Chargement des agents…" : "Sélectionner un agent…"}</option>
                  {items.map(item => <option key={item.userId} value={item.userId} disabled={selectedIds.has(item.userId)}>{item.fullName} — {item.agent?.jobTitle || formatRole(item.role)}{selectedIds.has(item.userId) ? " · sélectionné" : ""}</option>)}
                </select>
              </label>
              {!recipientsQuery.isFetching && !recipientsQuery.isError && items.length === 0 && <p className="piece-transfer-selection-summary">Aucun agent trouvé. Essayez un autre nom.</p>}
              {(recipientsQuery.data?.pagination.pages ?? 1) > 1 && <div className="communication-recipient-pages">
                <button type="button" disabled={pending || recipientsQuery.isFetching || recipientPage <= 1} onClick={() => setRecipientPage(page => page - 1)}>Précédents</button>
                <span>Page {recipientPage}/{recipientsQuery.data?.pagination.pages}</span>
                <button type="button" disabled={pending || recipientsQuery.isFetching || recipientPage >= (recipientsQuery.data?.pagination.pages ?? 1)} onClick={() => setRecipientPage(page => page + 1)}>Suivants</button>
              </div>}
              <small className="piece-transfer-selection-summary">Choisissez les agents un par un. La sélection reste conservée pendant la recherche.</small>
            </>
          ) : (
            <div className="piece-transfer-all-summary piece-transfer-all-summary-v5">
              <UsersRound size={18} />
              <span>Tous les comptes actifs recevront cette communication.</span>
            </div>
          )}
        </section>

        </fieldset>
        {fileError && <div className="piece-transfer-error" role="alert">{fileError}</div>}
        {error && <div className="piece-transfer-error" role="alert">{error}</div>}

        <footer className="piece-transfer-composer-footer piece-transfer-composer-footer-v5">
          <span className="piece-transfer-compose-hint">
            <FileText size={14} />
            La pièce jointe n’est pas obligatoire.
          </span>

          <button
            type="submit"
            className="piece-transfer-primary-button"
            disabled={!canSubmit}
          >
            {pending ? (
              <LoaderCircle size={17} className="is-spinning" />
            ) : (
              <Send size={17} />
            )}
            Envoyer
          </button>
        </footer>
      </form>
    </div>
  );
}
