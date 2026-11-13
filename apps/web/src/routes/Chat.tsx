import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  KeyRound,
  List,
  Mic,
  MicOff,
  Pencil,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button, Card, CardHead, Chip, Field, IconButton, Segmented, Spinner, Textarea, TextInput, cx } from "../components/ui";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { ChatMessage } from "../components/ChatMessage";
import { ChatInput } from "../components/ChatInput";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { PlanChangeCard, toConfirmationChanges } from "../components/PlanChangeCard";
import { STT_STATUS_FA, type SttStatus } from "../components/VoiceInput";
import {
  api,
  ApiError,
  type ChatMessageDto,
  type ConversationListItem,
  type ConversationRef,
  type PlanChangeDto,
} from "../lib/api";
import { toChatRole } from "../lib/adapters";
import { ASSISTANT_FA, type AssistantKind } from "../lib/domain";
import { faNum, faRelative } from "../lib/format";
import { useApiData, useSubmit } from "../lib/useApiData";

/**
 * گفت‌وگو — the chat screen for the two Persian personas.
 *
 * Wire contract (apps/api/src/routes/chat.ts), honoured exactly:
 * - `POST /chat/conversations/:id/messages` stores the user's turn first; if the
 *   model call fails the response is still an error, but `fields.userMessageId`
 *   and `fields.failedMessageId` prove both turns were persisted — so the failed
 *   assistant turn is shown as failed (never an invented reply) with a retry.
 * - There is no streaming endpoint. Nothing here simulates tokens; an in-flight
 *   send is one honest status line.
 * - Sentences for failures come from the API (Persian by design); the transcript
 *   only stores the machine code, so we keep a code→API-sentence map observed
 *   during this session and fall back to one generic Persian line otherwise.
 * - `requestReply` is a Phase-5 seam today: every send will honestly surface the
 *   server's «پیاده‌سازی نشده» message. The UI will not special-case that.
 */

/** Matches the server's zod limit on message content. */
const MAX_MESSAGE_CHARS = 8000;

type Thread = { id: string; conversation: ConversationRef; messages: ChatMessageDto[] };

/** Persian sentences as the API sent them, keyed by machine code. Server-owned wording only. */
const observedApiSentences = new Map<string, string>();

const GENERIC_FAILURE_FA = "پاسخ هوش مصنوعی دریافت نشد؛ پیام شما در گفت‌وگو ذخیره شده است.";

/* ---------- speech-to-text, typed against the minimal browser surface ---------- */

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; length: number };
type RecognitionResults = ArrayLike<RecognitionResult>;
interface RecognitionResultList extends RecognitionResults {
  [index: number]: RecognitionResult & { 0: RecognitionAlternative };
}
interface RecognitionEventLike {
  resultIndex: number;
  results: RecognitionResultList;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/* ---------- conversation list (sidebar on desktop, sheet body on phones) ---------- */

function ConversationList({
  items,
  selectedId,
  onSelect,
  onRename,
  onDelete,
}: {
  items: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRename: (item: ConversationListItem) => void;
  onDelete: (item: ConversationListItem) => void;
}) {
  if (items.length === 0) {
    return <p className="px-1 py-3 text-sm leading-relaxed text-ink-3">برای این دستیار گفت‌وگویی وجود ندارد. یکی بسازید.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((c) => {
        const selected = c.id === selectedId;
        return (
          <li key={c.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              aria-current={selected ? "true" : undefined}
              className={cx(
                "min-w-0 flex-1 rounded-pill border px-3 py-2 text-start transition-colors duration-150",
                selected
                  ? "border-ink bg-card-3 font-semibold text-ink"
                  : "border-line bg-card-2 text-ink-2 hover:border-ink-3 hover:text-ink",
              )}
            >
              <span className="block truncate text-sm">{c.title ?? "گفت‌وگوی جدید"}</span>
              <span className="block text-2xs text-ink-3">{faRelative(c.lastMessageAt)}</span>
            </button>
            <IconButton label="تغییر نام گفت‌وگو" size="sm" onClick={() => onRename(c)}>
              <Pencil size={13} strokeWidth={1.75} aria-hidden />
            </IconButton>
            <IconButton label="حذف گفت‌وگو" size="sm" onClick={() => onDelete(c)}>
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            </IconButton>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- page ---------- */

export function Chat() {
  const navigate = useNavigate();
  // A plan card can link straight to the nutritionist thread.
  const [searchParams] = useSearchParams();

  const [assistant, setAssistant] = useState<AssistantKind>(() =>
    searchParams.get("assistant") === "nutritionist" ? "nutritionist" : "coach",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);

  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [retryOf, setRetryOf] = useState<string | null>(null);
  /** Live Persian sentences per failed message id (the transcript only stores the code). */
  const [failureTexts, setFailureTexts] = useState<Record<string, string>>({});

  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ConversationListItem | null>(null);
  const [pendingRename, setPendingRename] = useState<ConversationListItem | null>(null);
  const [renameText, setRenameText] = useState("");
  /** Image attached to the next message; sent as a data URL only to the API. */
  const [attachment, setAttachment] = useState<{ dataUrl: string; name: string } | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  /* plan-change approval */
  const [confirmApply, setConfirmApply] = useState<PlanChangeDto | null>(null);
  const [changeBusyId, setChangeBusyId] = useState<string | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);

  /* voice */
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<SttStatus>("idle");
  const [voiceSupported, setVoiceSupported] = useState<boolean>(() => recognitionCtor() !== null);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);

  const composerRef = useRef<HTMLDivElement>(null);
  const sheetPanelRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conv = useApiData(() => api.chat.conversations(), []);
  const providers = useApiData(() => api.providers.list(), []);
  const createSub = useSubmit();
  const deleteSub = useSubmit();
  const renameSub = useSubmit();
  const changesReq = useApiData(
    () =>
      selectedId
        ? api.planChanges.list({ conversationId: selectedId })
        : Promise.resolve(null),
    [selectedId],
  );

  const threadReq = useApiData(
    () => (selectedId ? api.chat.conversation(selectedId) : Promise.resolve(null)),
    [selectedId],
  );

  /** null = still unknown; only an explicit `false` blocks sending. */
  const aiReady = providers.data ? providers.data.items.some((p) => p.hasKey && p.enabled) : null;

  const conversationsForAssistant = useMemo(
    () => (conv.data ? conv.data.items.filter((c) => c.assistant === assistant) : []),
    [conv.data, assistant],
  );

  const assistantOptions = useMemo(() => {
    const kinds: AssistantKind[] = conv.data?.assistants ?? ["coach", "nutritionist"];
    return kinds.map((k) => ({ value: k, label: ASSISTANT_FA[k] }));
  }, [conv.data]);

  // when the list lands and nothing is picked, open the most recent conversation
  useEffect(() => {
    if (selectedId === null && conv.data && conversationsForAssistant.length > 0) {
      setSelectedId(conversationsForAssistant[0].id);
    }
  }, [conv.data, selectedId, conversationsForAssistant]);

  // a conversation switch must never keep painting the previous thread
  useEffect(() => {
    setThread(null);
    setSendError(null);
    setDraftError(null);
  }, [selectedId]);

  useEffect(() => {
    if (threadReq.data && !threadReq.loading && threadReq.data.conversation.id === selectedId) {
      setThread({
        id: threadReq.data.conversation.id,
        conversation: threadReq.data.conversation,
        messages: threadReq.data.messages,
      });
    }
  }, [threadReq.data, threadReq.loading, selectedId]);

  // follow the newest turn
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length, sending, selectedId]);

  // keep the sheet operable from the keyboard, like a dialog
  useEffect(() => {
    if (!sheetOpen) return;
    sheetPanelRef.current?.querySelector("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  // never leave the microphone engine running after the screen unmounts
  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [],
  );

  const appendMessages = (msgs: ChatMessageDto[]) => {
    setThread((prev) => (prev && prev.id === selectedId ? { ...prev, messages: [...prev.messages, ...msgs] } : prev));
  };

  const focusComposer = () => {
    composerRef.current?.querySelector("textarea")?.focus();
  };

  /**
   * One send = one POST. Nothing is added to the transcript until the server
   * confirms it (201 with both messages, or a failure whose `fields` prove the
   * user turn and the failed reply slot were stored).
   */
  const sendContent = async (raw: string, retryOfId: string | null): Promise<void> => {
    const content = raw.trim();
    if (!selectedId || !content || sending) return;
    if (content.length > MAX_MESSAGE_CHARS) {
      setDraftError(`پیام نباید بیشتر از ${faNum(MAX_MESSAGE_CHARS)} نویسه باشد.`);
      return;
    }
    setSending(true);
    setSendError(null);
    setRetryOf(retryOfId);
    const outgoing = retryOfId === null ? attachment : null;
    try {
      const res = await api.chat.send(
        selectedId,
        content,
        outgoing ? [{ kind: "image", ref: outgoing.dataUrl }] : undefined,
      );
      appendMessages([res.userMessage, res.reply]);
      if (retryOfId === null) {
        setDraft("");
        setDraftError(null);
        setAttachment(null);
        focusComposer();
      }
      conv.reload();
      changesReq.reload();
    } catch (cause) {
      const err = cause instanceof ApiError ? cause : null;
      const userMessageId = err?.fields.userMessageId;
      const failedMessageId = err?.fields.failedMessageId;
      if (err && userMessageId && failedMessageId) {
        // The server persisted both turns: show them as real history.
        const now = new Date().toISOString();
        appendMessages([
          { id: userMessageId, role: "user", content, at: now, modelId: null, attachments: null, error: null },
          { id: failedMessageId, role: "assistant", content: "", at: now, modelId: null, attachments: null, error: err.code },
        ]);
        observedApiSentences.set(err.code, err.message);
        setFailureTexts((prev) => ({ ...prev, [failedMessageId]: err.message }));
        if (retryOfId === null) {
          setDraft("");
          setDraftError(null);
          setAttachment(null);
        }
      } else {
        setSendError(err ? err.message : "ارسال پیام انجام نشد. دوباره تلاش کنید.");
      }
    } finally {
      setSending(false);
      setRetryOf(null);
    }
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    setDraftError(value.trim().length > MAX_MESSAGE_CHARS ? `پیام نباید بیشتر از ${faNum(MAX_MESSAGE_CHARS)} نویسه باشد.` : null);
  };

  const newConversation = async () => {
    const res = await createSub.run(() => api.chat.createConversation(assistant));
    if (res) {
      setSelectedId(res.id);
      conv.reload();
      setSheetOpen(false);
    }
  };

  const runChange = async (change: PlanChangeDto, action: "apply" | "reject" | "revert") => {
    if (changeBusyId) return;
    setChangeBusyId(change.id);
    setChangeError(null);
    try {
      if (action === "apply") await api.planChanges.apply(change.id);
      else if (action === "reject") await api.planChanges.reject(change.id);
      else await api.planChanges.revert(change.id);
      setConfirmApply(null);
      changesReq.reload();
    } catch (cause) {
      setChangeError(cause instanceof ApiError ? cause.message : "تغییر برنامه انجام نشد.");
    } finally {
      setChangeBusyId(null);
    }
  };

  const pickAttachment = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSendError("فقط فایل تصویری (png، jpeg یا webp) قابل پیوست است.");
      return;
    }
    if (file.size > 3_000_000) {
      setSendError("حجم تصویر باید کمتر از ۳ مگابایت باشد.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setAttachment({ dataUrl: reader.result, name: file.name });
      setSendError(null);
    };
    reader.onerror = () => setSendError("خواندن تصویر ممکن نشد. فایل دیگری انتخاب کنید.");
    reader.readAsDataURL(file);
  };

  const submitRename = async () => {
    if (!pendingRename) return;
    const title = renameText.trim();
    if (!title) return;
    const res = await renameSub.run(() => api.chat.renameConversation(pendingRename.id, title));
    if (!res) return;
    setPendingRename(null);
    setThread((prev) =>
      prev && prev.id === res.id ? { ...prev, conversation: { ...prev.conversation, title: res.title } } : prev,
    );
    conv.reload();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    const res = await deleteSub.run(() => api.chat.deleteConversation(target.id));
    if (res) {
      if (selectedId === target.id) setSelectedId(null);
      setPendingDelete(null);
      conv.reload();
    }
  };

  /* ---------- voice panel handlers (browser engine only; audio never leaves the page as audio) ---------- */

  const startVoice = () => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setVoiceSupported(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "fa-IR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        if (res.isFinal) final += `${res[0].transcript} `;
      }
      const added = final.trim();
      if (added) setVoiceTranscript((prev) => (prev ? `${prev} ${added}` : added));
    };
    rec.onerror = (event) => {
      const denied = event.error === "not-allowed" || event.error === "service-not-allowed";
      setVoiceStatus(denied ? "denied" : "error");
      setVoiceError(
        denied
          ? "دسترسی میکروفن داده نشد. می‌توانید پیام را تایپ کنید."
          : "تشخیص گفتار شکست خورد. دوباره تلاش کنید یا پیام را بنویسید.",
      );
    };
    rec.onend = () => {
      setVoiceStatus((prev) => (prev === "listening" || prev === "processing" ? "idle" : prev));
    };
    recognitionRef.current = rec;
    setVoiceError(null);
    setVoiceStatus("listening");
    rec.start();
  };

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setVoiceStatus((prev) => (prev === "listening" ? "idle" : prev));
  };

  const closeVoice = () => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setVoiceStatus("idle");
    setVoiceError(null);
    setVoiceOpen(false);
  };

  const addTranscriptToDraft = () => {
    const text = voiceTranscript.trim();
    if (!text) return;
    setDraft((prev) => (prev ? `${prev} ${text}` : text));
    setVoiceTranscript("");
    closeVoice();
    focusComposer();
  };

  /* ---------- derived ---------- */

  const threadBlocked = !selectedId || threadReq.loading || !thread;
  const sendDisabled = threadBlocked || sending || aiReady === false;

  const messages = thread?.messages ?? [];

  /** Content of the user turn preceding a failed assistant message (for retry). */
  const retrySourceFor = (index: number): string | null => {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return null;
  };

  const failureText = (msg: ChatMessageDto): string =>
    failureTexts[msg.id] ?? observedApiSentences.get(msg.error ?? "") ?? GENERIC_FAILURE_FA;

  const errorNotice = sendError;
  const subErrorText = (e: ApiError | string | null): string | null =>
    e === null ? null : e instanceof ApiError ? e.message : String(e);

  return (
    <div className="flex flex-col gap-6 py-6 desktop:grid desktop:grid-cols-[280px_minmax(0,1fr)] desktop:items-start desktop:gap-6">
      {/* ---------- aside: assistant picker + conversation list (desktop column) ---------- */}
      <aside className="flex flex-col gap-3 desktop:sticky desktop:top-20">
        <Segmented
          label="انتخاب دستیار"
          options={assistantOptions}
          value={assistant}
          onChange={(next) => {
            if (next === assistant) return;
            setAssistant(next);
            setSelectedId(null);
            setThread(null);
          }}
        />

        {/* phones get a toggle + sheet instead of the always-visible column */}
        <div className="flex items-center gap-2 desktop:hidden">
          <Button variant="outline" size="sm" leading={<List size={14} aria-hidden />} onClick={() => setSheetOpen(true)}>
            گفت‌وگوها
            {conv.data ? <span className="num ms-1 text-2xs text-ink-3">({faNum(conversationsForAssistant.length)})</span> : null}
          </Button>
          <Button variant="secondary" size="sm" leading={<Plus size={14} aria-hidden />} loading={createSub.pending} onClick={() => void newConversation()}>
            گفت‌وگوی جدید
          </Button>
        </div>

        <Card className="hidden desktop:flex desktop:flex-col desktop:gap-3">
          <CardHead
            title="گفت‌وگوها"
            meta={ASSISTANT_FA[assistant]}
            action={
              <Button variant="secondary" size="sm" leading={<Plus size={13} aria-hidden />} loading={createSub.pending} onClick={() => void newConversation()}>
                جدید
              </Button>
            }
          />
          {conv.loading ? (
            <div className="flex items-center gap-2 text-2xs text-ink-3">
              <Spinner className="size-3.5" />
              در حال خواندن گفت‌وگوها
            </div>
          ) : conv.error ? (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-sm text-ink">{conv.error.message}</p>
              <Button variant="outline" size="sm" leading={<RotateCcw size={13} aria-hidden />} onClick={conv.reload}>
                تلاش دوباره
              </Button>
            </div>
          ) : (
            <ConversationList
              items={conversationsForAssistant}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setSheetOpen(false);
              }}
              onRename={(item) => {
                setPendingRename(item);
                setRenameText(item.title ?? "");
                renameSub.setError(null);
              }}
              onDelete={setPendingDelete}
            />
          )}
          {subErrorText(createSub.error) ? (
            <p role="alert" className="text-sm text-ink">{subErrorText(createSub.error)}</p>
          ) : null}
        </Card>
      </aside>

      {/* ---------- thread ---------- */}
      <section className="flex min-w-0 flex-col gap-3">
        {aiReady === false ? (
          <Card tone="sunken" className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <KeyRound size={15} strokeWidth={1.75} aria-hidden />
              گفت‌وگو به کلید هوش مصنوعی نیاز دارد
            </p>
            <p className="text-sm leading-relaxed text-ink-2">
              هیچ سرویس هوش مصنوعی فعالی با کلید معتبر تنظیم نشده است، بنابراین پاسخ‌دهی در این
              صفحه ممکن نیست. سایر بخش‌های برنامه — ثبت تمرین، وعده، وزن و پیشرفت — بدون کلید
              هم کار می‌کنند. پس از افزودن کلید، همین‌جا قابل استفاده خواهد بود.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => navigate("/settings")}>
                تنظیم کلید در بخش تنظیمات
              </Button>
              <Button variant="ghost" size="sm" leading={<RotateCcw size={13} aria-hidden />} loading={providers.loading} onClick={providers.reload}>
                بررسی دوباره
              </Button>
            </div>
          </Card>
        ) : null}

        {selectedId === null ? (
          conv.loading ? (
            <LoadingState label="در حال خواندن گفت‌وگوها" />
          ) : conv.error ? (
            <ErrorState title="گفت‌وگوها باز نشدند" description={conv.error.message} onRetry={conv.reload} />
          ) : (
            <Card tone="sunken" padded={false}>
              <EmptyState
                title={`هنوز گفت‌وگویی با ${ASSISTANT_FA[assistant]} ندارید`}
                description="یک گفت‌وگوی تازه بسازید و اولین پرسش خود را بنویسید؛ پیشینه در سرور نگه داشته می‌شود."
                action={
                  <Button variant="primary" size="sm" leading={<Plus size={14} aria-hidden />} loading={createSub.pending} onClick={() => void newConversation()}>
                    ساخت گفت‌وگو
                  </Button>
                }
              />
            </Card>
          )
        ) : threadReq.loading ? (
          <LoadingState label="در حال خواندن پیام‌ها" rows={4} />
        ) : threadReq.error ? (
          <ErrorState title="گفت‌وگو باز نشد" description={threadReq.error.message} onRetry={threadReq.reload} />
        ) : thread ? (
          <div role="log" aria-live="polite" aria-label="پیام‌های گفت‌وگو" className="flex flex-col gap-4">
            {messages.length === 0 ? (
              <Card tone="sunken" padded={false}>
                <EmptyState
                  title="این گفت‌وگو هنوز خالی است"
                  description={`اولین پیام خود را برای ${ASSISTANT_FA[thread.conversation.assistant]} بنویسید.`}
                />
              </Card>
            ) : (
              messages.map((msg, index) => {
                if (msg.role === "tool") {
                  // tool output stays plain text — nothing here writes plan data
                  return (
                    <Card key={msg.id} tone="sunken" className="flex flex-col gap-2 py-3">
                      <span className="text-2xs font-semibold text-ink-3">یادداشت درونی دستیار — روی برنامه اعمال نمی‌شود</span>
                      <p className="text-sm leading-relaxed whitespace-pre-line text-ink-2">{msg.content}</p>
                    </Card>
                  );
                }
                const role = toChatRole(msg.role, thread.conversation.assistant);
                const failed = msg.role !== "user" && msg.error !== null;
                const retryText = failed ? retrySourceFor(index) : null;
                return (
                  <ChatMessage
                    key={msg.id}
                    role={role}
                    content={failed ? failureText(msg) : msg.content}
                    at={msg.at}
                  >
                    {failed ? (
                      <div className="flex flex-wrap items-center gap-2 px-1">
                        <p role="alert" className="text-sm text-ink-2">
                          این پاسخ ثبت‌شده ناموفق بود. پیام شما حفظ شده است.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          leading={<RotateCcw size={13} aria-hidden />}
                          disabled={retryText === null || sending}
                          loading={sending && retryOf === msg.id}
                          onClick={() => retryText !== null && void sendContent(retryText, msg.id)}
                        >
                          تلاش دوباره
                        </Button>
                      </div>
                    ) : null}
                  </ChatMessage>
                );
              })
            )}
            <div ref={bottomRef} aria-hidden />
          </div>
        ) : null}

        {/* ---------- plan changes proposed in this conversation ---------- */}
        {selectedId && changesReq.data && changesReq.data.items.length > 0 ? (
          <section aria-label="پیشنهادهای تغییر برنامه" className="flex flex-col gap-3">
            <p className="text-2xs font-semibold text-ink-3">تغییرهای برنامه در این گفت‌وگو</p>
            {changesReq.data.items.slice(0, 6).map((change) => (
              <PlanChangeCard
                key={change.id}
                change={change}
                busy={changeBusyId === change.id}
                error={changeError}
                onApply={() => {
                  setChangeError(null);
                  setConfirmApply(change);
                }}
                onReject={() => void runChange(change, "reject")}
                onRevert={() => void runChange(change, "revert")}
              />
            ))}
          </section>
        ) : null}

        {/* ---------- status + errors ---------- */}
        {sending ? (
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-ink-2">
            <Spinner className="size-3.5" />
            در حال ارسال پیام و دریافت پاسخ…
          </p>
        ) : null}
        {errorNotice ? (
          <p role="alert" className="text-sm leading-relaxed text-ink">
            {errorNotice}{" "}
            <button type="button" onClick={() => setSendError(null)} className="underline underline-offset-4 hover:text-ink-2">
              بستن
            </button>
          </p>
        ) : null}
        {draftError ? (
          <p role="alert" className="text-sm text-ink">{draftError}</p>
        ) : null}
        {draft.trim().length > MAX_MESSAGE_CHARS - 1000 ? (
          <p className="num text-2xs text-ink-3">
            {faNum(draft.trim().length)} از {faNum(MAX_MESSAGE_CHARS)} نویسه
          </p>
        ) : null}

        {/* ---------- voice panel (browser speech-to-text only) ---------- */}
        {voiceOpen ? (
          <Card tone="sunken" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                {voiceSupported && voiceStatus !== "denied" ? (
                  <Mic size={16} strokeWidth={1.75} className={cx("shrink-0", voiceStatus === "listening" ? "animate-pulse-dot text-ink" : "text-ink-2")} aria-hidden />
                ) : (
                  <MicOff size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" aria-hidden />
                )}
                <span className="truncate">{STT_STATUS_FA[voiceSupported ? voiceStatus : "unsupported"]}</span>
              </span>
              <span className="flex items-center gap-2">
                {voiceSupported ? <Chip tone="outline">موتور مرورگر</Chip> : null}
                <IconButton label="بستن ورود صوتی" size="sm" onClick={closeVoice}>
                  <X size={14} aria-hidden />
                </IconButton>
              </span>
            </div>

            <p className="text-sm leading-relaxed text-ink-2">
              {!voiceSupported ? (
                <>
                  مرورگر شما تشخیص گفتار را پشتیبانی نمی‌کند. نوشتن پیام همیشه در دسترس است و
                  فرقی در نتیجه ایجاد نمی‌کند.
                </>
              ) : (
                <>
                  این موتور برای تبدیل گفتار به متن به اینترنت نیاز دارد. صدا به سرویس هوش
                  مصنوعی ارسال نمی‌شود و جایی ذخیره نمی‌گردد؛ تنها متن تبدیل‌شده به عنوان پیام
                  شما فرستاده می‌شود — پیش از ارسال می‌توانید ویرایشش کنید.
                </>
              )}
            </p>

            <Field label="متن تشخیص‌داده‌شده" hint="با «افزودن به پیام» به پیش‌نویس گفت‌وگو منتقل می‌شود.">
              <Textarea
                value={voiceTranscript}
                onChange={(e) => setVoiceTranscript(e.target.value)}
                className="min-h-16"
                aria-label="متن تشخیص‌داده‌شده از گفتار"
              />
            </Field>

            {voiceError ? (
              <p role="alert" className="text-sm text-ink">{voiceError}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={voiceStatus === "listening" ? "primary" : "secondary"}
                size="sm"
                leading={voiceStatus === "listening" ? <Square size={12} fill="currentColor" aria-hidden /> : <Mic size={14} aria-hidden />}
                disabled={!voiceSupported || voiceStatus === "denied" || sending}
                onClick={voiceStatus === "listening" ? stopVoice : startVoice}
              >
                {voiceStatus === "listening" ? "توقف ضبط" : "شروع ضبط"}
              </Button>
              <Button variant="primary" size="sm" disabled={voiceTranscript.trim().length === 0} onClick={addTranscriptToDraft}>
                افزودن به پیام
              </Button>
            </div>
          </Card>
        ) : null}

        {/* ---------- composer ---------- */}
        <input
          ref={attachmentInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            pickAttachment(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        {attachment ? (
          <Card tone="sunken" className="flex items-center gap-3">
            <img
              src={attachment.dataUrl}
              alt="پیش‌نمایش تصویر پیوست"
              className="size-14 shrink-0 rounded-md border border-divider object-cover"
              style={{ direction: "ltr" }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-2xs text-ink">{attachment.name}</span>
              <span className="block text-2xs text-ink-3">
                تصویر همراه پیام فرستاده می‌شود؛ فقط مدل دارای قابلیت بینایی می‌تواند آن را ببیند.
              </span>
            </span>
            <IconButton label="حذف تصویر پیوست" size="sm" onClick={() => setAttachment(null)}>
              <X size={14} aria-hidden />
            </IconButton>
          </Card>
        ) : null}
        <div ref={composerRef}>
          <ChatInput
            value={draft}
            onChange={onDraftChange}
            onSend={() => void sendContent(draft, null)}
            onVoice={() => setVoiceOpen((v) => !v)}
            onAttach={() => attachmentInputRef.current?.click()}
            placeholder={aiReady === false ? "برای گفت‌وگو ابتدا کلید هوش مصنوعی را در تنظیمات اضافه کنید…" : "پیام خود را بنویسید…"}
            disabled={sendDisabled}
            busy={sending}
          />
        </div>
        {selectedId !== null && aiReady !== false ? (
          <p className="text-2xs text-ink-3">
            Enter برای ارسال، Shift+Enter برای خط جدید. پاسخ‌های هوش مصنوعی پیشنهادی‌اند و
            بدون تأیید صریح شما روی برنامه اعمال نمی‌شوند.
          </p>
        ) : null}
      </section>

      {/* ---------- mobile conversation sheet ---------- */}
      {sheetOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-canvas/75 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheetOpen(false);
          }}
        >
          <div
            ref={sheetPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-sheet-title"
            className="w-full max-w-lg animate-rise rounded-t-card border border-line bg-card p-5 shadow-pop sm:rounded-card"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="chat-sheet-title" className="text-lg font-bold">
                گفت‌وگوها — {ASSISTANT_FA[assistant]}
              </h2>
              <IconButton label="بستن" size="sm" onClick={() => setSheetOpen(false)}>
                <X size={16} aria-hidden />
              </IconButton>
            </div>
            <div className="mb-3">
              <Button variant="secondary" size="sm" block leading={<Plus size={14} aria-hidden />} loading={createSub.pending} onClick={() => void newConversation()}>
                گفت‌وگوی جدید
              </Button>
            </div>
            {subErrorText(createSub.error) ? (
              <p role="alert" className="mb-3 text-sm text-ink">{subErrorText(createSub.error)}</p>
            ) : null}
            <div className="max-h-[60dvh] overflow-y-auto">
              {conv.loading ? (
                <p className="flex items-center gap-2 py-3 text-sm text-ink-2">
                  <Spinner className="size-3.5" />
                  در حال خواندن گفت‌وگوها
                </p>
              ) : conv.error ? (
                <ErrorState title="گفت‌وگوها باز نشدند" description={conv.error.message} onRetry={conv.reload} />
              ) : (
                <ConversationList
                  items={conversationsForAssistant}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setSheetOpen(false);
                  }}
                  onRename={(item) => {
                    setPendingRename(item);
                    setRenameText(item.title ?? "");
                    renameSub.setError(null);
                  }}
                  onDelete={(item) => {
                    setSheetOpen(false);
                    setPendingDelete(item);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------- rename conversation ---------- */}
      {pendingRename ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !renameSub.pending) setPendingRename(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-rename-title"
            className="w-full max-w-md animate-rise rounded-card border border-line bg-card p-5 shadow-pop"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="chat-rename-title" className="text-lg font-bold">
                تغییر نام گفت‌وگو
              </h2>
              <IconButton label="بستن" size="sm" onClick={() => setPendingRename(null)} disabled={renameSub.pending}>
                <X size={16} aria-hidden />
              </IconButton>
            </div>
            <Field label="نام تازه" htmlFor="chat-rename-input" hint="حداکثر ۸۰ نویسه.">
              <TextInput
                id="chat-rename-input"
                autoFocus
                value={renameText}
                maxLength={80}
                onChange={(e) => setRenameText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitRename();
                }}
              />
            </Field>
            {subErrorText(renameSub.error) ? (
              <p role="alert" className="mt-3 text-sm text-ink">{subErrorText(renameSub.error)}</p>
            ) : null}
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPendingRename(null)} disabled={renameSub.pending}>
                انصراف
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={renameSub.pending}
                disabled={renameText.trim().length === 0}
                onClick={() => void submitRename()}
              >
                ذخیرهٔ نام
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------- apply confirmation: the write gate ---------- */}
      <ConfirmationDialog
        open={confirmApply !== null}
        title="اعمال تغییر برنامه؟"
        description={
          confirmApply
            ? `«${confirmApply.summary}» پس از تأیید روی داده‌های واقعی اعمال می‌شود و صفحه‌های خانه و برنامه به‌روزرسانی می‌شوند.`
            : undefined
        }
        changes={confirmApply ? toConfirmationChanges(confirmApply) : undefined}
        confirmLabel="تأیید و اعمال تغییر"
        busy={confirmApply !== null && changeBusyId === confirmApply.id}
        onConfirm={() => confirmApply && void runChange(confirmApply, "apply")}
        onClose={() => {
          if (changeBusyId) return;
          setConfirmApply(null);
        }}
      />

      {/* ---------- delete confirmation ---------- */}
      <ConfirmationDialog
        open={pendingDelete !== null}
        title="حذف این گفت‌وگو؟"
        description={`«${pendingDelete?.title ?? "گفت‌وگوی جدید"}» و همه پیام‌هایش حذف می‌شوند. این کار قابل بازگشت نیست.${
          subErrorText(deleteSub.error) ? ` ${subErrorText(deleteSub.error)}` : ""
        }`}
        destructive
        confirmLabel="حذف گفت‌وگو"
        busy={deleteSub.pending}
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (deleteSub.pending) return;
          deleteSub.setError(null);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
