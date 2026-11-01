import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Eye,
  File,
  FileAudio,
  FileImage,
  Files,
  FolderOpen,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../features/auth/auth.context";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import * as api from "./files.api";
import type { FileItem, Filter } from "./files.api";
import "./files-page.css";
const bytes = (n: number) =>
  n
    ? n >= 1024 ** 3
      ? `${(n / 1024 ** 3).toFixed(1)} Go`
      : n >= 1024 ** 2
        ? `${(n / 1024 ** 2).toFixed(1)} Mo`
        : `${Math.ceil(n / 1024)} Ko`
    : "Taille non renseignée";
const date = (v: string) =>
  v
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeZone: "Africa/Conakry",
      }).format(new Date(v))
    : "—";
function Dialog({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const old = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      old?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="fl-dialog"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h3 id={id}>{title}</h3>
        <button
          type="button"
          className="fl-icon"
          title="Fermer"
          aria-label="Fermer"
          disabled={busy}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function FileIcon({ item }: { item: FileItem }) {
  const Icon =
    item.kind === "link"
      ? Link2
      : item.mime.startsWith("image/")
        ? FileImage
        : item.mime.startsWith("audio/")
          ? FileAudio
          : File;
  return <Icon size={18} aria-hidden="true" />;
}
export default function FilesPage() {
  const { user } = useAuth(),
    client = useQueryClient(),
    allowed = user?.role === "TENANT_ADMIN" || user?.role === "RH_MANAGER",
    root = ["files", user?.tenantId, user?.id];
  const [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [module, setModule] = useState(""),
    [kind, setKind] = useState<"all" | "file" | "link">("all"),
    [recent, setRecent] = useState(false),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<FileItem | null>(null),
    [deleteItem, setDeleteItem] = useState<
      (FileItem & { token: string }) | null
    >(null),
    [confirm, setConfirm] = useState(false),
    [exportScope, setExportScope] = useState<"all" | "selection" | null>(null),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<{ item: FileItem; url: string } | null>(
      null,
    );
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [debounced, module, kind, recent]);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);
  const filters: Filter = {
    search: debounced || undefined,
    module: module || undefined,
    kind,
    recent,
  };
  const query = useQuery({
    queryKey: [...root, filters, page],
    queryFn: ({ signal }) => api.list(filters, page, signal),
    enabled: allowed,
    refetchInterval: 30000,
    retry: 1,
  });
  const jobs = useQuery({
    queryKey: [...root, "exports"],
    queryFn: ({ signal }) => api.jobs(signal),
    enabled: allowed,
    refetchInterval: (q) =>
      q.state.data?.some((j) => j.status === "RUNNING") ? 2000 : 30000,
    retry: 1,
  });
  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => client.invalidateQueries(),
  });
  const busy = mutation.isPending,
    jobRunning = jobs.data?.some((j) => j.status === "RUNNING") ?? false,
    error = mutation.isError
      ? getApiErrorMessage(mutation.error)
      : query.isError
        ? getApiErrorMessage(query.error)
        : null;
  async function run(work: () => Promise<unknown>) {
    mutation.reset();
    try {
      await mutation.mutateAsync(work);
    } catch {
      /* Displayed in the current surface. */
    }
  }
  const label = (key: string) =>
    query.data?.modules.find((m) => m.key === key)?.label ?? "Documents";
  const shown = query.data?.items ?? [],
    allChecked =
      shown.length > 0 && shown.every((f) => selected.includes(f.id));
  if (!allowed)
    return (
      <section className="fl-page">
        <p className="fl-alert">
          Cet espace est réservé au RH et à l’administrateur.
        </p>
      </section>
    );
  return (
    <section className="fl-page">
      <header className="fl-hero">
        <div>
          <p>ESPACE DOCUMENTAIRE</p>
          <h2>Tous les fichiers</h2>
          <span>
            Retrouvez et conservez les fichiers de votre organisation.
          </span>
        </div>
        <div className="fl-actions">
          <button
            className="fl-icon"
            title="Actualiser"
            aria-label="Actualiser"
            disabled={query.isFetching || busy}
            onClick={() => void client.invalidateQueries({ queryKey: root })}
          >
            <RefreshCw
              size={16}
              className={query.isFetching ? "fl-spin" : undefined}
            />
          </button>
          <button
            className="fl-button fl-primary"
            disabled={busy || jobRunning || !query.data?.statistics.total}
            onClick={() => {
              mutation.reset();
              setExportScope("all");
            }}
          >
            <Archive size={16} />
            Tout télécharger
          </button>
        </div>
      </header>
      {notice && (
        <p role="status" className="fl-notice">
          <Check size={15} />
          {notice}
          <button
            className="fl-icon"
            aria-label="Masquer le message"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </p>
      )}
      {error && !deleteItem && !exportScope && (
        <p className="fl-alert" role="alert">
          {error}
        </p>
      )}
      <div className="fl-stats">
        <button
          onClick={() => {
            setKind("all");
            setRecent(false);
            setModule("");
          }}
          aria-pressed={kind === "all" && !recent}
        >
          <Files size={18} />
          <span>
            <strong>{query.data?.statistics.total ?? "—"}</strong>Éléments
            accessibles
          </span>
        </button>
        <button
          onClick={() => {
            setKind("file");
            setRecent(false);
          }}
          aria-pressed={kind === "file" && !recent}
        >
          <FolderOpen size={18} />
          <span>
            <strong>{query.data?.statistics.files ?? "—"}</strong>Fichiers
            enregistrés
          </span>
        </button>
        <button
          onClick={() => {
            setKind("link");
            setRecent(false);
          }}
          aria-pressed={kind === "link" && !recent}
        >
          <Link2 size={18} />
          <span>
            <strong>{query.data?.statistics.links ?? "—"}</strong>Liens externes
          </span>
        </button>
        <button
          onClick={() => {
            setRecent((v) => !v);
            setKind("all");
          }}
          aria-pressed={recent}
        >
          <Clock3 size={18} />
          <span>
            <strong>{query.data?.statistics.recent ?? "—"}</strong>Ajoutés ces 7
            jours
          </span>
        </button>
      </div>
      <section className="fl-panel">
        <div className="fl-toolbar">
          <label className="fl-search">
            <Search size={16} />
            <input
              aria-label="Rechercher un fichier"
              placeholder="Nom du fichier, agent, dossier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="fl-icon"
                aria-label="Effacer la recherche"
                onClick={() => setSearch("")}
              >
                <X size={14} />
              </button>
            )}
          </label>
          <label className="fl-filter">
            <span>Origine</span>
            <select value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="">Tous les modules</option>
              {query.data?.modules.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} ({m.count})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="fl-list-header">
          <span aria-live="polite">
            {query.data?.pagination.total ?? 0} résultat(s)
            {selected.length ? ` · ${selected.length} sélectionné(s)` : ""}
          </span>
          <div className="fl-actions">
            {selected.length > 0 && (
              <>
                <button
                  className="fl-button"
                  disabled={busy || jobRunning}
                  onClick={() => {
                    mutation.reset();
                    setExportScope("selection");
                  }}
                >
                  <ArrowDownToLine size={15} />
                  Télécharger la sélection
                </button>
                <button
                  className="fl-icon"
                  aria-label="Annuler la sélection"
                  title="Annuler la sélection"
                  onClick={() => setSelected([])}
                >
                  <X size={15} />
                </button>
              </>
            )}
            {query.data && (
              <small>
                Volume connu : {bytes(query.data.statistics.bytes)} · certains
                fichiers n’ont pas de taille renseignée
              </small>
            )}
          </div>
        </div>
        {query.isPending ? (
          <p className="fl-empty" role="status">
            <LoaderCircle className="fl-spin" size={18} /> Recherche de vos
            fichiers…
          </p>
        ) : !shown.length ? (
          <div className="fl-empty">
            <FolderOpen size={28} />
            <strong>Aucun fichier à afficher</strong>
            <span>
              Modifiez les filtres ou ajoutez un document dans un module de la
              plateforme.
            </span>
          </div>
        ) : (
          <div className="fl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Sélectionner les fichiers de cette page"
                      checked={allChecked}
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [
                                ...new Set([
                                  ...current,
                                  ...shown.map((f) => f.id),
                                ]),
                              ]
                            : current.filter(
                                (id) => !shown.some((f) => f.id === id),
                              ),
                        )
                      }
                    />
                  </th>
                  <th>Fichier</th>
                  <th>Origine</th>
                  <th>Ajouté le</th>
                  <th>
                    <span className="fl-sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner ${item.name}`}
                        checked={selected.includes(item.id)}
                        onChange={(e) =>
                          setSelected((current) =>
                            e.target.checked
                              ? [...current, item.id]
                              : current.filter((id) => id !== item.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="fl-file-name"
                        onClick={() => setDetail(item)}
                      >
                        <span className="fl-file-icon">
                          <FileIcon item={item} />
                        </span>
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {item.kind === "link"
                              ? "Lien externe"
                              : bytes(item.bytes)}
                            {item.owner ? ` · ${item.owner}` : ""}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      {item.modules.map((m) => (
                        <span className="fl-badge" key={m}>
                          {label(m)}
                        </span>
                      ))}
                      {item.uses > 1 && (
                        <small className="fl-uses">
                          Utilisé à {item.uses} endroits
                        </small>
                      )}
                    </td>
                    <td>{date(item.createdAt)}</td>
                    <td>
                      <div className="fl-actions">
                        <button
                          className="fl-icon"
                          title="Voir les détails"
                          aria-label={`Voir ${item.name}`}
                          onClick={() => setDetail(item)}
                        >
                          <Eye size={16} />
                        </button>
                        <a
                          className="fl-icon"
                          href={api.downloadUrl(`${item.id}/download`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Télécharger"
                          aria-label={`Télécharger ${item.name}`}
                        >
                          <ArrowDownToLine size={16} />
                        </a>
                        <button
                          className="fl-icon fl-danger"
                          title="Supprimer partout"
                          aria-label={`Supprimer ${item.name}`}
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const data = await api.previewDelete(item.id);
                              setConfirm(false);
                              setDeleteItem(data);
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="fl-pagination">
          <span>
            Page {page} sur {query.data?.pagination.totalPages ?? 1}
          </span>
          <div className="fl-actions">
            <button
              className="fl-icon"
              aria-label="Page précédente"
              disabled={page === 1 || query.isFetching}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="fl-icon"
              aria-label="Page suivante"
              disabled={
                !query.data ||
                page >= query.data.pagination.totalPages ||
                query.isFetching
              }
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </footer>
      </section>
      {!!jobs.data?.length && (
        <section className="fl-panel">
          <h3>Vos téléchargements groupés</h3>
          <p className="fl-help">
            Les copies sont disponibles 24 heures. Pour tout conserver en local,
            téléchargez chaque volume et consultez le bilan du dernier volume.
          </p>
          {jobs.data.map((job) => (
            <article key={job.id} className="fl-job">
              <Archive size={18} />
              <div>
                <strong>
                  {job.status === "RUNNING"
                    ? "Préparation en cours…"
                    : job.status === "COMPLETED"
                      ? "Votre copie est prête"
                      : "Préparation interrompue"}
                </strong>
                <p role="status">
                  {job.status === "RUNNING"
                    ? `${job.processed} sur ${job.total} élément(s) traité(s)`
                    : job.message}
                </p>
                {job.status === "RUNNING" && (
                  <progress
                    value={job.processed}
                    max={job.total}
                    aria-label="Préparation du téléchargement"
                  />
                )}
                {job.status === "COMPLETED" && (
                  <div className="fl-actions">
                    {job.parts.map((part) => (
                      <a
                        className="fl-button"
                        key={part.id}
                        href={api.downloadUrl(`exports/${job.id}/${part.id}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ArrowDownToLine size={15} />
                        {part.name} · {bytes(part.bytes)}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
      {!!query.data?.pending.length && (
        <section className="fl-panel">
          <h3>Suppressions du stockage en attente</h3>
          <p className="fl-help">
            Ces fichiers sont déjà retirés des modules. Le stockage distant sera
            nettoyé automatiquement.
          </p>
          {query.data.pending.map((p) => (
            <div className="fl-pending" key={p.id}>
              <span>{p.name}</span>
              <button
                className="fl-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api.retry(p.id);
                    setNotice("La suppression a été relancée.");
                  })
                }
              >
                <RefreshCw size={14} />
                Réessayer
              </button>
            </div>
          ))}
        </section>
      )}
      {!!query.data?.audit.length && (
        <details className="fl-panel">
          <summary>Activité récente</summary>
          <ul className="fl-audit">
            {query.data.audit.map((e) => (
              <li key={e.id}>
                <strong>
                  {(
                    {
                      DELETE: "Suppression",
                      EXPORT: "Copie préparée",
                      DOWNLOAD: "Téléchargement demandé",
                      DOWNLOAD_EXPORT: "Volume téléchargé",
                      VIEW: "Consultation",
                    } as Record<string, string>
                  )[e.action] ?? "Action"}
                </strong>{" "}
                · {e.name}
                <small>
                  {e.actor} · {date(e.createdAt)}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="fl-help">
        Les fichiers déjà déposés sont recensés automatiquement. Les bulletins
        et rapports générés à la demande apparaissent ici lorsqu’ils ont été
        partagés et enregistrés dans une communication. Les sauvegardes
        chiffrées restent dans leur espace dédié.
      </p>
      {detail && (
        <Dialog
          title="Détails du fichier"
          busy={busy}
          onClose={() => setDetail(null)}
        >
          <div className="fl-detail">
            <FileIcon item={detail} />
            <strong>{detail.name}</strong>
            <p>
              {detail.kind === "link"
                ? "Lien vers un hébergeur externe. La suppression retirera le lien de la plateforme ; elle ne supprimera pas le fichier chez cet hébergeur."
                : "Fichier enregistré dans le stockage de la plateforme."}
            </p>
          </div>
          <h4>Présent dans</h4>
          <ul className="fl-locations">
            {detail.locations.map((l, i) => (
              <li key={i}>
                <span>
                  {label(l.module)}
                  {l.title ? ` · ${l.title}` : ""}
                </span>
                <Link to={l.route} onClick={() => setDetail(null)}>
                  Ouvrir le module
                  <ExternalLink size={13} />
                </Link>
              </li>
            ))}
          </ul>
          <footer>
            <a
              className="fl-button fl-primary"
              href={api.downloadUrl(`${detail.id}/download`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ArrowDownToLine size={15} />
              Télécharger
            </a>
            {detail.kind === "file" &&
              [
                "application/pdf",
                "image/png",
                "image/jpeg",
                "image/webp",
              ].includes(detail.mime) && (
                <button
                  className="fl-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const url = await api.previewFile(detail);
                      setPreview({ item: detail, url });
                      setDetail(null);
                    })
                  }
                >
                  <Eye size={15} />
                  Aperçu
                </button>
              )}
            <button
              className="fl-button fl-danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const data = await api.previewDelete(detail.id);
                  setDetail(null);
                  setConfirm(false);
                  setDeleteItem(data);
                })
              }
            >
              <Trash2 size={15} />
              Supprimer partout
            </button>
          </footer>
        </Dialog>
      )}
      {deleteItem && (
        <Dialog
          title="Supprimer ce fichier partout ?"
          busy={busy}
          onClose={() => setDeleteItem(null)}
        >
          <p className="fl-detail">
            <strong>{deleteItem.name}</strong>
          </p>
          <p className="fl-help">
            Cette action retire le fichier de {deleteItem.uses} emplacement(s)
            dans la plateforme. Les dossiers, messages et décisions sont
            conservés. Les copies déjà téléchargées sur un ordinateur ne sont
            pas supprimées.
          </p>
          <ul className="fl-locations">
            {deleteItem.locations.map((l, i) => (
              <li key={i}>
                {label(l.module)}
                {l.title ? ` · ${l.title}` : ""}
              </li>
            ))}
          </ul>
          {deleteItem.kind === "link" && (
            <p className="fl-alert">
              Ce lien sera retiré de la plateforme. Le fichier chez son
              hébergeur externe sera conservé.
            </p>
          )}
          {error && (
            <p role="alert" className="fl-alert">
              {error}
            </p>
          )}
          <label className="fl-confirm">
            <input
              type="checkbox"
              checked={confirm}
              disabled={busy}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            Je confirme la suppression dans les modules indiqués.
          </label>
          <footer>
            <button
              className="fl-button"
              disabled={busy}
              onClick={() => setDeleteItem(null)}
            >
              Conserver
            </button>
            <button
              className="fl-button fl-delete"
              disabled={busy || !confirm}
              onClick={() =>
                void run(async () => {
                  const result = await api.remove(
                    deleteItem.id,
                    deleteItem.token,
                  );
                  setNotice(result.message);
                  setSelected((s) => s.filter((id) => id !== deleteItem.id));
                  setDeleteItem(null);
                  setPage(1);
                })
              }
            >
              {busy ? (
                <LoaderCircle size={15} className="fl-spin" />
              ) : (
                <Trash2 size={15} />
              )}
              Supprimer partout
            </button>
          </footer>
        </Dialog>
      )}
      {exportScope && (
        <Dialog
          title={
            exportScope === "all"
              ? "Conserver tous les fichiers en local"
              : "Télécharger la sélection"
          }
          busy={busy}
          onClose={() => setExportScope(null)}
        >
          <p className="fl-help">
            {exportScope === "all"
              ? `Préparer les ${query.data?.statistics.total ?? 0} éléments de votre organisation, quels que soient les filtres affichés.`
              : `Préparer les ${selected.length} éléments sélectionnés.`}{" "}
            Les fichiers sont regroupés par module et répartis en volumes ZIP
            pour faciliter leur téléchargement.
          </p>
          <p className="fl-help">
            Certains liens externes peuvent nécessiter une connexion chez leur
            hébergeur. Le bilan dans la copie indique précisément les éléments
            inclus et ceux qui n’ont pas pu être récupérés. Aucun élément
            indisponible n’est annoncé comme téléchargé.
          </p>
          {error && (
            <p role="alert" className="fl-alert">
              {error}
            </p>
          )}
          <footer>
            <button
              className="fl-button"
              disabled={busy}
              onClick={() => setExportScope(null)}
            >
              Annuler
            </button>
            <button
              className="fl-button fl-primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api.prepare(
                    {},
                    exportScope === "selection" ? selected : undefined,
                  );
                  setNotice(result.message);
                  setExportScope(null);
                })
              }
            >
              {busy ? (
                <LoaderCircle size={15} className="fl-spin" />
              ) : (
                <Archive size={15} />
              )}
              Préparer ma copie
            </button>
          </footer>
        </Dialog>
      )}
      {preview && (
        <Dialog
          title={preview.item.name}
          busy={false}
          onClose={() => setPreview(null)}
        >
          {preview.item.mime.startsWith("image/") ? (
            <img
              className="fl-image"
              src={preview.url}
              alt={preview.item.name}
            />
          ) : (
            <iframe
              className="fl-pdf"
              title={preview.item.name}
              src={preview.url}
            />
          )}
        </Dialog>
      )}
    </section>
  );
}
