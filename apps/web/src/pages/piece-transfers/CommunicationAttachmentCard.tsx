import CommunicationAudioAttachment from "./CommunicationAudioAttachment";
import { useEffect, useRef, useState } from "react";
import { Download, Eye, FileImage, FileSpreadsheet, FileText, LoaderCircle, X } from "lucide-react";
import { useAuth } from "../../features/auth/auth.context";
import { getCommunicationAttachmentPreview } from "../../features/piece-transfers/piece-transfer.api";

type Attachment = {
  originalFileName: string; mimeType?: string; bytes?: number; status?: string;
  canView: boolean; canDownload: boolean;
};
function sizeLabel(bytes?: number) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
const safeImages = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export default function CommunicationAttachmentCard({ attachment, transferId, messageId, index = 0,
  busy, pending, onView, onDownload,
}: {
  attachment: Attachment; transferId: string; messageId?: string; index?: number;
  pending?: boolean; busy?: "VIEW" | "DOWNLOAD" | null; onView: () => void; onDownload: () => void;
}) {
  const { user } = useAuth();
  const image = safeImages.has(attachment.mimeType ?? "");
  const deleted = attachment.status === "DELETED";
  const cardRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const key = `${user?.id}:${transferId}:${messageId ?? "root"}:${index}`;
  const url = preview?.key === key && !previewFailed && !deleted && attachment.canView ? preview.url : null;
  const extension = attachment.originalFileName.split(".").pop()?.toUpperCase() ?? "FICHIER";
  const Icon = image ? FileImage : ["XLS", "XLSX", "CSV"].includes(extension) ? FileSpreadsheet : FileText;

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "150px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [key]);

  useEffect(() => {
    setPreviewFailed(false); setZoom(false);
    if (!visible || !image || deleted || !attachment.canView || !user?.id) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void getCommunicationAttachmentPreview(transferId, messageId, index, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      if (!safeImages.has(blob.type)) { setPreviewFailed(true); return; }
      objectUrl = URL.createObjectURL(blob);
      setPreview({ key, url: objectUrl });
    }).catch(() => { if (!controller.signal.aborted) setPreviewFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visible, image, deleted, attachment.canView, transferId, messageId, index, user?.id, key]);

  useEffect(() => {
    if (!zoom || !url) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, [zoom, url]);

  if ((attachment.mimeType ?? "").startsWith("audio/")) return <CommunicationAudioAttachment transferId={transferId} messageId={messageId} index={index} attachment={attachment} onDownload={onDownload}/>;

  return <div ref={cardRef} className={`communication-attachment-card ${image ? "is-image" : "is-document"} ${deleted ? "is-deleted" : ""}`}>
    <button type="button" className="communication-attachment-main" disabled={deleted || !attachment.canView || Boolean(busy || pending)}
      aria-label={`${image && url ? "Agrandir" : "Ouvrir"} ${attachment.originalFileName}`}
      onClick={() => image && url ? setZoom(true) : onView()}>
      {image && url ? <img className="communication-attachment-image" src={url} alt={attachment.originalFileName} loading="lazy" onError={() => setPreviewFailed(true)} />
        : <span className={`communication-attachment-icon file-${extension.toLowerCase()}`}><Icon size={25} aria-hidden="true" />
          {busy === "VIEW" && <LoaderCircle size={14} className="is-spinning" />}</span>}
      <span className="communication-attachment-copy"><strong>{attachment.originalFileName}</strong>
        <small>{deleted ? "Fichier supprimé" : `${extension} · ${sizeLabel(attachment.bytes)}`}</small>
        {!deleted && <span>{image && url ? "Agrandir l’image" : previewFailed ? "Aperçu indisponible · Ouvrir" : "Ouvrir le fichier"}</span>}
      </span>
    </button>
    <button className="communication-attachment-download" type="button" disabled={deleted || !attachment.canDownload || Boolean(busy || pending)}
      onClick={onDownload} aria-label={`Télécharger ${attachment.originalFileName}`} title={`Télécharger ${attachment.originalFileName}`}>
      {busy === "DOWNLOAD" ? <LoaderCircle size={18} className="is-spinning" /> : <Download size={18} />}
    </button>
    {zoom && url && <dialog ref={dialogRef} className="communication-image-dialog" aria-label={`Aperçu de ${attachment.originalFileName}`}
      onKeyDown={event => { if (event.key === "Tab" || event.key === "Escape") event.stopPropagation(); }}
      onCancel={() => setZoom(false)} onClick={event => { if (event.target === event.currentTarget) setZoom(false); }}>
      <header><strong>{attachment.originalFileName}</strong><button type="button" autoFocus onClick={() => setZoom(false)} aria-label="Fermer l’aperçu"><X size={20} /></button></header>
      <img src={url} alt={attachment.originalFileName} />
      <footer><span>{sizeLabel(attachment.bytes)}</span>
        <button type="button" onClick={onView}><Eye size={16} />Ouvrir</button>
        {attachment.canDownload && <button type="button" disabled={Boolean(busy || pending)} onClick={onDownload}><Download size={16} />Télécharger</button>}
      </footer>
    </dialog>}
  </div>;
}
