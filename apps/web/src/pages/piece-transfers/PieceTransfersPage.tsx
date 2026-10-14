import CommunicationAdminReadStats from "./CommunicationAdminReadStats";
import { useSearchParams } from "react-router-dom";
import { usePieceTransferNotifications } from "../../features/piece-transfers/use-piece-transfer-notifications";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BarChart3,
  Check,
  Download,
  Eye,
  FileText,
  Inbox,
  LoaderCircle,
  MessageCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  useIsFetching,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createPieceTransfer,
  deleteMessageFileAsAdmin,
  deletePieceTransferMessageAsAdmin,
  deleteTransferRootFileAsAdmin,
  downloadPieceTransferFile,
  downloadPieceTransferMessageFile,
  getAdminCommunicationFiles,
  getAdminCommunicationMessages,
  getAdminCommunicationOverview,
  getPieceTransferNotifications,
  getPieceTransferInbox,
  getPieceTransferSent,
  getPieceTransferStats,
  getMyCommunicationFiles,
  getMyCommunicationMessages,
  revokePieceTransfer,
  viewPieceTransferFile,
  viewPieceTransferMessageFile,
} from "../../features/piece-transfers/piece-transfer.api";
import type {
  CreatePieceTransferInput,
  PieceTransferAdminFile,
  PieceTransferAdminMessage,
  PieceTransferListItem,
} from "../../features/piece-transfers/piece-transfer.types";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import { useAuth } from "../../features/auth/auth.context";
import PieceTransferComposer from "./PieceTransferComposer";
import PieceTransferDetailsDrawer from "./PieceTransferDetailsDrawer";
import "./piece-transfers-page.css";

type UserFilter = "ALL" | "INBOX" | "SENT" | "UNREAD";
type Workspace = "CHATS" | "ADMIN" | "FILES" | "MESSAGES";
type AdminView = "STATS" | "MESSAGES" | "FILES";

function formatBytes(value?: number): string {
  if (!value) return "";
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatShortDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();

  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatDateTime(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "C";
}

function useDebouncedSearch(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [value]);
  return debounced;
}

export default function PieceTransfersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "TENANT_ADMIN";
  const [searchParams, setSearchParams] = useSearchParams();
  const notificationsQuery = usePieceTransferNotifications();


  const [workspace, setWorkspace] = useState<Workspace>("CHATS");
  const [filter, setFilterState] = useState<UserFilter>(searchParams.get("unread") === "1" ? "UNREAD" : "ALL");
  function setFilter(next: UserFilter) {
    setFilterState(next);
    setSearchParams(current => {
      const params = new URLSearchParams(current);
      if (next === "UNREAD") params.set("unread", "1"); else params.delete("unread");
      return params;
    }, { replace: true });
  }
  useEffect(() => {
    if (searchParams.get("unread") === "1") {
      setFilterState("UNREAD"); setWorkspace("CHATS"); setSearch("");
    } else {
      setFilterState(current => current === "UNREAD" ? "ALL" : current);
    }
  }, [searchParams]);
  const [adminView, setAdminView] = useState<AdminView>("STATS");
  const [search, setSearch] = useState("");
  const [adminSearch, setAdminSearch] = useState("");
  const [fileDirection, setFileDirection] = useState<"SENT" | "INBOX">("INBOX");
  const [filesSearch, setFilesSearch] = useState("");
  const [filesPage, setFilesPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const debouncedSearch = useDebouncedSearch(search);
  const debouncedAdminSearch = useDebouncedSearch(adminSearch);
  const debouncedFilesSearch = useDebouncedSearch(filesSearch);
  const [adminPage, setAdminPage] = useState(1);
  const [composerOpen, setComposerOpen] = useState(false);
  const chatShellRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = chatShellRef.current;
    if (!node) return;
    const resize = () => {
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
      const available = Math.max(160, bottom - node.getBoundingClientRect().top - 12);
      node.style.setProperty("--communication-height", `${available}px`);
    };
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (node.parentElement) observer?.observe(node.parentElement);
    const content = node.closest(".dashboard-content");
    if (content) observer?.observe(content);
    return () => { window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("scroll", resize); observer?.disconnect(); };
  }, [workspace, notificationsQuery.data?.unreadMentions]);
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  useEffect(() => {
    const conversation = searchParams.get("conversation");
    if (conversation && /^[a-f0-9]{24}$/i.test(conversation)) {
      setWorkspace("CHATS"); setSelectedTransferId(conversation);
    }
  }, [searchParams]);
  const [fileAction, setFileAction] = useState<"VIEW" | "DOWNLOAD" | null>(null);
  const [adminFileAction, setAdminFileAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const statsQuery = useQuery({
    queryKey: ["piece-transfers", "stats", user?.id],
    queryFn: getPieceTransferStats,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const inboxQuery = useInfiniteQuery({
    queryKey: ["piece-transfers", filter === "UNREAD" ? "unread-list" : "inbox", user?.id, debouncedSearch],
    queryFn: ({ pageParam }) => (filter === "UNREAD" ? getPieceTransferNotifications : getPieceTransferInbox)({
      search: debouncedSearch || undefined,
      unreadOnly: filter === "UNREAD" || undefined,
      page: pageParam, limit: 30,
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.pagination.page < lastPage.pagination.pages
      ? lastPage.pagination.page + 1 : undefined,
    enabled: workspace === "CHATS" && filter !== "SENT",
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const sentQuery = useInfiniteQuery({
    queryKey: ["piece-transfers", "sent", user?.id, debouncedSearch],
    queryFn: ({ pageParam }) => getPieceTransferSent({
      search: debouncedSearch || undefined, page: pageParam, limit: 30,
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.pagination.page < lastPage.pagination.pages
      ? lastPage.pagination.page + 1 : undefined,
    enabled: workspace === "CHATS" && (filter === "ALL" || filter === "SENT"),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const myFilesQuery = useQuery({
    queryKey: ["piece-transfers", "my-files", user?.id, fileDirection, filesPage, debouncedFilesSearch],
    queryFn: () => getMyCommunicationFiles({
      direction: fileDirection, search: debouncedFilesSearch || undefined, page: filesPage, limit: 20,
    }),
    enabled: workspace === "FILES",
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const myMessagesQuery = useQuery({
    queryKey: ["piece-transfers", "my-messages", user?.id, fileDirection, filesPage, debouncedFilesSearch],
    queryFn: () => getMyCommunicationMessages({ direction: fileDirection, search: debouncedFilesSearch || undefined, page: filesPage, limit: 20 }),
    enabled: workspace === "MESSAGES", staleTime: 15_000, refetchInterval: 30_000,
  });

  const adminOverviewQuery = useQuery({
    queryKey: ["piece-transfers", "admin-overview", user?.id],
    queryFn: getAdminCommunicationOverview,
    enabled: isAdmin && workspace === "ADMIN",
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const adminFilesQuery = useQuery({
    queryKey: ["piece-transfers", "admin-files", user?.id, adminPage, debouncedAdminSearch],
    queryFn: () =>
      getAdminCommunicationFiles({
        search: debouncedAdminSearch || undefined,
        page: adminPage,
        limit: 20,
      }),
    enabled: isAdmin && workspace === "ADMIN" && adminView === "FILES",
    staleTime: 8_000,
  });

  const adminMessagesQuery = useQuery({
    queryKey: ["piece-transfers", "admin-messages", user?.id, adminPage, debouncedAdminSearch],
    queryFn: () =>
      getAdminCommunicationMessages({
        search: debouncedAdminSearch || undefined,
        page: adminPage,
        limit: 20,
      }),
    enabled: isAdmin && workspace === "ADMIN" && adminView === "MESSAGES",
    staleTime: 8_000,
  });

  const createMutation = useMutation({
    mutationFn: createPieceTransfer,
    onSuccess: async (created) => {
      setComposerOpen(false);
      setWorkspace("CHATS");
      setFilter("SENT");
      setSearch("");
      setNotice("Communication envoyée. Vous pouvez poursuivre la discussion.");
      setSelectedTransferId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["piece-transfers"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokePieceTransfer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["piece-transfers"] });
    },
  });

  const adminDeleteFileMutation = useMutation({
    mutationFn: async (item: PieceTransferAdminFile) => {
      if (item.kind === "TRANSFER") {
        await deleteTransferRootFileAsAdmin(item.transferId);
        return;
      }
      if (!item.messageId) throw new Error("Identifiant de message manquant.");
      await deleteMessageFileAsAdmin(
        item.messageId,
        item.fileIndex ?? 0,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["piece-transfers"] });
    },
  });

  const adminDeleteMessageMutation = useMutation({
    mutationFn: deletePieceTransferMessageAsAdmin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["piece-transfers"] });
    },
  });

  const conversations = useMemo(() => {
    const inbox = inboxQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const sent = sentQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const merged = new Map<string, PieceTransferListItem>();

    [...inbox, ...sent].forEach((item) => merged.set(item.id, item));

    return [...merged.values()]
      .filter((item) => {
        if (filter === "UNREAD") return item.isRead === false;
        if (filter === "INBOX") return item.direction === "INBOX";
        if (filter === "SENT") return item.direction === "SENT";
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.lastActivityAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.lastActivityAt ?? a.createdAt ?? 0).getTime(),
      );
  }, [inboxQuery.data, sentQuery.data, filter]);

  const stats = statsQuery.data;
  const userQueryError =
    filter !== "SENT" && inboxQuery.isError
      ? getApiErrorMessage(inboxQuery.error)
      : (filter === "ALL" || filter === "SENT") && sentQuery.isError
        ? getApiErrorMessage(sentQuery.error)
        : null;

  const adminError =
    adminOverviewQuery.isError
      ? getApiErrorMessage(adminOverviewQuery.error)
      : adminFilesQuery.isError
        ? getApiErrorMessage(adminFilesQuery.error)
        : adminMessagesQuery.isError
          ? getApiErrorMessage(adminMessagesQuery.error)
          : adminDeleteFileMutation.isError
            ? getApiErrorMessage(adminDeleteFileMutation.error)
            : adminDeleteMessageMutation.isError
              ? getApiErrorMessage(adminDeleteMessageMutation.error)
              : null;

  const createError = createMutation.isError
    ? getApiErrorMessage(createMutation.error)
    : null;

  const detailError = revokeMutation.isError
    ? getApiErrorMessage(revokeMutation.error)
    : actionError;

  const loadingConversations = (filter !== "SENT" && inboxQuery.isLoading) ||
    ((filter === "ALL" || filter === "SENT") && sentQuery.isLoading);
  const hasMore = (filter !== "SENT" && inboxQuery.hasNextPage) ||
    ((filter === "ALL" || filter === "SENT") && sentQuery.hasNextPage);
  const loadingMore = inboxQuery.isFetchingNextPage || sentQuery.isFetchingNextPage;
  const refreshing = useIsFetching({ queryKey: ["piece-transfers"] }) > 0;

  function openConversations(next: UserFilter): void {
    setWorkspace("CHATS"); setFilter(next); setSearch("");
    setSelectedTransferId(null); setActionError(null);
  }
  function openFiles(direction: "SENT" | "INBOX", resource: "FILES" | "MESSAGES" = "FILES"): void {
    setWorkspace(resource); setFileDirection(direction); setFilesPage(1);
    setFilesSearch(""); setSelectedTransferId(null); setActionError(null);
  }
  async function loadMore(): Promise<void> {
    await Promise.all([
      filter !== "SENT" && inboxQuery.hasNextPage ? inboxQuery.fetchNextPage() : Promise.resolve(),
      (filter === "ALL" || filter === "SENT") && sentQuery.hasNextPage ? sentQuery.fetchNextPage() : Promise.resolve(),
    ]);
  }
  function openComposer(): void {
    createMutation.reset(); setComposerOpen(true);
  }
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ["piece-transfers"] });
  }

  async function handleView(transferId: string): Promise<void> {
    setActionError(null);
    setFileAction("VIEW");
    try {
      await viewPieceTransferFile(transferId);
      await queryClient.invalidateQueries({ queryKey: ["piece-transfers"] });
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setFileAction(null);
    }
  }

  async function handleDownload(
    transferId: string,
    fileName: string,
  ): Promise<void> {
    setActionError(null);
    setFileAction("DOWNLOAD");
    try {
      await downloadPieceTransferFile(transferId, fileName);
      await queryClient.invalidateQueries({ queryKey: ["piece-transfers"] });
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setFileAction(null);
    }
  }

  function handleRevoke(transferId: string): void {
    if (
      window.confirm(
        "Révoquer cette communication ? Elle sera fermée pour tous les participants.",
      )
    ) {
      revokeMutation.mutate(transferId);
    }
  }

  function handleAdminDeleteFile(item: PieceTransferAdminFile): void {
    if (item.fileStatus === "DELETED") return;
    if (
      window.confirm(
        `Supprimer définitivement « ${item.fileName} » ? L’historique restera conservé.`,
      )
    ) {
      adminDeleteFileMutation.mutate(item);
    }
  }

  function handleAdminDeleteMessage(item: PieceTransferAdminMessage): void {
    if (!item.messageId || !item.canDeleteMessage) return;
    if (
      window.confirm(
        "Supprimer ce message ? Une trace de suppression restera dans la communication.",
      )
    ) {
      adminDeleteMessageMutation.mutate(item.messageId);
    }
  }

  async function handleAdminFileView(item: PieceTransferAdminFile): Promise<void> {
    setAdminFileAction(`view:${item.id}`);
    setActionError(null);
    try {
      if (item.kind === "TRANSFER") {
        await viewPieceTransferFile(item.transferId);
      } else if (item.messageId) {
        await viewPieceTransferMessageFile(
          item.transferId,
          item.messageId,
          item.fileIndex ?? 0,
        );
      }
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setAdminFileAction(null);
    }
  }

  async function handleAdminFileDownload(item: PieceTransferAdminFile): Promise<void> {
    setAdminFileAction(`download:${item.id}`);
    setActionError(null);
    try {
      if (item.kind === "TRANSFER") {
        await downloadPieceTransferFile(item.transferId, item.fileName);
      } else if (item.messageId) {
        await downloadPieceTransferMessageFile(
          item.transferId,
          item.messageId,
          item.fileIndex ?? 0,
          item.fileName,
        );
      }
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setAdminFileAction(null);
    }
  }

  return (
    <main className="piece-transfers-page piece-transfers-page-v5">
      <header className="piece-transfer-appbar">
        <div>
          <span>Espace d’échange</span>
          <h1>Communications</h1>
        </div>

        <div className="piece-transfer-appbar-actions">
          <button type="button" disabled={refreshing} aria-label="Actualiser les communications" onClick={() => void refresh()} title="Actualiser">
            <RefreshCw size={18} className={refreshing ? "is-spinning" : ""} />
          </button>

          {isAdmin && (
            <button
              type="button"
              className={workspace === "ADMIN" ? "is-active" : ""}
              onClick={() => {
                setWorkspace((current) => (current === "ADMIN" ? "CHATS" : "ADMIN"));
                setSelectedTransferId(null);
              }}
              aria-label="Administration"
              title="Administration"
            >
              <ShieldCheck size={18} />
            </button>
          )}

          <button
            type="button"
            className="is-primary"
            onClick={openComposer}
            aria-label="Nouvelle communication"
            title="Nouvelle communication"
          >
            <Plus size={19} />
          </button>
        </div>
      </header>

      {notice && <div className="piece-transfer-notice" role="status"><Check size={17} /><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Fermer la notification"><X size={15} /></button></div>}

      {workspace === "FILES" || workspace === "MESSAGES" ? (
        <section className="piece-transfer-personal-files">
          <header><div><span>{workspace === "FILES" ? "MES PIÈCES JOINTES" : "MES MESSAGES"}</span><h2>{workspace === "FILES" ? (fileDirection === "SENT" ? "Fichiers envoyés" : "Fichiers reçus") : (fileDirection === "SENT" ? "Messages envoyés" : "Messages reçus")}</h2><p>{workspace === "FILES" ? "Retrouvez les pièces initiales et celles partagées dans les discussions." : "Retrouvez les messages de toutes vos conversations."}</p></div><button type="button" onClick={() => openConversations("ALL")}>Retour aux conversations</button></header>
          <nav className="piece-transfer-conversation-filters" aria-label="Direction des éléments">
            <button type="button" aria-pressed={fileDirection === "INBOX"} className={fileDirection === "INBOX" ? "is-active" : ""} onClick={() => { setFileDirection("INBOX"); setFilesPage(1); }}>Reçus</button>
            <button type="button" aria-pressed={fileDirection === "SENT"} className={fileDirection === "SENT" ? "is-active" : ""} onClick={() => { setFileDirection("SENT"); setFilesPage(1); }}>Envoyés</button>
          </nav>
          <label className="piece-transfer-conversation-search"><Search size={17}/><input aria-label="Rechercher mes éléments" placeholder="Rechercher…" value={filesSearch} onChange={(event) => { setFilesSearch(event.target.value); setFilesPage(1); }}/></label>
          {(actionError || (workspace === "FILES" ? myFilesQuery.isError : myMessagesQuery.isError)) && <div className="piece-transfer-error" role="alert">{actionError || getApiErrorMessage(workspace === "FILES" ? myFilesQuery.error : myMessagesQuery.error)}</div>}
          {(workspace === "FILES" ? myFilesQuery.isLoading : myMessagesQuery.isLoading) ? <div className="piece-transfer-chat-list-state" role="status"><LoaderCircle className="is-spinning" size={22}/><span>Chargement…</span></div> : workspace === "FILES" ? <AdminFilesView items={myFilesQuery.data?.items ?? []} action={adminFileAction} deleting={false} onView={handleAdminFileView} onDownload={handleAdminFileDownload}/> : <AdminMessagesView items={myMessagesQuery.data?.items ?? []} onOpen={setSelectedTransferId}/>}
          <AdminPagination page={(workspace === "FILES" ? myFilesQuery.data : myMessagesQuery.data)?.pagination.page ?? 1} pages={(workspace === "FILES" ? myFilesQuery.data : myMessagesQuery.data)?.pagination.pages ?? 1} onPage={setFilesPage}/>
          {selectedTransferId && <PieceTransferDetailsDrawer transferId={selectedTransferId} pendingAction={revokeMutation.isPending ? "REVOKE" : fileAction} error={detailError} onClose={() => setSelectedTransferId(null)} onView={handleView} onDownload={handleDownload} onRevoke={handleRevoke}/>}
        </section>
      ) : workspace === "CHATS" ? (
        <section
          ref={chatShellRef}
          className={`piece-transfer-chat-shell ${selectedTransferId ? "has-selection" : ""}`}
        >
          <aside className="piece-transfer-conversations-pane">
            <div className="piece-transfer-quick-stats" aria-label="Statistiques personnelles">
              <MiniStat icon={<Send size={17} />} value={stats?.messagesSent} title="Messages envoyés" onClick={() => openFiles("SENT", "MESSAGES")} />
              <MiniStat icon={<Inbox size={17} />} value={stats?.messagesReceived} title="Messages reçus" onClick={() => openFiles("INBOX", "MESSAGES")} />
              <MiniStat icon={<FileText size={17} />} value={stats?.filesSent} title="Fichiers envoyés" onClick={() => openFiles("SENT")} />
              <MiniStat icon={<Download size={17} />} value={stats?.filesReceived} title="Fichiers reçus" onClick={() => openFiles("INBOX")} />
            </div>

            {statsQuery.isError && <div className="piece-transfer-error" role="alert">{getApiErrorMessage(statsQuery.error)}</div>}
            <div className="piece-transfer-conversation-search">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Rechercher une communication"
                placeholder="Objet, expéditeur…"
              />
            </div>

            <nav className="piece-transfer-conversation-filters" aria-label="Filtres">
              <button
                type="button"
                className={filter === "ALL" ? "is-active" : ""}
                onClick={() => setFilter("ALL")}
                aria-pressed={filter === "ALL"}
              >
                Tous
              </button>
              <button
                type="button"
                className={filter === "INBOX" ? "is-active" : ""}
                onClick={() => setFilter("INBOX")}
                aria-pressed={filter === "INBOX"}
              >
                Reçus
              </button>
              <button
                type="button"
                className={filter === "SENT" ? "is-active" : ""}
                onClick={() => setFilter("SENT")}
                aria-pressed={filter === "SENT"}
              >
                Envoyés
              </button>
              <button type="button" aria-pressed={filter === "UNREAD"} className={filter === "UNREAD" ? "is-active" : ""} onClick={() => setFilter("UNREAD")}>
                Non lus {notificationsQuery.data?.unreadCommunications ? <span className="piece-transfer-unread-badge">{notificationsQuery.data.unreadCommunications}</span> : null}
              </button>
            </nav>

            {userQueryError && <div className="piece-transfer-error">{userQueryError}</div>}

            <div className="piece-transfer-conversation-list">
              {loadingConversations ? (
                <div className="piece-transfer-chat-list-state">
                  <LoaderCircle size={22} className="is-spinning" /><span>Chargement des conversations…</span>
                </div>
              ) : conversations.length === 0 ? (
                <div className="piece-transfer-chat-list-state">
                  <MessageCircle size={28} />
                  <strong>{search ? "Aucun résultat" : filter === "UNREAD" ? "Tout est à jour" : "Aucune communication"}</strong>
                  <span>{search ? "Essayez un autre objet ou un autre expéditeur." : filter === "UNREAD" ? "Vous avez consulté toutes vos communications." : "Commencez une discussion avec vos collègues."}</span>
                  <button type="button" onClick={search ? () => setSearch("") : openComposer}>{search ? "Effacer la recherche" : "Nouvelle communication"}</button>
                </div>
              ) : (
                conversations.map((item) => (
                  <ConversationItem
                    key={item.id}
                    item={item}
                    active={selectedTransferId === item.id}
                    onClick={() => setSelectedTransferId(item.id)}
                  />
                ))
              )}
              {hasMore && <button className="piece-transfer-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Chargement…" : "Charger davantage"}</button>}
            </div>
          </aside>

          <PieceTransferDetailsDrawer
            embedded
            transferId={selectedTransferId}
            pendingAction={revokeMutation.isPending ? "REVOKE" : fileAction}
            error={detailError}
            onClose={() => {
              setSelectedTransferId(null);
              setActionError(null);
            }}
            onView={handleView}
            onDownload={handleDownload}
            onRevoke={handleRevoke}
          />
        </section>
      ) : (
        <section className="piece-transfer-admin-workspace-v5">
          <header className="piece-transfer-admin-head-v5">
            <div>
              <ShieldCheck size={20} />
              <div>
                <strong>Administration</strong>
                <span>Supervision du tenant</span>
              </div>
            </div>

            <nav>
              <button
                type="button"
                className={adminView === "STATS" ? "is-active" : ""}
                onClick={() => {
                  setAdminView("STATS");
                  setAdminPage(1);
                }}
                title="Statistiques"
               aria-label="Statistiques">
                <BarChart3 size={17} />
              </button>
              <button
                type="button"
                className={adminView === "MESSAGES" ? "is-active" : ""}
                onClick={() => {
                  setAdminView("MESSAGES");
                  setAdminPage(1);
                }}
                title="Messages"
               aria-label="Messages">
                <MessageSquareText size={17} />
              </button>
              <button
                type="button"
                className={adminView === "FILES" ? "is-active" : ""}
                onClick={() => {
                  setAdminView("FILES");
                  setAdminPage(1);
                }}
                title="Fichiers"
               aria-label="Fichiers">
                <FileText size={17} />
              </button>
            </nav>
          </header>

          {adminView !== "STATS" && (
            <label className="piece-transfer-conversation-search piece-transfer-admin-search-v5">
              <Search size={17} />
              <input
                value={adminSearch}
                onChange={(event) => {
                  setAdminSearch(event.target.value);
                  setAdminPage(1);
                }}
                placeholder="Rechercher"
              />
            </label>
          )}

          {(adminError || actionError) && (
            <div className="piece-transfer-error">{adminError || actionError}</div>
          )}

          {adminView === "STATS" ? (
            adminOverviewQuery.isLoading ? (
              <div className="piece-transfer-chat-list-state"><LoaderCircle size={22} className="is-spinning" /></div>
            ) : (
              <CommunicationAdminReadStats overview={adminOverviewQuery.data} onNavigate={(view) => { setAdminView(view); setAdminSearch(""); setAdminPage(1); }} />
            )
          ) : adminView === "MESSAGES" ? (
            adminMessagesQuery.isLoading ? (
              <div className="piece-transfer-chat-list-state"><LoaderCircle size={22} className="is-spinning" /></div>
            ) : (
              <AdminMessagesView
                items={adminMessagesQuery.data?.items ?? []}
                deletingId={
                  adminDeleteMessageMutation.isPending
                    ? adminDeleteMessageMutation.variables
                    : undefined
                }
                onOpen={(transferId) => setSelectedTransferId(transferId)}
                onDelete={handleAdminDeleteMessage}
              />
            )
          ) : adminFilesQuery.isLoading ? (
            <div className="piece-transfer-chat-list-state"><LoaderCircle size={22} className="is-spinning" /></div>
          ) : (
            <AdminFilesView
              items={adminFilesQuery.data?.items ?? []}
              action={adminFileAction}
              deleting={adminDeleteFileMutation.isPending}
              onView={handleAdminFileView}
              onDownload={handleAdminFileDownload}
              onDelete={handleAdminDeleteFile}
            />
          )}

          {adminView !== "STATS" && (
            <AdminPagination
              page={
                adminView === "FILES"
                  ? adminFilesQuery.data?.pagination.page ?? 1
                  : adminMessagesQuery.data?.pagination.page ?? 1
              }
              pages={
                adminView === "FILES"
                  ? adminFilesQuery.data?.pagination.pages ?? 1
                  : adminMessagesQuery.data?.pagination.pages ?? 1
              }
              onPage={setAdminPage}
            />
          )}

          {selectedTransferId && (
            <PieceTransferDetailsDrawer
              transferId={selectedTransferId}
              pendingAction={revokeMutation.isPending ? "REVOKE" : fileAction}
              error={detailError}
              onClose={() => setSelectedTransferId(null)}
              onView={handleView}
              onDownload={handleDownload}
              onRevoke={handleRevoke}
            />
          )}
        </section>
      )}

      <PieceTransferComposer
        open={composerOpen}
        pending={createMutation.isPending}
        error={createError}
        onClose={() => { if (!createMutation.isPending) setComposerOpen(false); }}
        onSubmit={(input: CreatePieceTransferInput) => createMutation.mutate(input)}
      />
    </main>
  );
}

function MiniStat({ icon, value, title, active = false, onClick }: {
  icon: ReactNode; value?: number; title: string; active?: boolean; onClick: () => void;
}) {
  return <button type="button" className={`piece-transfer-mini-stat ${active ? "is-active" : ""}`} onClick={onClick} aria-pressed={active} aria-label={`${title} : ${value ?? "chargement"}. Ouvrir`}>
    <span className="piece-transfer-stat-icon">{icon}</span><strong>{value === undefined ? "—" : new Intl.NumberFormat("fr-FR").format(value)}</strong><span>{title}</span>
  </button>;
}

function ConversationItem({
  item,
  active,
  onClick,
}: {
  item: PieceTransferListItem;
  active: boolean;
  onClick: () => void;
}) {
  const preview =
    item.description ||
    (item.originalFileName ? `📎 ${item.originalFileName}` : "Communication");

  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      className={`piece-transfer-conversation-item ${active ? "is-active" : ""} ${item.isRead === false ? "is-unread" : ""}`}
      onClick={onClick}
    >
      <span className="piece-transfer-conversation-avatar">
        {initials(item.title)}
      </span>

      <span className="piece-transfer-conversation-copy">
        <span className="piece-transfer-conversation-line">
          <strong>{item.title} {item.unreadMessageCount ? <span className="piece-transfer-unread-badge" aria-label={`${item.unreadMessageCount} messages non lus`}>{item.unreadMessageCount}</span> : null}</strong>
          <time>{formatShortDate(item.createdAt)}</time>
        </span>

        <span className="piece-transfer-conversation-line is-preview">
          <span>
            {item.direction === "SENT" ? <Check size={13} /> : null}
            {preview}
          </span>
          {item.isRead === false && <em />}
        </span>

        <small>
          {item.direction === "SENT" ? "Envoyé" : item.senderName}
          {item.status === "REVOKED" ? " · Révoquée" : ""}
        </small>
      </span>
    </button>
  );
}

function AdminMessagesView({
  items,
  deletingId,
  onOpen,
  onDelete,
}: {
  items: PieceTransferAdminMessage[];
  deletingId?: string;
  onOpen: (transferId: string) => void;
  onDelete?: (item: PieceTransferAdminMessage) => void;
}) {
  if (items.length === 0) {
    return <div className="piece-transfer-chat-list-state">Aucun message.</div>;
  }

  return (
    <div className="piece-transfer-admin-message-list-v5">
      {items.map((item) => (
        <article key={item.id} className={item.status === "DELETED" ? "is-deleted" : ""}>
          <button type="button" onClick={() => onOpen(item.transferId)}>
            <span className="piece-transfer-admin-message-avatar">
              {initials(item.senderName)}
            </span>
            <span>
              <strong>{item.senderName}</strong>
              <small>{item.communicationTitle} · {formatDateTime(item.createdAt)}</small>
              <p>
                {item.status === "DELETED"
                  ? "Message supprimé"
                  : item.body ||
                    (item.hasAttachment
                      ? `📎 ${item.attachmentCount} fichier${item.attachmentCount > 1 ? "s" : ""}`
                      : "Communication")}
              </p>
            </span>
          </button>

          {onDelete && item.canDeleteMessage && item.messageId && (
            <button
              type="button"
              className="piece-transfer-admin-danger-icon"
              onClick={() => onDelete(item)}
              disabled={deletingId === item.messageId}
              title="Supprimer"
             aria-label="Supprimer">
              {deletingId === item.messageId ? (
                <LoaderCircle size={16} className="is-spinning" />
              ) : (
                <Trash2 size={16} />
              )}
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

function AdminFilesView({
  items,
  action,
  deleting,
  onView,
  onDownload,
  onDelete,
}: {
  items: PieceTransferAdminFile[];
  action: string | null;
  deleting: boolean;
  onView: (item: PieceTransferAdminFile) => Promise<void>;
  onDownload: (item: PieceTransferAdminFile) => Promise<void>;
  onDelete?: (item: PieceTransferAdminFile) => void;
}) {
  if (items.length === 0) {
    return <div className="piece-transfer-chat-list-state">Aucun fichier.</div>;
  }

  return (
    <div className="piece-transfer-admin-files-v5">
      {items.map((item) => (
        <article key={item.id} className={item.fileStatus === "DELETED" ? "is-deleted" : ""}>
          <FileText size={20} />
          <div>
            <strong>{item.fileName}</strong><small>{item.title}{item.fileStatus === "DELETED" ? " · Pièce supprimée" : ""}</small>
            <span>{item.senderName} · {formatBytes(item.bytes)} · {formatDateTime(item.createdAt)}</span>
          </div>
          <div>
            <button
              type="button"
              disabled={item.fileStatus === "DELETED" || Boolean(action)}
              onClick={() => void onView(item)}
              aria-label={`Voir ${item.fileName}`}
              title="Voir"
            >
              {action === `view:${item.id}` ? <LoaderCircle size={15} className="is-spinning" /> : <Eye size={15} />}
            </button>
            <button
              type="button"
              disabled={item.fileStatus === "DELETED" || Boolean(action)}
              onClick={() => void onDownload(item)}
              aria-label={`Télécharger ${item.fileName}`}
              title="Télécharger"
            >
              {action === `download:${item.id}` ? <LoaderCircle size={15} className="is-spinning" /> : <Download size={15} />}
            </button>
            {onDelete && <button
              type="button"
              className="is-danger"
              disabled={deleting || item.fileStatus === "DELETED"}
              onClick={() => onDelete(item)}
              title="Supprimer"
             aria-label="Supprimer">
              <Trash2 size={15} />
            </button>}
          </div>
        </article>
      ))}
    </div>
  );
}

function AdminPagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="piece-transfer-pagination-v5">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹
      </button>
      <span>{page}/{pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        ›
      </button>
    </div>
  );
}
