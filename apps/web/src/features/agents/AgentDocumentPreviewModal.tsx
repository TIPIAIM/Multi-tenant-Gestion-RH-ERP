import {
    Download,
    FileText,
     X,
  } from "lucide-react";
  import type {
    AgentDocument,
  } from "../../features/agent-documents/agent-document.types";
  import "./agent-documents-panel.css";
  
  type AgentDocumentPreviewModalProps = {
    document: AgentDocument;
    blobUrl: string;
    onClose: () => void;
    onDownload: () => Promise<void>;
  };
  
  export default function AgentDocumentPreviewModal({
    document,
    blobUrl,
    onClose,
    onDownload,
  }: AgentDocumentPreviewModalProps) {
    const isPdf =
      document.mimeType === "application/pdf";
  
    const isImage = document.mimeType.startsWith("image/");
  
    return (
      <div className="agent-preview-layer">
        <button
          className="agent-preview-backdrop"
          type="button"
          aria-label="Fermer l’aperçu"
          onClick={onClose}
        />
  
        <section
          className="agent-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Aperçu de ${document.title}`}
        >
          <header className="agent-preview-header">
            <div>
              <span>APERÇU SÉCURISÉ</span>
              <h4>{document.title}</h4>
              <p>{document.originalFileName}</p>
            </div>
  
            <div>
              <button
                className="agent-preview-download-button"
                type="button"
                onClick={() => void onDownload()}
              >
                <Download size={17} />
                <span>Télécharger</span>
              </button>
  
              <button
                className="agent-preview-close-button"
                type="button"
                aria-label="Fermer"
                onClick={onClose}
              >
                <X size={19} />
              </button>
            </div>
          </header>
  
          <div className="agent-preview-content">
            {isPdf && (
              <iframe
                src={blobUrl}
                title={document.title}
                className="agent-preview-pdf"
              />
            )}
  
            {isImage && (
              <img
                src={blobUrl}
                alt={document.title}
                className="agent-preview-image"
              />
            )}
  
            {!isPdf && !isImage && (
              <div className="agent-preview-fallback">
                <FileText size={36} />
  
                <h5>Aperçu non disponible</h5>
  
                <p>
                  Ce type de document est protégé et doit être téléchargé
                  pour être consulté dans son application dédiée.
                </p>
  
                <button
                  className="agent-primary-button"
                  type="button"
                  onClick={() => void onDownload()}
                >
                  <Download size={17} />
                  <span>Télécharger le document</span>
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }