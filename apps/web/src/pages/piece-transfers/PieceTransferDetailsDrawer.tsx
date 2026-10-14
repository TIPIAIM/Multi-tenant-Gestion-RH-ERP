import CommunicationVoiceRecorder from "./CommunicationVoiceRecorder";
import CommunicationAttachmentCard from "./CommunicationAttachmentCard";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Reply,
  Forward,
  Smile,
  AtSign,
  ArrowLeft,
  Ban,
  Check,
  Clock3,
  Download,
  Eye,
  FileText,
  Info,
  LoaderCircle,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Pencil,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import {
  useInfiniteQuery,
  type InfiniteData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  deletePieceTransferMessageAsAdmin,
  downloadPieceTransferMessageFile,
  getPieceTransferRecipients,
  setPieceTransferReaction,
  forwardPieceTransferToAgents,
  getPieceTransferInbox,
  getPieceTransferSent,
  getPieceTransferById,
  getPieceTransferMessages,
  markPieceTransferRead,
  sendPieceTransferMessage,
  updatePieceTransferMessage,
  viewPieceTransferMessageFile,
} from "../../features/piece-transfers/piece-transfer.api";
import { getApiErrorMessage } from "../../features/auth/auth.api";
import { useAuth } from "../../features/auth/auth.context";
import type {
  PieceTransferRecipientOption,
  PieceTransferMessage,
  PieceTransferMessagesResult,
  SendPieceTransferMessageInput,
} from "../../features/piece-transfers/piece-transfer.types";

type Props = {
  transferId: string | null;
  embedded?: boolean;
  pendingAction?: "VIEW" | "DOWNLOAD" | "REVOKE" | null;
  error?: string | null;
  onClose: () => void;
  onView: (transferId: string) => void;
  onDownload: (transferId: string, fileName: string) => void;
  onRevoke: (transferId: string) => void;
};

function formatBytes(value?: number): string {
  if (!value) return "";
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatTime(value?: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

function remainingTime(until: string, now: number): string {
  const ms = Math.max(0, new Date(until).getTime() - now);
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

const MAX_CHAT_FILES = 7;
const MAX_CHAT_TOTAL_BYTES = 20 * 1024 * 1024;

function totalFileBytes(files: File[]): number {
  return files.reduce((total, file) => total + file.size, 0);
}

export default function PieceTransferDetailsDrawer({
  transferId,
  embedded = false,
  pendingAction,
  error,
  onClose,
  onView,
  onDownload,
  onRevoke,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const endRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const nearBottomRef = useRef(true);
  const [readSignal, setReadSignal] = useState(0);
  const acknowledgedRef = useRef(new Set<string>());
  const pendingReadRef = useRef(new Set<string>());
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setReadSignal(value => value + 1); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const currentTransferRef = useRef(transferId);
  currentTransferRef.current = transferId;
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const [now, setNow] = useState(Date.now());
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [replyTarget, setReplyTarget] = useState<PieceTransferMessage | null>(null);
  const [forwardTarget, setForwardTarget] = useState<PieceTransferMessage | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardGroupName, setForwardGroupName] = useState("");
  const [sharingMode, setSharingMode] = useState<"INDIVIDUAL" | "COMMON">("INDIVIDUAL");
  const forwardDialogRef = useRef<HTMLElement | null>(null);
  const [forwardPartialError, setForwardPartialError] = useState<string | null>(null);
  const [forwardMode, setForwardMode] = useState<"DISCUSSION" | "AGENTS">("DISCUSSION");
  const [agentSearch, setAgentSearch] = useState("");
  const [debouncedAgentSearch, setDebouncedAgentSearch] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Map<string, PieceTransferRecipientOption>>(() => new Map());
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(null);
  const [forwardNotice, setForwardNotice] = useState<string | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedAgentSearch(agentSearch.trim().slice(0, 120)), 300); return () => window.clearTimeout(timer); }, [agentSearch]);
  const allAgentsQuery = useInfiniteQuery({
    queryKey: ["piece-transfers", "forward-agents", user?.id, "all"],
    enabled: Boolean(forwardTarget && forwardMode === "AGENTS" && user?.id),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getPieceTransferRecipients({ page: pageParam, limit: 50 }),
    getNextPageParam: page => page.pagination.page < page.pagination.pages ? page.pagination.page + 1 : undefined,
    staleTime: 60_000,
  });
  const searchAgentsQuery = useInfiniteQuery({
    queryKey: ["piece-transfers", "forward-agents", user?.id, "search", debouncedAgentSearch],
    enabled: Boolean(forwardTarget && forwardMode === "AGENTS" && user?.id && debouncedAgentSearch),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getPieceTransferRecipients({ search: debouncedAgentSearch, page: pageParam, limit: 50 }),
    getNextPageParam: page => page.pagination.page < page.pagination.pages ? page.pagination.page + 1 : undefined,
  });
  function toggleAgent(agent: PieceTransferRecipientOption): void {
    setSelectedAgents(current => { const next = new Map(current); if (next.has(agent.userId)) next.delete(agent.userId); else if (next.size < 500) next.set(agent.userId, agent); return next; });
  }
  const forwardAgentsMutation = useMutation({
    mutationFn: ({ source, messageId, ids, mode, groupName }: { source: string; messageId: string; ids: string[]; mode: "INDIVIDUAL" | "COMMON"; groupName?: string }) => forwardPieceTransferToAgents(source, messageId, ids, mode, groupName),
    onSuccess: async (data, variables) => {
      if (currentTransferRef.current === variables.source) {
        if (data.failedRecipientUserIds.length) {
          const failed = new Set(data.failedRecipientUserIds);
          setSelectedAgents(current => new Map([...current].filter(([id]) => failed.has(id))));
          setForwardPartialError(`${data.transfers.length} discussion(s) créée(s). Échec pour ${failed.size} destinataire(s) : seuls ces destinataires restent sélectionnés pour réessayer.`);
        } else {
          setForwardTarget(null); setSelectedAgents(new Map()); setForwardPartialError(null);
          setForwardNotice(data.mode === "COMMON" ? "Message transféré dans une discussion commune." : `Message transféré dans ${data.transfers.length} discussion(s) individuelle(s).`);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["piece-transfers"] });
    },
  });
  const reactionMutation = useMutation({
    mutationFn: ({ source, messageId, emoji }: { source: string; messageId: string; emoji: string | null }) => setPieceTransferReaction(source, messageId, emoji),
    onSuccess: async (message, variables) => {
      queryClient.setQueryData<InfiniteData<PieceTransferMessagesResult>>(["piece-transfers", "messages", variables.source, user?.id], current => current ? { ...current, pages: current.pages.map(page => ({ ...page, items: page.items.map(item => item.id === message.id ? message : item) })) } : current);
      setReactingMessageId(null);
      await queryClient.invalidateQueries({ queryKey: ["piece-transfers", "messages", variables.source, user?.id] });
    },
    onError: actionError => setLocalError(getApiErrorMessage(actionError)),
  });
  const [forwardDestination, setForwardDestination] = useState("");

  const [emojiOpen, setEmojiOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const replyDraftsRef = useRef(new Map<string, PieceTransferMessage | null>());
  const replyRef = useRef(replyTarget);
  replyRef.current = replyTarget;
  const forwardQuery = useQuery({
    queryKey: ["piece-transfers", "forward-destinations", user?.id, forwardSearch],
    enabled: Boolean(forwardTarget && forwardMode === "DISCUSSION" && user?.id),
    queryFn: async () => {
      const params = { page: 1, limit: 30, search: forwardSearch || undefined };
      const [inbox, sent] = await Promise.all([getPieceTransferInbox(params), getPieceTransferSent(params)]);
      return [...new Map([...inbox.items, ...sent.items].map(item => [item.id, item])).values()].filter(item => item.id !== transferId && item.status === "ACTIVE");
    },
  });
  const forwardMutation = useMutation({
    mutationFn: ({ destination, source, messageId }: { destination: string; source: string; messageId: string }) =>
      sendPieceTransferMessage(destination, { forwardTransferId: source, forwardMessageId: messageId }),
    onSuccess: async () => { setForwardTarget(null); setForwardDestination(""); setForwardNotice("Message transféré dans la discussion sélectionnée."); await queryClient.invalidateQueries({ queryKey: ["piece-transfers"] }); },
  });
  const [mentionCursor, setMentionCursor] = useState(0);
  const [mentionSelection, setMentionSelection] = useState<Map<string, string>>(() => new Map());
  const mentionDraftsRef = useRef(new Map<string, Map<string, string>>());
  const mentionSelectionRef = useRef(mentionSelection);
  mentionSelectionRef.current = mentionSelection;
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [messageFileAction, setMessageFileAction] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const draftsRef = useRef(new Map<string, { body: string; files: File[] }>());
  const previousTransferRef = useRef<string | null>(null);
  const currentDraftRef = useRef({ body: messageBody, files: messageFiles });
  currentDraftRef.current = { body: messageBody, files: messageFiles };

  const detailQuery = useQuery({
    queryKey: ["piece-transfers", "detail", transferId, user?.id],
    queryFn: () => getPieceTransferById(transferId!),
    enabled: Boolean(transferId),
    refetchOnWindowFocus: true,
  });

  useLayoutEffect(() => {
    const node = composerRef.current;
    if (!node) return;
    const resize = () => {
      const styles = window.getComputedStyle(node);
      const lineHeight = Number.parseFloat(styles.lineHeight) || 22.4;
      const padding = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
      const border = (Number.parseFloat(styles.borderTopWidth) || 0) + (Number.parseFloat(styles.borderBottomWidth) || 0);
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const maxHeight = Math.min(lineHeight * 8 + padding + border, Math.max(lineHeight + padding + border, viewportHeight * .45));
      const oldScroll = node.scrollTop;
      const wasAtEnd = node.scrollHeight - node.clientHeight - oldScroll < lineHeight;
      node.style.height = "auto";
      node.style.maxHeight = `${maxHeight}px`;
      const height = Math.min(Math.max(44, node.scrollHeight + border), maxHeight);
      node.style.height = `${height}px`;
      node.style.overflowY = node.scrollHeight > node.clientHeight + 1 ? "auto" : "hidden";
      if (node.style.overflowY === "auto") node.scrollTop = wasAtEnd ? node.scrollHeight : oldScroll;
    };
    resize();
    let previousWidth = node.getBoundingClientRect().width;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      const width = node.getBoundingClientRect().width;
      if (width !== previousWidth) { previousWidth = width; resize(); }
    }) : null;
    observer?.observe(node);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize); };
  }, [messageBody, transferId, detailQuery.data?.permissions.canSendMessage]);

  const messagesQuery = useInfiniteQuery({
    queryKey: ["piece-transfers", "messages", transferId, user?.id],
    queryFn: ({ pageParam }) => getPieceTransferMessages(transferId!, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.pagination.page < lastPage.pagination.pages
      ? lastPage.pagination.page + 1 : undefined,
    enabled: Boolean(transferId),
    staleTime: 5_000,
    refetchInterval: transferId ? 15_000 : false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!forwardTarget) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = forwardDialogRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const fitViewport = () => { if (dialog) dialog.style.maxHeight = `min(${Math.max(120, (window.visualViewport?.height ?? window.innerHeight) - 24)}px, calc(100dvh - 24px))`; };
    fitViewport();
    window.visualViewport?.addEventListener("resize", fitViewport);
    dialog?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); if (!forwardMutation.isPending && !forwardAgentsMutation.isPending) setForwardTarget(null); }
      if (event.key !== "Tab" || !dialog) return;
      event.stopImmediatePropagation();
      const elements = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(node => node.getClientRects().length > 0);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => { document.body.style.overflow = overflow; window.visualViewport?.removeEventListener("resize", fitViewport); document.removeEventListener("keydown", handleKey, true); previous?.focus(); };
  }, [forwardTarget, forwardMutation.isPending, forwardAgentsMutation.isPending]);

  const sendMessageMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: SendPieceTransferMessageInput }) =>
      sendPieceTransferMessage(id, input),
    onSuccess: async (message, variables) => {
      queryClient.setQueryData<InfiniteData<PieceTransferMessagesResult>>(
        ["piece-transfers", "messages", variables.id, user?.id],
        (current) => current ? {
          ...current,
          pages: current.pages.map((page, index) => index === 0 ? {
            ...page,
            items: page.items.some((item) => item.id === message.id) ? page.items : [...page.items, message],
          } : page),
        } : current,
      );
      draftsRef.current.delete(variables.id);
      if (currentTransferRef.current === variables.id) {
        setMessageBody(""); setMentionSelection(new Map()); mentionDraftsRef.current.delete(variables.id); setMentionCursor(0); setMessageFiles([]); setReplyTarget(null); replyDraftsRef.current.delete(variables.id); nearBottomRef.current = true;
        endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
      await queryClient.invalidateQueries({ queryKey: ["piece-transfers"] });
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: string }) =>
      updatePieceTransferMessage(transferId!, messageId, body),
    onSuccess: async () => {
      setEditingMessageId(null);
      setEditingBody("");
      await queryClient.invalidateQueries({ queryKey: ["piece-transfers"] });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: deletePieceTransferMessageAsAdmin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["piece-transfers"] });
    },
  });

  const transfer = detailQuery.data;
  const messages = useMemo(() => {
    const unique = new Map<string, PieceTransferMessage>();
    for (const page of messagesQuery.data?.pages ?? []) {
      for (const message of page.items) if (!unique.has(message.id)) unique.set(message.id, message);
    }
    return [...unique.values()].sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime() || a.id.localeCompare(b.id));
  }, [messagesQuery.data]);
  const beforeCursor = messageBody.slice(0, mentionCursor);
  const mentionMatch = /(?:^|\s)@([^@\n]{0,70})$/.exec(beforeCursor);
  const mentionStart = mentionMatch ? mentionCursor - (mentionMatch[1] ?? "").length - 1 : -1;
  const normalizeMention = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const mentionCandidates = mentionMatch ? (transfer?.participants ?? []).filter(person => person.userId !== user?.id && normalizeMention(person.fullName).includes(normalizeMention(mentionMatch[1] ?? ""))).slice(0, 8) : [];
  function chooseMention(person: { userId: string; fullName: string }): void {
    if (mentionStart < 0) return;
    const token = `@${person.fullName} `;
    const value = messageBody.slice(0, mentionStart) + token + messageBody.slice(mentionCursor);
    if (value.length > 4000) return;
    setMessageBody(value); setMentionSelection(current => new Map(current).set(person.userId, person.fullName));
    setMentionCursor(0);
    window.requestAnimationFrame(() => { const position = mentionStart + token.length; composerRef.current?.focus(); composerRef.current?.setSelectionRange(position, position); });
  }
  function renderMentionBody(message: PieceTransferMessage) {
    const text = message.body ?? "";
    const output: Array<string | React.ReactElement> = [];
    let index = 0;
    for (const mention of [...(message.mentions ?? [])].sort((a, b) => a.start - b.start)) {
      if (mention.start < index || mention.end > text.length) continue;
      output.push(text.slice(index, mention.start));
      output.push(<mark key={`${mention.start}:${mention.userId}`} className={`communication-mention ${mention.userId === user?.id ? "is-me" : ""}`} title={mention.userId === user?.id ? "Vous êtes mentionné" : mention.fullName}>{text.slice(mention.start, mention.end)}</mark>);
      index = mention.end;
    }
    output.push(text.slice(index)); return output;
  }
  const latestMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!transferId || !latestMessageId || !user?.id || !transfer ||
      messagesQuery.isFetching || document.visibilityState === "hidden" || !nearBottomRef.current) return;
    const key = `${user.id}:${transferId}:${latestMessageId}`;
    if (acknowledgedRef.current.has(key) || pendingReadRef.current.has(key)) return;
    let cancelled = false;
    // Wait for the latest messages to render and the initial scroll to finish.
    const timer = window.setTimeout(() => {
      if (cancelled || document.visibilityState === "hidden" || !nearBottomRef.current) return;
      pendingReadRef.current.add(key);
      void markPieceTransferRead(transferId, latestMessageId).then(() => {
        acknowledgedRef.current.add(key);
        void queryClient.invalidateQueries({ queryKey: ["piece-transfers", "notifications"] });
        void queryClient.invalidateQueries({ queryKey: ["piece-transfers", "unread-list"] });
      }).catch(() => {
        // Keep unread state when acknowledgement failed; retry on next polling cycle.
      }).finally(() => pendingReadRef.current.delete(key));
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [transferId, latestMessageId, user?.id, transfer, messagesQuery.isFetching,
      messagesQuery.dataUpdatedAt, queryClient, readSignal]);


  useEffect(() => {
    if (!transferId) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [transferId]);

  useEffect(() => {
    const previousId = previousTransferRef.current;
    if (previousId) { mentionDraftsRef.current.set(previousId, mentionSelectionRef.current); draftsRef.current.set(previousId, currentDraftRef.current); replyDraftsRef.current.set(previousId, replyRef.current); }
    setReplyTarget(transferId ? replyDraftsRef.current.get(transferId) ?? null : null);
    setForwardTarget(null);  setEmojiOpen(false); setReactingMessageId(null); setForwardNotice(null); setSelectedAgents(new Map());
    previousTransferRef.current = transferId;
    const draft = transferId ? draftsRef.current.get(transferId) : undefined;
    setMentionSelection(transferId ? mentionDraftsRef.current.get(transferId) ?? new Map() : new Map());
    setMentionCursor(0);
    setMessageBody(draft?.body ?? "");
    setMessageFiles(draft?.files ?? []);
    setEditingMessageId(null);
    setEditingBody("");
    setLocalError(null);
    setShowInfo(false);
    setShowMenu(false);
    setHasNewMessages(false);
    nearBottomRef.current = true;
  }, [transferId]);

  useEffect(() => {
    if (!transferId || messages.length === 0) return;
    if (!nearBottomRef.current) { setHasNewMessages(true); return; }
    const timer = window.setTimeout(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [transferId, latestMessageId]);

  useEffect(() => {
    if (!transfer?.currentUser.isRecipient || transfer.currentUser.isRead !== true) {
      return;
    }

    void queryClient.invalidateQueries({ queryKey: ["piece-transfers", "stats"] });
    void queryClient.invalidateQueries({ queryKey: ["piece-transfers", "notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["piece-transfers", "unread-list"] });
    void queryClient.invalidateQueries({ queryKey: ["piece-transfers", "inbox"] });
  }, [queryClient, transfer?.id, transfer?.currentUser.isRecipient, transfer?.currentUser.isRead]);

  useEffect(() => {
    if (embedded || !transfer?.id) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = drawerRef.current;
    drawer?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab" || !drawer) return;
      const elements = Array.from(drawer.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
        .filter((element) => element.getClientRects().length > 0);
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, [embedded, transfer?.id]);

  const mutationError = useMemo(() => {
    if (sendMessageMutation.isError) return getApiErrorMessage(sendMessageMutation.error);
    if (editMessageMutation.isError) return getApiErrorMessage(editMessageMutation.error);
    if (deleteMessageMutation.isError) return getApiErrorMessage(deleteMessageMutation.error);
    return null;
  }, [
    sendMessageMutation.isError,
    sendMessageMutation.error,
    editMessageMutation.isError,
    editMessageMutation.error,
    deleteMessageMutation.isError,
    deleteMessageMutation.error,
  ]);

  if (!transferId) {
    if (!embedded) return null;

    return (
      <section className="piece-transfer-chat-panel piece-transfer-chat-empty">
        <div className="piece-transfer-chat-empty-mark">
          <MessageCircle size={42} />
        </div>
        <strong>Communications</strong>
        <span>Sélectionnez une conversation.</span>
      </section>
    );
  }

  const canSend =
    Boolean(transfer?.permissions.canSendMessage) &&
    (messageBody.trim().length > 0 || messageFiles.length > 0) &&
    !sendMessageMutation.isPending && !voiceBusy;

  const revocationStillOpen =
    Boolean(transfer?.permissions.canRevoke) &&
    (Boolean(transfer?.currentUser.isAdminSupervisor) ||
      Boolean(
        transfer?.revocableUntil &&
          now < new Date(transfer.revocableUntil).getTime(),
      ));

  function submitMessage(event: FormEvent): void {
    event.preventDefault();
    if (!canSend || !transferId) return;

    sendMessageMutation.mutate({
      id: transferId,
      input: { body: messageBody.trim() || undefined, files: messageFiles, replyToMessageId: replyTarget?.id, mentionUserIds: [...mentionSelection].filter(([, name]) => messageBody.includes(`@${name}`)).map(([id]) => id) },
    });
  }

  function beginEdit(message: PieceTransferMessage): void {
    setEditingMessageId(message.id);
    setEditingBody(message.body ?? "");
    setLocalError(null);
  }

  function saveEdit(message: PieceTransferMessage): void {
    const body = editingBody.trim();
    if (!body && message.attachments.length === 0) {
      setLocalError("Le message ne peut pas être vide.");
      return;
    }

    editMessageMutation.mutate({ messageId: message.id, body });
  }

  function deleteMessage(message: PieceTransferMessage): void {
    if (!message.permissions.canDelete) return;

    if (
      window.confirm(
        "Supprimer ce message ? La trace d’audit restera conservée.",
      )
    ) {
      deleteMessageMutation.mutate(message.id);
    }
  }

  async function viewMessageFile(
    messageId: string,
    fileIndex: number,
  ): Promise<void> {
    if (!transferId) {
      setLocalError("Aucune communication sélectionnée.");
      return;
    }

    setLocalError(null);
    setMessageFileAction(`view:${messageId}:${fileIndex}`);
    try {
      await viewPieceTransferMessageFile(
        transferId,
        messageId,
        fileIndex,
      );
    } catch (actionError) {
      setLocalError(getApiErrorMessage(actionError));
    } finally {
      setMessageFileAction(null);
    }
  }

  async function downloadMessageFile(
    messageId: string,
    fileIndex: number,
    fileName: string,
  ): Promise<void> {
    if (!transferId) {
      setLocalError("Aucune communication sélectionnée.");
      return;
    }

    setLocalError(null);
    setMessageFileAction(`download:${messageId}:${fileIndex}`);
    try {
      await downloadPieceTransferMessageFile(
        transferId,
        messageId,
        fileIndex,
        fileName,
      );
    } catch (actionError) {
      setLocalError(getApiErrorMessage(actionError));
    } finally {
      setMessageFileAction(null);
    }
  }

  function addMessageFiles(selected: File[]): void {
    setLocalError(null);

    const merged = [
      ...messageFiles,
      ...selected.filter(
        (candidate) =>
          !messageFiles.some(
            (existing) =>
              existing.name === candidate.name &&
              existing.size === candidate.size &&
              existing.lastModified === candidate.lastModified,
          ),
      ),
    ];

    if (merged.length > MAX_CHAT_FILES) {
      setLocalError("Vous pouvez joindre au maximum 7 fichiers par message.");
      return;
    }

    if (totalFileBytes(merged) > MAX_CHAT_TOTAL_BYTES) {
      setLocalError("La taille totale des pièces jointes ne peut pas dépasser 20 Mo.");
      return;
    }

    setMessageFiles(merged);
  }

  function removeMessageFile(index: number): void {
    setMessageFiles((current) =>
      current.filter((_, fileIndex) => fileIndex !== index),
    );
  }

  const content = detailQuery.isLoading ? (
    <div className="piece-transfer-chat-loading">
      <LoaderCircle size={24} className="is-spinning" />
    </div>
  ) : detailQuery.isError || !transfer ? (
    <div className="piece-transfer-chat-loading is-error">
      Communication indisponible.
    </div>
  ) : (
    <>
      <header className="piece-transfer-chat-header">
        <button
          type="button"
          className="piece-transfer-chat-back"
          onClick={onClose}
          aria-label={embedded ? "Retour aux conversations" : "Fermer"}
        >
          {embedded ? <ArrowLeft size={20} /> : <X size={20} />}
        </button>

        <div className="piece-transfer-chat-avatar">
          {initials(transfer.title)}
        </div>

        <button
          type="button"
          className="piece-transfer-chat-title"
          onClick={() => setShowInfo((current) => !current)}
        >
          <strong>{transfer.title}</strong>
          <span>
            {transfer.recipientCount} destinataire{transfer.recipientCount > 1 ? "s" : ""}
            {transfer.status === "REVOKED" ? " · révoquée" : ""}
          </span>
        </button>

        <div className="piece-transfer-chat-header-actions">
          {transfer.originalFileName && transfer.permissions.canView && (
            <button
              type="button"
              onClick={() => onView(transfer.id)}
              disabled={Boolean(pendingAction)}
              title="Voir la pièce"
             aria-label="Voir la pièce">
              <Paperclip size={18} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowInfo((current) => !current)}
            title="Informations"
           aria-label="Informations">
            <Info size={18} />
          </button>

          <div className="piece-transfer-chat-menu-wrap">
            <button
              type="button"
              onClick={() => setShowMenu((current) => !current)}
              title="Plus"
             aria-label="Plus">
              <MoreVertical size={18} />
            </button>

            {showMenu && (
              <div className="piece-transfer-chat-menu">
                {transfer.originalFileName && transfer.permissions.canDownload && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onDownload(transfer.id, transfer.originalFileName!);
                    }}
                  >
                    <Download size={15} />
                    Télécharger
                  </button>
                )}

                {revocationStillOpen && (
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => {
                      setShowMenu(false);
                      onRevoke(transfer.id);
                    }}
                  >
                    <Ban size={15} />
                    Révoquer
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {showInfo && (
        <section className="piece-transfer-chat-info">
          <div>
            <strong>{transfer.senderName}</strong>
            <span>{formatDateTime(transfer.createdAt)}</span>
          </div>

          {transfer.description && <p>{transfer.description}</p>}

          {transfer.originalFileName && (
            <button
              type="button"
              className="piece-transfer-chat-root-file"
              onClick={() => transfer.permissions.canView && onView(transfer.id)}
              disabled={!transfer.permissions.canView}
            >
              <FileText size={18} />
              <span>
                <strong>{transfer.originalFileName}</strong>
                <small>{formatBytes(transfer.bytes)}</small>
              </span>
              <Eye size={16} />
            </button>
          )}

          {transfer.recipients && (
            <div className="piece-transfer-chat-recipients">
              <UsersRound size={17} />
              <span>
                {transfer.recipients.slice(0, 4).map((item) => item.fullName).join(", ")}
                {transfer.recipients.length > 4 ? ` +${transfer.recipients.length - 4}` : ""}
              </span>
            </div>
          )}
        </section>
      )}

      {transfer.currentUser.isAdminSupervisor &&
        !transfer.currentUser.isSender &&
        !transfer.currentUser.isRecipient && (
          <div className="piece-transfer-chat-supervisor">
            <ShieldCheck size={15} />
            <span>Mode supervision · lecture seule</span>
          </div>
        )}

      {transfer.status === "REVOKED" && (
        <div className="piece-transfer-chat-revoked">
          <Ban size={15} />
          Communication révoquée
        </div>
      )}

      <div ref={messageScrollRef} className="piece-transfer-chat-messages" onScroll={(event) => {
        const node = event.currentTarget;
        nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
        if (nearBottomRef.current) { setHasNewMessages(false); setReadSignal(value => value + 1); }
      }}>
        <div className="piece-transfer-chat-day-chip">
          {formatDateTime(transfer.createdAt)}
        </div>

        {transfer.description && (
          <article
            className={`piece-transfer-bubble ${transfer.senderUserId === user?.id ? "is-mine" : "is-theirs"}`}
          >
            {transfer.senderUserId !== user?.id && (
              <strong className="piece-transfer-bubble-author">
                {transfer.senderName}
              </strong>
            )}
            <p>{transfer.description}</p>
            <footer className="piece-transfer-bubble-meta">
              <time>{formatTime(transfer.createdAt)}</time>
              {transfer.senderUserId === user?.id && <Check size={13} />}
            </footer>
          </article>
        )}

        {transfer.originalFileName && (
          <article
            className={`piece-transfer-bubble piece-transfer-bubble-file ${transfer.senderUserId === user?.id ? "is-mine" : "is-theirs"}`}
          >
            <CommunicationAttachmentCard
              transferId={transfer.id}
              attachment={{ originalFileName: transfer.originalFileName!, mimeType: transfer.mimeType,
                bytes: transfer.bytes, status: transfer.fileStatus,
                canView: transfer.permissions.canView, canDownload: transfer.permissions.canDownload }}
              busy={pendingAction === "VIEW" || pendingAction === "DOWNLOAD" ? pendingAction : null}
              onView={() => onView(transfer.id)} onDownload={() => onDownload(transfer.id, transfer.originalFileName!)}
            />
          </article>
        )}

        {messagesQuery.hasNextPage && <button className="piece-transfer-load-more" type="button" disabled={messagesQuery.isFetchingNextPage} onClick={async () => {
          const node = messageScrollRef.current;
          const height = node?.scrollHeight ?? 0;
          const top = node?.scrollTop ?? 0;
          nearBottomRef.current = false;
          await messagesQuery.fetchNextPage();
          window.requestAnimationFrame(() => { if (node) node.scrollTop = top + node.scrollHeight - height; });
        }}>{messagesQuery.isFetchingNextPage ? "Chargement…" : "Afficher les messages précédents"}</button>}

        {messagesQuery.isLoading ? (
          <div className="piece-transfer-chat-loading-inline">
            <LoaderCircle size={18} className="is-spinning" />
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.senderUserId === user?.id;
            const editableNow =
              message.permissions.canEdit &&
              Boolean(message.editableUntil) &&
              now < new Date(message.editableUntil!).getTime();
            const editing = editingMessageId === message.id;
            const deleting =
              deleteMessageMutation.isPending &&
              deleteMessageMutation.variables === message.id;

            return (
              <article
                key={message.id}
                id={`communication-message-${message.id}`}
                tabIndex={-1}
                className={`piece-transfer-bubble ${mine ? "is-mine" : "is-theirs"} ${message.status === "DELETED" ? "is-deleted" : ""}`}
              >
                {!mine && message.status !== "DELETED" && (
                  <strong className="piece-transfer-bubble-author">
                    {message.senderName}
                  </strong>
                )}

                {message.status === "DELETED" ? (
                  <div className="piece-transfer-bubble-deleted">
                    <Trash2 size={14} />
                    Message supprimé par l’administrateur
                  </div>
                ) : editing ? (
                  <div className="piece-transfer-bubble-editor">
                    <textarea
                      value={editingBody}
                      onChange={(event) => setEditingBody(event.target.value)}
                      maxLength={4000}
                      rows={3}
                      autoFocus
                    />
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMessageId(null);
                          setEditingBody("");
                        }}
                        title="Annuler"
                       aria-label="Annuler">
                        <X size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(message)}
                        disabled={!editableNow || editMessageMutation.isPending}
                        title="Enregistrer"
                       aria-label="Enregistrer">
                        {editMessageMutation.isPending ? (
                          <LoaderCircle size={15} className="is-spinning" />
                        ) : (
                          <Save size={15} />
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {message.forwarded && <span className="communication-forwarded"><Forward size={12} /> Transféré</span>}
                    {message.replyTo && <button type="button" className="communication-quote" title="Retrouver le message cité" onClick={async () => {
                      nearBottomRef.current = false;
                      let node = document.getElementById(`communication-message-${message.replyTo!.messageId}`);
                      if (!node) {
                        let page = messagesQuery.data?.pages.at(-1);
                        while (!node && page && page.pagination.page < page.pagination.pages) {
                          const result = await messagesQuery.fetchNextPage();
                          page = result.data?.pages.at(-1);
                          await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
                          node = document.getElementById(`communication-message-${message.replyTo!.messageId}`);
                          if (result.isError) break;
                        }
                      }
                      if (node) { node.scrollIntoView({ behavior: "smooth", block: "center" }); node.focus({ preventScroll: true }); }
                      else setLocalError("Le message cité n’est plus disponible.");
                    }} aria-label="Retrouver le message cité"><strong>{message.replyTo.senderName}</strong><span>{message.replyTo.body || message.replyTo.attachmentName || "Message"}</span></button>}
                    {message.body && <p>{renderMentionBody(message)}</p>}

                    {message.attachments.length > 0 && (
                      <div className="piece-transfer-bubble-attachments">
                        {message.attachments.map((attachment) => (
                          <CommunicationAttachmentCard
                            key={`${message.id}:${attachment.index}`}
                            transferId={transfer.id} messageId={message.id} index={attachment.index}
                            attachment={attachment} pending={Boolean(messageFileAction)}
                            busy={messageFileAction === `view:${message.id}:${attachment.index}` ? "VIEW"
                              : messageFileAction === `download:${message.id}:${attachment.index}` ? "DOWNLOAD" : null}
                            onView={() => void viewMessageFile(message.id, attachment.index)}
                            onDownload={() => void downloadMessageFile(message.id, attachment.index, attachment.originalFileName)}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {message.status !== "DELETED" && <div className="communication-reactions" aria-label="Réactions au message">
                  {(message.reactions ?? []).map(reaction => <button key={reaction.emoji} type="button" aria-pressed={reaction.reactedByMe} aria-label={`${reaction.emoji} : ${reaction.count} réaction(s)${reaction.reactedByMe ? ", votre réaction" : ""}`} disabled={!transfer.permissions.canSendMessage || reactionMutation.isPending} onClick={() => { setLocalError(null); reactionMutation.mutate({ source: transfer.id, messageId: message.id, emoji: reaction.reactedByMe ? null : reaction.emoji }); }}>{reaction.emoji}<span>{reaction.count}</span></button>)}

                  {reactingMessageId === message.id && <div className="communication-reaction-picker" aria-label="Choisir une réaction">{[{ emoji: "👍", label: "J’aime" }, { emoji: "❤️", label: "Cœur" }, { emoji: "😂", label: "Joie" }, { emoji: "🙏", label: "Merci" }, { emoji: "💪", label: "Force" }, { emoji: "👋", label: "Salutation" }, { emoji: "👏", label: "Bravo" }, { emoji: "✅", label: "Approuvé" }].map(item => <button type="button" key={item.emoji} title={item.label} aria-label={item.label} disabled={reactionMutation.isPending} onClick={() => { setLocalError(null); reactionMutation.mutate({ source: transfer.id, messageId: message.id, emoji: message.reactions?.some(reaction => reaction.emoji === item.emoji && reaction.reactedByMe) ? null : item.emoji }); }}>{item.emoji}</button>)}<button type="button" aria-label="Fermer les réactions" onClick={() => setReactingMessageId(null)}><X size={14} /></button></div>}
                </div>}
                <footer className="piece-transfer-bubble-meta">
                  {message.editedAt && <span>modifié</span>}
                  <time>{formatTime(message.createdAt)}</time>
                  {mine && message.status !== "DELETED" && <Check size={13} />}

                  {message.status !== "DELETED" && !editing && transfer.permissions.canSendMessage && (
                    <div className="communication-message-actions">
                      <button type="button" aria-label="Répondre au message" title="Répondre" disabled={sendMessageMutation.isPending} onClick={() => { setReplyTarget(message); composerRef.current?.focus(); }}><Reply size={16} /></button>
                      <button type="button" aria-label="Transférer le message" title="Transférer" disabled={forwardMutation.isPending || forwardAgentsMutation.isPending} onClick={() => { setForwardTarget(message); setForwardGroupName(""); setSharingMode("INDIVIDUAL"); setForwardPartialError(null); setForwardMode("DISCUSSION"); setForwardSearch(""); setAgentSearch(""); setDebouncedAgentSearch(""); setSelectedAgents(new Map()); setForwardDestination(""); forwardMutation.reset(); forwardAgentsMutation.reset(); }}><Forward size={16} /></button>
                    </div>
                  )}
                  {editableNow && !editing && (
                    <button
                      type="button"
                      onClick={() => beginEdit(message)}
                      title={`Modifier · ${remainingTime(message.editableUntil!, now)}`}
                     aria-label={`Modifier · ${remainingTime(message.editableUntil!, now)}`}>
                      <Pencil size={13} />
                    </button>
                  )}

                  {message.status !== "DELETED" && transfer.permissions.canSendMessage && <button type="button" className="communication-reaction-add" aria-label="Réagir au message" title="Réagir" aria-expanded={reactingMessageId === message.id} disabled={reactionMutation.isPending} onClick={() => setReactingMessageId(current => current === message.id ? null : message.id)}><Smile size={16} /></button>}

                  {message.permissions.canDelete && message.status !== "DELETED" && (
                    <button
                      type="button"
                      className="is-delete"
                      onClick={() => deleteMessage(message)}
                      disabled={deleting}
                      title="Supprimer"
                     aria-label="Supprimer">
                      {deleting ? (
                        <LoaderCircle size={13} className="is-spinning" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  )}
                </footer>
              </article>
            );
          })
        )}

        <div ref={endRef} />
      </div>

      {forwardNotice && <div className="communication-forward-notice" role="status"><Check size={16} />{forwardNotice}<button type="button" aria-label="Fermer la confirmation" onClick={() => setForwardNotice(null)}><X size={14} /></button></div>}
      {forwardTarget && <div className="communication-forward-layer"><section ref={forwardDialogRef} tabIndex={-1} role="dialog" aria-modal="true" className="communication-forward-panel" aria-label="Transférer un message">
        <header><strong><Forward size={16} /> Transférer ce message</strong><button type="button" disabled={forwardMutation.isPending || forwardAgentsMutation.isPending} aria-label="Fermer le transfert" onClick={() => setForwardTarget(null)}><X size={18} /></button></header>
        <div className="communication-forward-scroll">
        <p className="communication-forward-excerpt">{forwardTarget.body || "Pièces jointes"}</p>
        <small>{forwardTarget.attachments.length} pièce(s) jointe(s) · une copie indépendante sera envoyée.</small>
        <div className="communication-forward-modes" role="group" aria-label="Destination du transfert">
          <button type="button" aria-pressed={forwardMode === "DISCUSSION"} disabled={forwardMutation.isPending || forwardAgentsMutation.isPending} onClick={() => setForwardMode("DISCUSSION")}><MessageCircle size={16} /> Discussion</button>
          <button type="button" aria-pressed={forwardMode === "AGENTS"} disabled={forwardMutation.isPending || forwardAgentsMutation.isPending} onClick={() => setForwardMode("AGENTS")}><UsersRound size={16} /> Agents</button>
        </div>
        {forwardMode === "DISCUSSION" ? <>
          <input aria-label="Rechercher une discussion destinataire" placeholder="Rechercher une discussion…" maxLength={120} value={forwardSearch} disabled={forwardMutation.isPending} onChange={event => { setForwardSearch(event.target.value); setForwardDestination(""); }} />
          {forwardQuery.isLoading ? <p>Chargement…</p> : forwardQuery.isError ? <p role="alert">Discussions indisponibles. <button type="button" onClick={() => void forwardQuery.refetch()}>Réessayer</button></p> : <select aria-label="Discussion destinataire" value={forwardDestination} disabled={forwardMutation.isPending} onChange={event => setForwardDestination(event.target.value)}><option value="">Choisir une discussion</option>{forwardQuery.data?.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>}
          <small>Discussions actives dont vous êtes participant. Affinez la recherche si nécessaire.</small>
          {forwardMutation.isError && <p role="alert">{getApiErrorMessage(forwardMutation.error)}</p>}
        </> : <>
          <input aria-label="Rechercher un agent destinataire" placeholder="Rechercher par nom ou email…" maxLength={120} value={agentSearch} disabled={forwardAgentsMutation.isPending} onChange={event => setAgentSearch(event.target.value)} />
          <div className="communication-selected-agents" aria-label="Agents sélectionnés">{[...selectedAgents.values()].map(agent => <button type="button" key={agent.userId} disabled={forwardAgentsMutation.isPending} aria-label={`Retirer ${agent.fullName}`} onClick={() => toggleAgent(agent)}>{agent.fullName}<X size={13} /></button>)}</div>
          <fieldset className="communication-sharing-choice"><legend>Comment partager avec ces personnes ?</legend>
            <label><input type="radio" name="sharing-mode" checked={sharingMode === "INDIVIDUAL"} disabled={forwardAgentsMutation.isPending} onChange={() => setSharingMode("INDIVIDUAL")} /><span><strong>Discussions individuelles</strong><small>Une discussion privée avec chaque personne. Les autres destinataires ne voient pas ses réponses.</small></span></label>
            <label><input type="radio" name="sharing-mode" checked={sharingMode === "COMMON"} disabled={forwardAgentsMutation.isPending} onChange={() => setSharingMode("COMMON")} /><span><strong>Discussion commune</strong><small>Toutes les personnes sélectionnées échangent ensemble dans la même discussion.</small></span></label>
          </fieldset>
          {sharingMode === "COMMON" && <label className="piece-transfer-field"><span>Nom de la discussion commune</span><input aria-label="Nom de la discussion commune" maxLength={180} value={forwardGroupName} disabled={forwardAgentsMutation.isPending} onChange={event => setForwardGroupName(event.target.value)} placeholder="Ex. Équipe projet" /></label>}
          <p className="communication-sharing-summary" role="status">{selectedAgents.size} destinataire(s) · {sharingMode === "INDIVIDUAL" ? `${selectedAgents.size} discussion(s) individuelle(s)` : "1 discussion commune"}</p>
          {[...(debouncedAgentSearch ? [{ query: searchAgentsQuery, title: "Résultats de recherche" }] : []), { query: allAgentsQuery, title: "Tous les agents disponibles" }].map(({ query, title }) => <section className="communication-agent-directory" key={title} aria-label={title}>
            <strong>{title}</strong>
            {query.isLoading ? <p>Chargement…</p> : query.isError ? <p role="alert">Liste indisponible. <button type="button" onClick={() => void query.refetch()}>Réessayer</button></p> : <>
              <div className="communication-agent-list">{query.data?.pages.flatMap(page => page.items).map(agent => <label key={agent.userId}><input type="checkbox" checked={selectedAgents.has(agent.userId)} disabled={forwardAgentsMutation.isPending || (!selectedAgents.has(agent.userId) && selectedAgents.size >= 500)} onChange={() => toggleAgent(agent)} /><span className="communication-agent-avatar">{initials(agent.fullName)}</span><span><strong>{agent.fullName}</strong><small>{agent.agent?.serviceName || agent.email}</small></span></label>)}</div>
              {!query.data?.pages.some(page => page.items.length) && <p>Aucun agent trouvé.</p>}
              {query.hasNextPage && <button type="button" disabled={query.isFetchingNextPage || forwardAgentsMutation.isPending} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Chargement…" : "Afficher les agents suivants"}</button>}
            </>}
          </section>)}
          {forwardPartialError && <p role="alert">{forwardPartialError}</p>}
          {forwardAgentsMutation.isError && <p role="alert">{getApiErrorMessage(forwardAgentsMutation.error)}</p>}
        </>}
        </div>
        <footer className="communication-forward-footer">
          <button type="button" className="communication-forward-confirm" disabled={forwardMode === "DISCUSSION" ? !forwardDestination || forwardMutation.isPending : !selectedAgents.size || forwardAgentsMutation.isPending || (sharingMode === "COMMON" && !forwardGroupName.trim())} onClick={() => {
            if (!transferId) return;
            if (forwardMode === "DISCUSSION") forwardMutation.mutate({ destination: forwardDestination, source: transferId, messageId: forwardTarget.id });
            else { setForwardPartialError(null); forwardAgentsMutation.mutate({ source: transferId, messageId: forwardTarget.id, ids: [...selectedAgents.keys()], mode: sharingMode, groupName: sharingMode === "COMMON" ? forwardGroupName.trim() : undefined }); }
          }}>{forwardMutation.isPending || forwardAgentsMutation.isPending ? "Transfert en cours…" : forwardMode === "DISCUSSION" ? "Confirmer le transfert" : sharingMode === "INDIVIDUAL" ? `Créer ${selectedAgents.size} discussion(s) individuelle(s)` : `Créer une discussion commune · ${selectedAgents.size} personne(s)`}</button>
        </footer>
      </section></div>}
      {(error || mutationError || localError) && (
        <div className="piece-transfer-chat-error">
          {error || mutationError || localError}
        </div>
      )}

      {hasNewMessages && <button className="piece-transfer-new-messages" type="button" onClick={() => {
        nearBottomRef.current = true; setHasNewMessages(false); setReadSignal(value => value + 1);
        endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }}>Nouveaux messages ↓</button>}

      {transfer.permissions.canSendMessage ? (
        <form className="piece-transfer-chat-composer" onSubmit={submitMessage}>


          {mentionCandidates.length > 0 && <div className="communication-mention-picker" aria-label="Participants à mentionner"><small>Choisir un participant</small>{mentionCandidates.map(person => <button key={person.userId} type="button" onClick={() => chooseMention(person)} aria-label={`Mentionner ${person.fullName}`}><AtSign size={15} /><span>{person.fullName}</span></button>)}</div>}

          {replyTarget && <div className="communication-reply-preview" role="status"><Reply size={18} /><div><strong>Réponse à {replyTarget.senderName}</strong><span>{replyTarget.body || replyTarget.attachments[0]?.originalFileName || "Message"}</span></div><button type="button" aria-label="Annuler la réponse citée" disabled={sendMessageMutation.isPending} onClick={() => setReplyTarget(null)}><X size={18} /></button></div>}
          {emojiOpen && <div className="communication-emoji-picker" aria-label="Insérer un emoji">{["👍", "✅", "🙏", "📌", "📎", "🙂", "👏", "🤝"].map(emoji => <button type="button" key={emoji} aria-label={`Insérer ${emoji}`} onClick={() => {
            const node = composerRef.current; const start = node?.selectionStart ?? messageBody.length; const end = node?.selectionEnd ?? start;
            if (messageBody.length - (end - start) + emoji.length > 4000) return;
            setMessageBody(messageBody.slice(0, start) + emoji + messageBody.slice(end)); setEmojiOpen(false);
            window.requestAnimationFrame(() => { node?.focus(); node?.setSelectionRange(start + emoji.length, start + emoji.length); });
          }}>{emoji}</button>)}</div>}
          <button type="button" className="communication-emoji-toggle" aria-label="Choisir un emoji" aria-expanded={emojiOpen} disabled={sendMessageMutation.isPending} onClick={() => setEmojiOpen(value => !value)}><Smile size={20} /></button>
          {messageFiles.length > 0 && (
            <div className="piece-transfer-chat-files-preview">
              <div className="piece-transfer-chat-files-summary">
                <Paperclip size={14} />
                <span>
                  {messageFiles.length}/7 · {formatBytes(totalFileBytes(messageFiles))}
                </span>
              </div>

              <div className="piece-transfer-chat-files-chips">
                {messageFiles.map((file, index) => (
                  <div
                    key={`${file.name}:${file.size}:${file.lastModified}`}
                    className="piece-transfer-chat-file-chip"
                  >
                    <FileText size={13} />
                    <span title={file.name}>{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeMessageFile(index)}
                      title="Retirer"
                     aria-label="Retirer">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <label
            className="piece-transfer-chat-attach"
            title="Joindre jusqu’à 7 fichiers · 20 Mo au total"
          >
            <input
              type="file"
              multiple
              disabled={sendMessageMutation.isPending}
              aria-label="Joindre des fichiers au message"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.webm,.ogg,.m4a,.mp3,.wav"
              onChange={(event) => {
                addMessageFiles(Array.from(event.target.files ?? []));
                event.currentTarget.value = "";
              }}
            />
            <Paperclip size={20} />
          </label>

          <CommunicationVoiceRecorder key={transfer.id} disabled={sendMessageMutation.isPending} remainingFiles={MAX_CHAT_FILES - messageFiles.length} remainingBytes={MAX_CHAT_TOTAL_BYTES - totalFileBytes(messageFiles)} onBusyChange={setVoiceBusy} onSend={async file => {
            await sendMessageMutation.mutateAsync({ id: transfer.id, input: { body: messageBody.trim() || undefined, files: [...messageFiles, file], replyToMessageId: replyTarget?.id, mentionUserIds: [...mentionSelection].filter(([, name]) => messageBody.includes(`@${name}`)).map(([id]) => id) } });
          }} />
          <textarea
            ref={composerRef}
            value={messageBody}
            aria-label="Votre message"
            disabled={sendMessageMutation.isPending}
            onChange={(event) => { setMessageBody(event.target.value); setMentionCursor(event.target.selectionStart); }}
            onSelect={event => setMentionCursor(event.currentTarget.selectionStart)}
            maxLength={4000}
            rows={1}
            placeholder="Message · @ pour mentionner"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (mentionCandidates[0]) { chooseMention(mentionCandidates[0]); return; }
                if (canSend) submitMessage(event as unknown as FormEvent);
              }
            }}
          />

          <button
            type="submit"
            className="piece-transfer-chat-send"
            disabled={!canSend}
            aria-label="Envoyer le message"
            title="Envoyer · Entrée (Maj + Entrée : nouvelle ligne)"
          >
            {sendMessageMutation.isPending ? (
              <LoaderCircle size={19} className="is-spinning" />
            ) : (
              <Send size={19} />
            )}
          </button>
        </form>
      ) : (
        <div className="piece-transfer-chat-closed">
          <Ban size={15} />
          Échanges fermés
        </div>
      )}

      {transfer.currentUser.isSender &&
        !transfer.currentUser.isAdminSupervisor &&
        transfer.status === "ACTIVE" &&
        transfer.revocableUntil &&
        now < new Date(transfer.revocableUntil).getTime() && (
          <div className="piece-transfer-revoke-countdown" title="Délai de révocation">
            <Clock3 size={13} />
            {remainingTime(transfer.revocableUntil, now)}
          </div>
        )}
    </>
  );

  if (embedded) {
    return <section className="piece-transfer-chat-panel">{content}</section>;
  }

  return (
    <div
      className="piece-transfer-drawer-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside ref={drawerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={transfer?.title ?? "Communication"} className="piece-transfer-drawer piece-transfer-drawer-wide">
        {content}
      </aside>
    </div>
  );
}
