import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type SubmitEvent,
  } from "react";
  import axios from "axios";
  import {
    ArchiveRestore,
    CalendarClock,
    Download,
    Eye,
    FileSpreadsheet,
    FileText,
    Image as ImageIcon,
    LoaderCircle,
    Plus,
    Search,
    ShieldCheck,
    Trash2,
    UploadCloud,
    X,
    type LucideIcon,
  } from "lucide-react";
  import {
    useMutation,
    useQuery,
    useQueryClient,
  } from "@tanstack/react-query";
  import { getApiErrorMessage } from "../../features/auth/auth.api";
  import {
    archiveAgentDocument,
    downloadAgentDocument,
    getAgentDocumentBlob,
    getAgentDocuments,
    restoreAgentDocument,
    uploadAgentDocument,
  } from "../../features/agent-documents/agent-document.api";
  import type {
    AgentDocument,
    AgentDocumentCategory,
    AgentDocumentExpiryFilter,
    AgentDocumentStatus,
    UploadAgentDocumentInput,
  } from "../../features/agent-documents/agent-document.types";
  import AgentDocumentPreviewModal from "./AgentDocumentPreviewModal";
  import "./agent-documents-panel.css";
  
  type AgentDocumentsPanelProps = {
    agentId: string;
    canManageAgents: boolean;
  };
  
  type UploadFormState = {
    title: string;
    category: AgentDocumentCategory;
    expiresAt: string;
  };
  
  type PreviewState = {
    agentDocument: AgentDocument;
    blobUrl: string;
  };
  
  const maximumFileSize = 10 * 1024 * 1024;
  
  const acceptedExtensions = [
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
  ];
  
  const categoryLabels: Record<AgentDocumentCategory, string> = {
    CONTRACT: "Contrat",
    ASSIGNMENT_DECISION: "Décision d'affectation",
    DIPLOMA: "Diplôme",
    IDENTITY_DOCUMENT: "Pièce d'identité",
    CERTIFICATE: "Attestation",
    OTHER: "Autre document",
  };
  
  const initialFormState: UploadFormState = {
    title: "",
    category: "CONTRACT",
    expiresAt: "",
  };
  
  function formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} o`;
    }
  
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} Ko`;
    }
  
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }
  
  function formatDate(value?: string): string {
    if (!value) {
      return "Non renseignée";
    }
  
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(value));
  }
  
  function getFileNameWithoutExtension(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, "");
  }
  
  function getExtension(fileName: string): string {
    return fileName.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? "";
  }
  
  function getFileIcon(mimeType: string): LucideIcon {
    if (mimeType.startsWith("image/")) {
      return ImageIcon;
    }
  
    if (
      mimeType.includes("excel") ||
      mimeType.includes("spreadsheet")
    ) {
      return FileSpreadsheet;
    }
  
    return FileText;
  }
  
  function isPreviewable(mimeType: string): boolean {
    return (
      mimeType === "application/pdf" ||
      mimeType.startsWith("image/")
    );
  }
  
  function getExpiryMeta(expiresAt?: string): {
    label: string;
    className: string;
  } {
    if (!expiresAt) {
      return {
        label: "Sans échéance",
        className: "is-no-expiry",
      };
    }
  
    const now = new Date();
    const expiryDate = new Date(expiresAt);
  
    const differenceInDays = Math.ceil(
      (expiryDate.getTime() - now.getTime()) /
        (1000 * 60 * 60 * 24),
    );
  
    if (differenceInDays < 0) {
      return {
        label: "Document expiré",
        className: "is-expired",
      };
    }
  
    if (differenceInDays <= 30) {
      return {
        label: `Expire le ${formatDate(expiresAt)}`,
        className: "is-expiring",
      };
    }
  
    return {
      label: `Valide jusqu’au ${formatDate(expiresAt)}`,
      className: "is-valid",
    };
  }
  
  function validateSelectedFile(file: File): string | null {
    const extension = getExtension(file.name);
  
    if (!acceptedExtensions.includes(extension)) {
      return "Format non autorisé. Utilisez PDF, image, Word ou Excel.";
    }
  
    if (file.size > maximumFileSize) {
      return "Le fichier dépasse la taille maximale autorisée de 10 Mo.";
    }
  
    return null;
  }
  
  async function resolveBlobErrorMessage(
    error: unknown,
  ): Promise<string> {
    if (
      axios.isAxiosError(error) &&
      error.response?.data instanceof Blob
    ) {
      try {
        const errorText = await error.response.data.text();
  
        const parsed = JSON.parse(errorText) as {
          error?: {
            message?: string;
          };
        };
  
        return (
          parsed.error?.message ??
          "Impossible de récupérer le document."
        );
      } catch {
        return "Impossible de récupérer le document.";
      }
    }
  
    return getApiErrorMessage(error);
  }
  
  export default function AgentDocumentsPanel({
    agentId,
    canManageAgents,
  }: AgentDocumentsPanelProps) {
    const queryClient = useQueryClient();
  
    const fileInputRef = useRef<HTMLInputElement>(null);
  
    const previewBlobUrlRef = useRef<string | null>(null);
  
    const uploadProgressFrameRef = useRef<number | null>(null);
  
    const pendingUploadProgressRef = useRef(0);
  
    const [activeStatus, setActiveStatus] =
      useState<AgentDocumentStatus>("ACTIVE");
  
    const [searchInput, setSearchInput] = useState("");
  
    const [debouncedSearch, setDebouncedSearch] = useState("");
  
    const [categoryFilter, setCategoryFilter] =
      useState<"" | AgentDocumentCategory>("");
  
    const [expiryFilter, setExpiryFilter] =
      useState<AgentDocumentExpiryFilter>("ALL");
  
    const [isUploadOpen, setIsUploadOpen] = useState(false);
  
    const [selectedFile, setSelectedFile] =
      useState<File | null>(null);
  
    const [formState, setFormState] =
      useState<UploadFormState>(initialFormState);
  
    const [clientError, setClientError] =
      useState<string | null>(null);
  
    const [actionError, setActionError] =
      useState<string | null>(null);
  
    const [uploadProgress, setUploadProgress] = useState(0);
  
    const [documentToArchive, setDocumentToArchive] =
      useState<AgentDocument | null>(null);
  
    const [preview, setPreview] =
      useState<PreviewState | null>(null);
  
    const invalidateDocuments = useCallback(
      async (): Promise<void> => {
        await queryClient.invalidateQueries({
          queryKey: ["agent-documents", agentId],
        });
      },
      [agentId, queryClient],
    );
  
    const revokePreviewBlobUrl = useCallback((): void => {
      const blobUrl = previewBlobUrlRef.current;
  
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
  
      previewBlobUrlRef.current = null;
    }, []);
  
    const updateUploadProgress = useCallback(
      (progress: number): void => {
        pendingUploadProgressRef.current = Math.min(
          100,
          Math.max(0, progress),
        );
  
        if (uploadProgressFrameRef.current !== null) {
          return;
        }
  
        uploadProgressFrameRef.current =
          window.requestAnimationFrame(() => {
            setUploadProgress(pendingUploadProgressRef.current);
  
            uploadProgressFrameRef.current = null;
          });
      },
      [],
    );
  
    useEffect(() => {
      const timeoutId = window.setTimeout(() => {
        setDebouncedSearch(searchInput.trim());
      }, 350);
  
      return () => {
        window.clearTimeout(timeoutId);
      };
    }, [searchInput]);
  
    useEffect(() => {
      return () => {
        revokePreviewBlobUrl();
  
        if (uploadProgressFrameRef.current !== null) {
          window.cancelAnimationFrame(
            uploadProgressFrameRef.current,
          );
        }
      };
    }, [revokePreviewBlobUrl]);
  
    const documentsQuery = useQuery({
      queryKey: [
        "agent-documents",
        agentId,
        activeStatus,
        debouncedSearch,
        categoryFilter,
        expiryFilter,
      ],
  
      queryFn: () =>
        getAgentDocuments(agentId, {
          status: activeStatus,
          search: debouncedSearch || undefined,
          category: categoryFilter || undefined,
          expiry: expiryFilter,
        }),
  
      enabled: Boolean(agentId),
  
      staleTime: 20_000,
  
      gcTime: 5 * 60 * 1000,
  
      placeholderData: (previousData) => previousData,
    });
  
    const uploadMutation = useMutation({
      mutationFn: (input: UploadAgentDocumentInput) =>
        uploadAgentDocument(
          agentId,
          input,
          updateUploadProgress,
        ),
    });
  
    const archiveMutation = useMutation({
      mutationFn: (documentId: string) =>
        archiveAgentDocument(agentId, documentId),
    });
  
    const restoreMutation = useMutation({
      mutationFn: (documentId: string) =>
        restoreAgentDocument(agentId, documentId),
    });
  
    const previewMutation = useMutation({
      mutationFn: (agentDocument: AgentDocument) =>
        getAgentDocumentBlob(
          agentId,
          agentDocument.id,
          "view",
        ),
    });
  
    const downloadMutation = useMutation({
      mutationFn: (agentDocument: AgentDocument) =>
        downloadAgentDocument(agentId, agentDocument),
    });
  
    const documents = documentsQuery.data?.documents ?? [];
  
    const summary = documentsQuery.data?.summary;
  
    const previewingDocumentId = previewMutation.isPending
      ? previewMutation.variables?.id
      : null;
  
    const downloadingDocumentId = downloadMutation.isPending
      ? downloadMutation.variables?.id
      : null;
  
    const restoringDocumentId = restoreMutation.isPending
      ? restoreMutation.variables
      : null;
  
    const archivingDocumentId = archiveMutation.isPending
      ? archiveMutation.variables
      : null;
  
    const apiError = uploadMutation.isError
      ? getApiErrorMessage(uploadMutation.error)
      : archiveMutation.isError
        ? getApiErrorMessage(archiveMutation.error)
        : restoreMutation.isError
          ? getApiErrorMessage(restoreMutation.error)
          : documentsQuery.isError
            ? getApiErrorMessage(documentsQuery.error)
            : null;
  
    const displayedError =
      clientError ?? actionError ?? apiError;
  
    function resetUploadForm(): void {
      setIsUploadOpen(false);
      setSelectedFile(null);
      setFormState(initialFormState);
      setClientError(null);
      setActionError(null);
      setUploadProgress(0);
  
      uploadMutation.reset();
  
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  
    function closePreview(): void {
      revokePreviewBlobUrl();
      setPreview(null);
    }
  
    function resetFilters(): void {
      setSearchInput("");
      setDebouncedSearch("");
      setCategoryFilter("");
      setExpiryFilter("ALL");
    }
  
    function handleFileChange(
      event: ChangeEvent<HTMLInputElement>,
    ): void {
      const file = event.target.files?.[0];
  
      if (!file) {
        return;
      }
  
      const fileError = validateSelectedFile(file);
  
      if (fileError) {
        setSelectedFile(null);
        setClientError(fileError);
  
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
  
        return;
      }
  
      setClientError(null);
      setSelectedFile(file);
  
      setFormState((currentValue) => ({
        ...currentValue,
        title:
          currentValue.title.trim() ||
          getFileNameWithoutExtension(file.name),
      }));
    }
  
    function handleFormChange(
      event: ChangeEvent<
        HTMLInputElement | HTMLSelectElement
      >,
    ): void {
      const { name, value } = event.target;
  
      setFormState((currentValue) => ({
        ...currentValue,
        [name]: value,
      }));
    }
  
    async function handleUpload(
      event: SubmitEvent<HTMLFormElement>,
    ): Promise<void> {
      event.preventDefault();
  
      if (!selectedFile) {
        setClientError("Veuillez sélectionner un fichier.");
  
        return;
      }
  
      uploadMutation.reset();
  
      setClientError(null);
      setActionError(null);
      setUploadProgress(0);
  
      try {
        await uploadMutation.mutateAsync({
          file: selectedFile,
          title: formState.title.trim(),
          category: formState.category,
          expiresAt: formState.expiresAt || undefined,
        });
  
        await invalidateDocuments();
  
        resetUploadForm();
      } catch {
        // L’erreur est affichée par l’interface.
      }
    }
  
    async function handlePreview(
      agentDocument: AgentDocument,
    ): Promise<void> {
      previewMutation.reset();
      setActionError(null);
  
      try {
        revokePreviewBlobUrl();
  
        const blob = await previewMutation.mutateAsync(
          agentDocument,
        );
  
        const blobUrl = URL.createObjectURL(blob);
  
        previewBlobUrlRef.current = blobUrl;
  
        setPreview({
          agentDocument,
          blobUrl,
        });
  
        await invalidateDocuments();
      } catch (error) {
        setActionError(
          await resolveBlobErrorMessage(error),
        );
      }
    }
  
    async function handleDownload(
      agentDocument: AgentDocument,
    ): Promise<void> {
      downloadMutation.reset();
      setActionError(null);
  
      try {
        await downloadMutation.mutateAsync(agentDocument);
  
        await invalidateDocuments();
      } catch (error) {
        setActionError(
          await resolveBlobErrorMessage(error),
        );
      }
    }
  
    async function handleArchive(): Promise<void> {
      if (!documentToArchive) {
        return;
      }
  
      archiveMutation.reset();
      setActionError(null);
  
      try {
        await archiveMutation.mutateAsync(
          documentToArchive.id,
        );
  
        await invalidateDocuments();
  
        setDocumentToArchive(null);
      } catch {
        // L’erreur est affichée par l’interface.
      }
    }
  
    async function handleRestore(
      agentDocument: AgentDocument,
    ): Promise<void> {
      restoreMutation.reset();
      setActionError(null);
  
      try {
        await restoreMutation.mutateAsync(agentDocument.id);
  
        await invalidateDocuments();
      } catch {
        // L’erreur est affichée par l’interface.
      }
    }
  
    const hasActiveFilters =
      Boolean(searchInput.trim()) ||
      Boolean(categoryFilter) ||
      expiryFilter !== "ALL";
  
    return (
      <div className="agent-documents-panel">
        <div className="agent-documents-toolbar">
          <div>
            <span>Gestion documentaire sécurisée</span>
  
            <p>
              Les fichiers sont protégés dans le dossier RH de l’agent.
              Aucun lien Cloudinary n’est exposé.
            </p>
          </div>
  
          {canManageAgents &&
            activeStatus === "ACTIVE" &&
            !isUploadOpen && (
              <button
                className="agent-document-upload-trigger"
                type="button"
                onClick={() => {
                  setActionError(null);
                  setClientError(null);
                  setIsUploadOpen(true);
                }}
              >
                <Plus size={16} />
                <span>Ajouter</span>
              </button>
            )}
        </div>
  
        <div className="agent-document-summary">
          <span>
            Actifs : <strong>{summary?.active ?? 0}</strong>
          </span>
  
          <span>
            Archives : <strong>{summary?.archived ?? 0}</strong>
          </span>
  
          <span className="is-warning">
            Échéances proches :{" "}
            <strong>{summary?.expiringSoon ?? 0}</strong>
          </span>
  
          <span className="is-danger">
            Expirés : <strong>{summary?.expired ?? 0}</strong>
          </span>
        </div>
  
        <div className="agent-document-tabs">
          <button
            type="button"
            className={
              activeStatus === "ACTIVE" ? "is-active" : ""
            }
            onClick={() => setActiveStatus("ACTIVE")}
          >
            Documents actifs
          </button>
  
          <button
            type="button"
            className={
              activeStatus === "ARCHIVED" ? "is-active" : ""
            }
            onClick={() => setActiveStatus("ARCHIVED")}
          >
            Archives
          </button>
        </div>
  
        <div className="agent-document-filters">
          <label className="agent-document-search">
            <Search size={17} />
  
            <input
              value={searchInput}
              onChange={(event) =>
                setSearchInput(event.target.value)
              }
              placeholder="Rechercher un titre ou un fichier..."
            />
          </label>
  
          <select
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(
                event.target.value as
                  | ""
                  | AgentDocumentCategory,
              )
            }
          >
            <option value="">Toutes les catégories</option>
  
            {Object.entries(categoryLabels).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
  
          <select
            value={expiryFilter}
            onChange={(event) =>
              setExpiryFilter(
                event.target
                  .value as AgentDocumentExpiryFilter,
              )
            }
          >
            <option value="ALL">Toutes les échéances</option>
            <option value="EXPIRING_30_DAYS">
              Expire dans 30 jours
            </option>
            <option value="EXPIRED">
              Documents expirés
            </option>
            <option value="NO_EXPIRY">
              Sans échéance
            </option>
          </select>
  
          {hasActiveFilters && (
            <button
              className="agent-document-reset-filters"
              type="button"
              onClick={resetFilters}
            >
              Réinitialiser
            </button>
          )}
        </div>
  
        {isUploadOpen && canManageAgents && (
          <form
            className="agent-document-upload-form"
            onSubmit={handleUpload}
          >
            <header>
              <div>
                <p>AJOUT SÉCURISÉ</p>
                <h6>Déposer un document RH</h6>
              </div>
  
              <button
                className="agent-document-close-button"
                type="button"
                onClick={resetUploadForm}
                disabled={uploadMutation.isPending}
                aria-label="Fermer"
              >
                <X size={17} />
              </button>
            </header>
  
            {displayedError && (
              <div
                className="agent-document-error"
                role="alert"
                aria-live="polite"
              >
                {displayedError}
              </div>
            )}
  
            <div className="agent-document-upload-grid">
              <div className="agent-document-file-control">
                <input
                  ref={fileInputRef}
                  id={`agent-document-file-${agentId}`}
                  className="agent-document-file-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileChange}
                  disabled={uploadMutation.isPending}
                />
  
                <label
                  htmlFor={`agent-document-file-${agentId}`}
                  className="agent-document-file-picker"
                >
                  <UploadCloud size={21} />
  
                  <span>
                    {selectedFile
                      ? selectedFile.name
                      : "Choisir un fichier"}
                  </span>
  
                  <small>
                    PDF, image, Word ou Excel · 10 Mo maximum
                  </small>
                </label>
  
                {selectedFile && (
                  <div className="agent-document-selected-file">
                    <FileText size={17} />
  
                    <span>{formatBytes(selectedFile.size)}</span>
  
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
  
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      disabled={uploadMutation.isPending}
                      aria-label="Retirer le fichier"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
              </div>
  
              <label className="agent-document-form-field">
                <span>Intitulé du document</span>
  
                <input
                  name="title"
                  value={formState.title}
                  onChange={handleFormChange}
                  placeholder="Ex. Contrat de travail signé"
                  disabled={uploadMutation.isPending}
                  required
                />
              </label>
  
              <label className="agent-document-form-field">
                <span>Catégorie</span>
  
                <select
                  name="category"
                  value={formState.category}
                  onChange={handleFormChange}
                  disabled={uploadMutation.isPending}
                >
                  {Object.entries(categoryLabels).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </label>
  
              <label className="agent-document-form-field">
                <span>Date d’expiration éventuelle</span>
  
                <input
                  name="expiresAt"
                  type="date"
                  value={formState.expiresAt}
                  onChange={handleFormChange}
                  disabled={uploadMutation.isPending}
                />
              </label>
            </div>
  
            {uploadMutation.isPending && (
              <div className="agent-document-progress">
                <div>
                  <span>Transfert sécurisé</span>
                  <strong>{uploadProgress}%</strong>
                </div>
  
                <span>
                  <i style={{ width: `${uploadProgress}%` }} />
                </span>
              </div>
            )}
  
            <footer>
              <button
                className="agent-document-cancel-button"
                type="button"
                onClick={resetUploadForm}
                disabled={uploadMutation.isPending}
              >
                Annuler
              </button>
  
              <button
                className="agent-primary-button"
                type="submit"
                disabled={
                  uploadMutation.isPending ||
                  !selectedFile ||
                  !formState.title.trim()
                }
              >
                {uploadMutation.isPending ? (
                  <>
                    <LoaderCircle
                      size={17}
                      className="is-spinning"
                    />
                    <span>Enregistrement sécurisé...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={17} />
                    <span>Enregistrer</span>
                  </>
                )}
              </button>
            </footer>
          </form>
        )}
  
        {displayedError && !isUploadOpen && (
          <div
            className="agent-document-error"
            role="alert"
            aria-live="polite"
          >
            {displayedError}
          </div>
        )}
  
        {documentsQuery.isLoading && (
          <div className="agent-documents-loading">
            <LoaderCircle size={21} className="is-spinning" />
            <span>Chargement des documents...</span>
          </div>
        )}
  
        {!documentsQuery.isLoading &&
          !documentsQuery.isError &&
          documents.length === 0 && (
            <div className="agent-documents-empty">
              <ShieldCheck size={22} />
  
              <div>
                <strong>Aucun document dans cette vue.</strong>
  
                <p>
                  Utilisez la recherche, modifiez les filtres ou ajoutez
                  un document dans le dossier de cet agent.
                </p>
              </div>
            </div>
          )}
  
        {documents.length > 0 && (
          <div className="agent-documents-list">
            {documents.map((agentDocument) => {
              const FileIcon = getFileIcon(
                agentDocument.mimeType,
              );
  
              const expiry = getExpiryMeta(
                agentDocument.expiresAt,
              );
  
              const isPreviewing =
                previewingDocumentId === agentDocument.id;
  
              const isDownloading =
                downloadingDocumentId === agentDocument.id;
  
              const isArchiving =
                archivingDocumentId === agentDocument.id;
  
              const isRestoring =
                restoringDocumentId === agentDocument.id;
  
              return (
                <article
                  key={agentDocument.id}
                  className={`agent-document-card ${
                    agentDocument.status === "ARCHIVED"
                      ? "is-archived"
                      : ""
                  }`}
                >
                  <span className="agent-document-icon">
                    <FileIcon size={21} />
                  </span>
  
                  <div className="agent-document-main">
                    <div className="agent-document-title-row">
                      <strong>{agentDocument.title}</strong>
  
                      <span className="agent-document-category">
                        {categoryLabels[agentDocument.category]}
                      </span>
                    </div>
  
                    <p>
                      {agentDocument.originalFileName} ·{" "}
                      {formatBytes(agentDocument.bytes)}
                    </p>
  
                    <div className="agent-document-meta">
                      <span>
                        Ajouté le{" "}
                        {formatDate(agentDocument.createdAt)}
                      </span>
  
                      <span>
                        Consulté {agentDocument.viewCount} fois
                      </span>
  
                      <span>
                        Téléchargé{" "}
                        {agentDocument.downloadCount} fois
                      </span>
  
                      {agentDocument.status === "ACTIVE" && (
                        <span
                          className={`agent-document-expiry ${expiry.className}`}
                        >
                          <CalendarClock size={14} />
                          {expiry.label}
                        </span>
                      )}
  
                      {agentDocument.status === "ARCHIVED" && (
                        <span className="agent-document-archived-label">
                          Archivé le{" "}
                          {formatDate(agentDocument.archivedAt)}
                        </span>
                      )}
                    </div>
                  </div>
  
                  <div className="agent-document-actions">
                    {isPreviewable(agentDocument.mimeType) && (
                      <button
                        type="button"
                        title="Aperçu sécurisé"
                        onClick={() =>
                          void handlePreview(agentDocument)
                        }
                        disabled={previewMutation.isPending}
                      >
                        {isPreviewing ? (
                          <LoaderCircle
                            size={17}
                            className="is-spinning"
                          />
                        ) : (
                          <Eye size={17} />
                        )}
                      </button>
                    )}
  
                    <button
                      type="button"
                      title="Télécharger"
                      onClick={() =>
                        void handleDownload(agentDocument)
                      }
                      disabled={downloadMutation.isPending}
                    >
                      {isDownloading ? (
                        <LoaderCircle
                          size={17}
                          className="is-spinning"
                        />
                      ) : (
                        <Download size={17} />
                      )}
                    </button>
  
                    {canManageAgents &&
                      agentDocument.status === "ACTIVE" && (
                        <button
                          className="is-danger"
                          type="button"
                          title="Archiver le document"
                          onClick={() =>
                            setDocumentToArchive(agentDocument)
                          }
                          disabled={archiveMutation.isPending}
                        >
                          {isArchiving ? (
                            <LoaderCircle
                              size={17}
                              className="is-spinning"
                            />
                          ) : (
                            <Trash2 size={17} />
                          )}
                        </button>
                      )}
  
                    {canManageAgents &&
                      agentDocument.status === "ARCHIVED" && (
                        <button
                          className="is-restore"
                          type="button"
                          title="Restaurer le document"
                          onClick={() =>
                            void handleRestore(agentDocument)
                          }
                          disabled={restoreMutation.isPending}
                        >
                          {isRestoring ? (
                            <LoaderCircle
                              size={17}
                              className="is-spinning"
                            />
                          ) : (
                            <ArchiveRestore size={17} />
                          )}
                        </button>
                      )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
  
        {documentToArchive && (
          <div className="agent-document-archive-confirmation">
            <div>
              <strong>Archiver ce document ?</strong>
  
              <p>
                « {documentToArchive.title} » restera conservé dans les
                archives RH et pourra être restauré.
              </p>
            </div>
  
            <div>
              <button
                type="button"
                onClick={() => setDocumentToArchive(null)}
                disabled={archiveMutation.isPending}
              >
                Annuler
              </button>
  
              <button
                className="agent-document-danger-button"
                type="button"
                onClick={() => void handleArchive()}
                disabled={archiveMutation.isPending}
              >
                {archiveMutation.isPending ? (
                  <>
                    <LoaderCircle
                      size={16}
                      className="is-spinning"
                    />
                    <span>Archivage...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Archiver</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
  
        {preview && (
          <AgentDocumentPreviewModal
            document={preview.agentDocument}
            blobUrl={preview.blobUrl}
            onClose={closePreview}
            onDownload={() =>
              handleDownload(preview.agentDocument)
            }
          />
        )}
      </div>
    );
  }