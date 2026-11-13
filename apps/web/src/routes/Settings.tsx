import { useEffect, useRef, useState } from "react";
import { Info, KeyRound, Plus, Trash2 } from "lucide-react";
import { Button, Card, CardHead, Chip, Choice, Field, IconButton, SectionTitle, Segmented, TextInput, cx } from "../components/ui";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { SettingsSection } from "../components/SettingsSection";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { FontPicker } from "../components/FontPicker";
import { api, ApiError, type Provider, type Preferences } from "../lib/api";
import { PLAN_CHANGE_STATUS_FA } from "../lib/domain";
import { faNum, faRelative } from "../lib/format";
import { useApiData, useSubmit } from "../lib/useApiData";

/**
 * AI providers, preferences and the honesty notes. The API key is strictly
 * write-only here: it is never prefilled, never echoed back in full by the
 * server, never stored in localStorage or logged. Everything the user did not
 * save stays out of the payload, and nothing pretends a Phase-6 capability
 * (apply / undo of plan changes) already works.
 */

/* ---------- shared input helpers (route-local) ---------- */

const FA_DIGIT_CHARS = "۰۱۲۳۴۵۶۷۸۹";

function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (ch) => String(FA_DIGIT_CHARS.indexOf(ch)))
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
}

/** The server stores quiet hours as "HH:MM"; accept Persian digits and 1–2 digits. */
function cleanTime(value: string): string | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(toLatinDigits(value).trim());
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours > 23) return null;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

const errorText = (error: ApiError | string | null): string =>
  error instanceof ApiError ? error.message : error ?? "";

const fieldError = (error: ApiError | string | null, key: string): string | undefined =>
  error instanceof ApiError ? error.fields[key] : undefined;

function useSavedFlash(): [boolean, () => void] {
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const flash = () => {
    setSaved(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 4000);
  };
  return [saved, flash];
}

function SavedBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span role="status" aria-live="polite" className="flex items-center gap-1 text-sm font-medium text-ink-2">
      <Info size={12} strokeWidth={2.5} aria-hidden />
      ذخیره شد
    </span>
  );
}

function ErrorLine({ error }: { error: ApiError | string | null }) {
  const text = errorText(error);
  if (!text) return null;
  return (
    <p role="alert" className="rounded-md border border-ink-3 bg-card-2 px-3 py-2 text-sm text-ink">
      {text}
    </p>
  );
}

/* ---------- providers ---------- */

const KNOWN_PROVIDERS: Record<
  string,
  { label: string; defaultName: string; defaultBaseUrl: string; isCustom: boolean; hint: string; keyHint: string; requiresKey: boolean }
> = {
  gemini: {
    label: "Google Gemini",
    defaultName: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    isCustom: false,
    hint: "سرویس هوش مصنوعی گوگل با سرعت بسیار بالا، پشتیبانی قوی از فارسی و تحلیل تصویر وعده‌ها",
    keyHint: "کلید API با AIzaSy... شروع می‌شود (دریافت رایگان از Google AI Studio)",
    requiresKey: true,
  },
  openai: {
    label: "OpenAI",
    defaultName: "OpenAI (GPT-4o)",
    defaultBaseUrl: "https://api.openai.com/v1",
    isCustom: false,
    hint: "سرویس رسمی ابری OpenAI برای مدل‌های پیشرفته GPT-4o و o3-mini",
    keyHint: "کلید API با sk-... شروع می‌شود (از پنل platform.openai.com)",
    requiresKey: true,
  },
  anthropic: {
    label: "Anthropic Claude",
    defaultName: "Anthropic Claude",
    defaultBaseUrl: "https://api.anthropic.com",
    isCustom: false,
    hint: "مدل‌های عمیق تحلیلی کلود ۳.۵ و ۴.۵",
    keyHint: "کلید API با sk-ant-... شروع می‌شود (از پنل console.anthropic.com)",
    requiresKey: true,
  },
  deepseek: {
    label: "DeepSeek",
    defaultName: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    isCustom: false,
    hint: "سرویس اقتصادی و بسیار هوشمند DeepSeek-V3 و R1 با سازگاری با پروتکل OpenAI",
    keyHint: "کلید API از پنل platform.deepseek.com",
    requiresKey: true,
  },
  groq: {
    label: "Groq",
    defaultName: "Groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    isCustom: false,
    hint: "فوق‌العاده سریع با زمان پاسخ چند میلی‌ثانیه‌ای بر روی تراشه‌های LPU برای مدل‌های Llama",
    keyHint: "کلید API با gsk_... شروع می‌شود (رایگان از console.groq.com)",
    requiresKey: true,
  },
  ollama: {
    label: "Ollama (محلی)",
    defaultName: "Ollama محلی",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    isCustom: false,
    hint: "اجرای مدل‌های هوش مصنوعی روی کامپیوتر خودتان کاملاً آفلاین و رایگان بدون اینترنت",
    keyHint: "سرویس محلی نیازی به کلید API ندارد",
    requiresKey: false,
  },
  custom: {
    label: "سرویس سفارشی",
    defaultName: "سرویس سفارشی",
    defaultBaseUrl: "",
    isCustom: true,
    hint: "اتصال به هر سرور پروکسی، رله ایرانی، vLLM، LocalAI یا ارائه‌دهندهٔ دلخواه سازگار با OpenAI",
    keyHint: "کلید احراز هویت سرور (در صورت نیاز)",
    requiresKey: false,
  },
};

const providerFa = (id: string): string => KNOWN_PROVIDERS[id]?.label ?? id;

function ProviderCard({
  provider,
  onChanged,
  onRequestDelete,
}: {
  provider: Provider;
  onChanged: () => void;
  onRequestDelete: (provider: Provider) => void;
}) {
  const meta = KNOWN_PROVIDERS[provider.provider];
  const isCustom = !meta || meta.isCustom;

  const [label, setLabel] = useState(provider.label);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(provider.enabled);
  const [isDefault, setIsDefault] = useState(provider.isDefault);
  const [note, setNote] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
    method?: string;
  } | null>(null);
  const submit = useSubmit();
  const [saved, flash] = useSavedFlash();

  useEffect(() => {
    setLabel(provider.label);
    setBaseUrl(provider.baseUrl ?? "");
    setApiKey("");
    setEnabled(provider.enabled);
    setIsDefault(provider.isDefault);
    setNote(null);
    setVerifyResult(null);
  }, [provider]);

  const trimmedLabel = label.trim();
  const labelInvalid = trimmedLabel === "";
  const keyInvalid = apiKey !== "" && apiKey.trim().length < 8;

  const testConnection = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await api.providers.verify(provider.id);
      setVerifyResult(res);
    } catch (err) {
      setVerifyResult({
        ok: false,
        message: err instanceof ApiError ? err.message : "خطا در برقراری ارتباط با سرویس هوش مصنوعی",
      });
    } finally {
      setVerifying(false);
    }
  };

  const save = async () => {
    if (labelInvalid || keyInvalid) return;
    const body: Parameters<typeof api.providers.patch>[1] = {};
    if (trimmedLabel !== provider.label) body.label = trimmedLabel;
    const bu = baseUrl.trim();
    if (bu !== "" && bu !== (provider.baseUrl ?? "")) body.baseUrl = bu;
    if (apiKey !== "") body.apiKey = apiKey.trim();
    if (enabled !== provider.enabled) body.enabled = enabled;
    if (isDefault !== provider.isDefault) body.isDefault = isDefault;

    if (Object.keys(body).length === 0) {
      setNote("تغییری برای ذخیره نیست.");
      return;
    }
    const result = await submit.run(() => api.providers.patch(provider.id, body));
    if (result) {
      flash();
      onChanged();
    }
  };

  return (
    <Card tone="sunken" className="flex flex-col gap-4">
      <CardHead
        title={provider.label}
        meta={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Chip tone="neutral">{providerFa(provider.provider)}</Chip>
            {provider.isDefault ? <Chip tone="solid">پیش‌فرض</Chip> : null}
            {provider.enabled ? <Chip tone="outline">فعال</Chip> : <Chip tone="neutral">غیرفعال</Chip>}
            <span>ساخته‌شده {faRelative(provider.createdAt)}</span>
          </span>
        }
        action={
          <IconButton label={`حذف ${provider.label}`} size="sm" onClick={() => onRequestDelete(provider)}>
            <Trash2 size={14} strokeWidth={1.75} aria-hidden />
          </IconButton>
        }
      />

      {provider.hasKey && provider.keyMask ? (
        <p className="text-2xs text-ink-2">
          کلید ذخیره‌شده (نمایش ماسک‌شده فقط):{" "}
          <span dir="ltr" className="font-mono">
            {provider.keyMask}
          </span>
        </p>
      ) : (
        <p className="text-2xs text-ink-3">برای این ارائه‌دهنده کلیدی ثبت نشده است.</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="نام نمایشی" htmlFor={`p-${provider.id}-label`} error={fieldError(submit.error, "label") ?? (labelInvalid ? "نام نمایشی نمی‌تواند خالی باشد." : undefined)}>
          <TextInput id={`p-${provider.id}-label`} value={label} maxLength={60} invalid={labelInvalid} onChange={(e) => setLabel(e.target.value)} />
        </Field>

        {isCustom ? (
          <Field
            label="نشانی سرور (Base URL)"
            htmlFor={`p-${provider.id}-base`}
            hint="آدرس سرور یا پروکسی سفارشی سازگار با OpenAI"
            error={fieldError(submit.error, "baseUrl")}
          >
            <TextInput
              id={`p-${provider.id}-base`}
              dir="ltr"
              inputMode="url"
              autoComplete="off"
              className="text-left font-mono"
              placeholder="https://…"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </Field>
        ) : (
          <div className="flex flex-col gap-1.5 justify-end">
            <span className="text-sm font-medium text-ink-2">نشانی رسمی سرور</span>
            <div className="flex items-center gap-2 rounded-full border border-divider bg-card px-3 py-2 text-xs text-ink-2">
              <span className="size-2 rounded-full bg-emerald-400 shrink-0" aria-hidden />
              <code dir="ltr" className="font-mono text-ink text-2xs truncate">
                {provider.baseUrl || meta?.defaultBaseUrl}
              </code>
            </div>
          </div>
        )}

        <Field
          label="کلید دسترسی"
          htmlFor={`p-${provider.id}-key`}
          hint={meta?.requiresKey ? "اختیاری — برای تعویض کلید فعلی؛ حداقل ۸ نویسه. خالی بماند، کلید فعلی دست نمی‌خورد." : "این سرویس نیازی به کلید ندارد"}
          error={fieldError(submit.error, "apiKey") ?? (keyInvalid ? "کلید باید حداقل ۸ نویسه باشد." : undefined)}
        >
          <TextInput
            id={`p-${provider.id}-key`}
            type="password"
            dir="ltr"
            autoComplete="new-password"
            className="text-left font-mono"
            placeholder={meta?.requiresKey ? "کلید جدید را وارد کنید..." : "بدون نیاز به کلید"}
            disabled={!meta?.requiresKey && !isCustom}
            value={apiKey}
            invalid={keyInvalid}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-2 justify-end">
          <span className="text-sm font-medium text-ink-2">وضعیت</span>
          <div className="flex flex-wrap gap-2">
            <Choice selected={enabled} onClick={() => setEnabled((v) => !v)}>
              فعال
            </Choice>
            <Choice selected={isDefault} onClick={() => setIsDefault((v) => !v)}>
              پیش‌فرض
            </Choice>
          </div>
        </div>
      </div>

      {/* Verification section */}
      <div className="flex flex-col gap-2 rounded-2xl border border-divider/60 bg-card/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-ink">بررسی اتصال و وضعیت کلید</span>
            <span className="text-2xs text-ink-3">ارسال درخواست آزمایشی برای اطمینان از پاسخگویی API</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={verifying}
            onClick={() => void testConnection()}
          >
            تست اتصال کلید
          </Button>
        </div>
        {verifyResult ? (
          <div
            className={cx(
              "flex items-center gap-2 rounded-xl p-2.5 text-xs font-medium leading-relaxed",
              verifyResult.ok
                ? "border border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                : "border border-red-500/25 bg-red-500/10 text-red-400",
            )}
          >
            <span className={cx("size-2 rounded-full shrink-0", verifyResult.ok ? "bg-emerald-400" : "bg-red-400")} />
            <span className="flex-1">{verifyResult.message}</span>
            {verifyResult.latencyMs !== undefined ? (
              <span dir="ltr" className="font-mono text-2xs opacity-80 shrink-0">
                {faNum(verifyResult.latencyMs)} ms
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {note ? <p role="status" className="text-sm text-ink-3">{note}</p> : null}
      <ErrorLine error={submit.error} />

      <div className="flex items-center justify-between gap-3">
        <SavedBadge visible={saved} />
        <Button variant="primary" size="sm" loading={submit.pending} disabled={labelInvalid || keyInvalid} onClick={() => void save()}>
          ذخیره تغییرات
        </Button>
      </div>
    </Card>
  );
}

function ProvidersSection() {
  const { data, error, loading, reload } = useApiData(() => api.providers.list(), []);
  const [kind, setKind] = useState<string | null>("gemini");
  const [label, setLabel] = useState(KNOWN_PROVIDERS["gemini"]?.defaultName ?? "Google Gemini");
  const [baseUrl, setBaseUrl] = useState(KNOWN_PROVIDERS["gemini"]?.defaultBaseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const createSubmit = useSubmit();
  const removeSubmit = useSubmit();
  const [saved, flash] = useSavedFlash();
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);

  const selectedMeta = kind ? KNOWN_PROVIDERS[kind] : null;
  const isCustomKind = selectedMeta?.isCustom ?? false;

  const handleSelectKind = (id: string) => {
    setKind(id);
    const meta = KNOWN_PROVIDERS[id];
    if (meta) {
      if (!label || Object.values(KNOWN_PROVIDERS).some((p) => p.defaultName === label)) {
        setLabel(meta.defaultName);
      }
      setBaseUrl(meta.defaultBaseUrl);
    }
  };

  const labelInvalid = label.trim() === "";
  const keyInvalid = selectedMeta?.requiresKey && apiKey.trim().length > 0 && apiKey.trim().length < 8;

  const create = async () => {
    if (!kind || labelInvalid || keyInvalid) return;
    const result = await createSubmit.run(() =>
      api.providers.create({
        provider: kind,
        label: label.trim(),
        baseUrl: isCustomKind ? (baseUrl.trim() || undefined) : undefined,
        apiKey: apiKey.trim() || undefined,
        enabled: true,
      }),
    );
    if (result) {
      setKind("gemini");
      setLabel(KNOWN_PROVIDERS["gemini"]?.defaultName ?? "Google Gemini");
      setBaseUrl(KNOWN_PROVIDERS["gemini"]?.defaultBaseUrl ?? "");
      setApiKey("");
      flash();
      reload();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const result = await removeSubmit.run(() => api.providers.remove(id));
    if (result?.deleted) {
      setDeleteTarget(null);
      reload();
    }
  };

  return (
    <SettingsSection
      title="ارائه‌دهنده‌های هوش مصنوعی"
      description="کلیدها فقط روی سرور و رمزنگاری‌شده ذخیره می‌شوند"
      summary={data ? `${faNum(data.items.length)} ارائه‌دهنده` : undefined}
    >
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2 rounded-md border border-divider bg-card-2 p-3 text-sm leading-relaxed text-ink-2">
          <KeyRound size={13} className="mt-1 shrink-0" aria-hidden />
          کلید دسترسی هنگام ثبت روی سرور رمزنگاری می‌شود و هرگز — حتی ماسک‌شدهٔ کامل — به
          این مرورگر بازگردانده نمی‌شود؛ آنچه نمایش داده می‌شود فقط بخشی از کلید است.
          کلید در این صفحه پیش‌پر نمی‌شود، در حافظهٔ محلی ذخیره نمی‌شود و در هیچ جایی
          ثبت (لاگ) نمی‌شود.
        </p>

        {loading ? (
          <LoadingState label="در حال خواندن ارائه‌دهنده‌ها" rows={2} />
        ) : error ? (
          <ErrorState title="فهرست ارائه‌دهنده‌ها نمایش داده نشد" description={error.message} onRetry={reload} />
        ) : data && data.items.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2">
            {data.items.map((p) => (
              <ProviderCard key={p.id} provider={p} onChanged={reload} onRequestDelete={(target) => setDeleteTarget(target)} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="هنوز ارائه‌دهنده‌ای اضافه نشده"
            description="بدون کلید، گفت‌وگو و تحلیل تصویر کار نمی‌کند؛ ثبت دستی داده‌ها مستقل از هوش مصنوعی کار می‌کند."
          />
        )}

        <Card className="flex flex-col gap-4">
          <CardHead title="افزودن ارائه‌دهنده" meta="با انتخاب هر شرکت، نشانی رسمی سرور خودکار تنظیم می‌شود و نیازی به ورود نشانی نیست." />

          <div role="group" aria-label="نوع ارائه‌دهنده" className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink-2">انتخاب شرکت یا سرویس هوش مصنوعی</span>
            <div className="flex flex-wrap gap-2">
              {Object.keys(KNOWN_PROVIDERS).map((id) => (
                <Choice key={id} selected={kind === id} onClick={() => handleSelectKind(id)}>
                  {providerFa(id)}
                </Choice>
              ))}
            </div>
            {selectedMeta ? (
              <p className="mt-1 text-xs text-ink-2 bg-card-3/40 rounded-xl p-3 border border-divider/50">
                {selectedMeta.hint}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="نام نمایشی" htmlFor="np-label" error={fieldError(createSubmit.error, "label") ?? (labelInvalid ? "نام نمایشی نمی‌تواند خالی باشد." : undefined)}>
              <TextInput id="np-label" value={label} maxLength={60} invalid={labelInvalid} onChange={(e) => setLabel(e.target.value)} />
            </Field>

            {isCustomKind ? (
              <Field
                label="نشانی سرور (Base URL)"
                htmlFor="np-base"
                hint="آدرس سرور یا پروکسی سفارشی سازگار با OpenAI، مثلاً https://api.proxy.com/v1"
                error={fieldError(createSubmit.error, "baseUrl")}
              >
                <TextInput
                  id="np-base"
                  dir="ltr"
                  inputMode="url"
                  autoComplete="off"
                  className="text-left font-mono"
                  placeholder="https://…"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </Field>
            ) : selectedMeta ? (
              <div className="col-span-full flex items-center justify-between gap-3 rounded-2xl border border-divider/60 bg-card/60 px-4 py-3 text-xs text-ink-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="size-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                  <span className="font-medium shrink-0">نشانی رسمی سرور ({selectedMeta.label}):</span>
                  <code dir="ltr" className="font-mono text-ink text-2xs bg-card-2 px-2 py-1 rounded-md border border-divider/40 truncate">
                    {selectedMeta.defaultBaseUrl}
                  </code>
                </div>
                <span className="text-2xs text-ink-3 shrink-0 hidden sm:inline">✓ نشانی سرور به‌طور خودکار تنظیم شد</span>
              </div>
            ) : null}

            {kind === "ollama" ? (
              <div className="col-span-full rounded-2xl border border-divider/60 bg-card/60 p-3 text-xs text-ink-2">
                <span>سرویس Ollama روی رایانه شما اجرا می‌شود و نیازی به وارد کردن کلید دسترسی ندارد. فقط مطمئن شوید دستور </span>
                <code dir="ltr" className="font-mono text-ink">ollama serve</code>
                <span> در حال اجرا است.</span>
              </div>
            ) : (
              <Field
                label="کلید دسترسی (API Key)"
                htmlFor="np-key"
                hint={selectedMeta?.keyHint ?? "حداقل ۸ نویسه. می‌توانید بعداً هم اضافه‌اش کنید."}
                error={fieldError(createSubmit.error, "apiKey") ?? (keyInvalid ? "کلید باید حداقل ۸ نویسه باشد." : undefined)}
              >
                <TextInput
                  id="np-key"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  className="text-left font-mono"
                  placeholder="کلید API را اینجا وارد کنید..."
                  value={apiKey}
                  invalid={keyInvalid}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </Field>
            )}

            <div className="flex items-end sm:col-start-2">
              <Button
                variant="primary"
                block
                leading={<Plus size={15} aria-hidden />}
                loading={createSubmit.pending}
                disabled={!kind || labelInvalid || keyInvalid}
                onClick={() => void create()}
              >
                افزودن ارائه‌دهنده
              </Button>
            </div>
          </div>

          {createSubmit.error && Object.keys(createSubmit.error instanceof ApiError ? createSubmit.error.fields : {}).length === 0 ? (
            <ErrorLine error={createSubmit.error} />
          ) : null}
          <SavedBadge visible={saved} />
        </Card>

        <ConfirmationDialog
          open={deleteTarget !== null}
          title="حذف این ارائه‌دهنده؟"
          description={
            deleteTarget
              ? `«${deleteTarget.label}» و کلید رمزنگاری‌شدهٔ آن حذف می‌شوند. این کار قابل بازگشت نیست.`
              : undefined
          }
          destructive
          confirmLabel="حذف"
          busy={removeSubmit.pending}
          onConfirm={() => void confirmDelete()}
          onClose={() => {
            if (!removeSubmit.pending) setDeleteTarget(null);
          }}
        />
        <ErrorLine error={removeSubmit.error} />
      </div>
    </SettingsSection>
  );
}

/* ---------- preferences ---------- */

type UnitsValue = Preferences["units"];
type RemindersValue = Preferences["reminders"];
type CoachValue = Preferences["coach"];

const WEIGHT_OPTIONS: ReadonlyArray<{ value: UnitsValue["weight"]; label: string }> = [
  { value: "kg", label: "کیلوگرم" },
  { value: "lb", label: "پوند" },
];

const LENGTH_OPTIONS: ReadonlyArray<{ value: UnitsValue["length"]; label: string }> = [
  { value: "cm", label: "سانتی‌متر" },
  { value: "in", label: "اینچ" },
];

const TONE_OPTIONS: ReadonlyArray<{ value: CoachValue["tone"]; label: string }> = [
  { value: "concise", label: "مختصر" },
  { value: "detailed", label: "کامل" },
  { value: "supportive", label: "حامی" },
];

const STRICTNESS_OPTIONS: ReadonlyArray<{ value: CoachValue["strictness"]; label: string }> = [
  { value: "gentle", label: "آرام" },
  { value: "balanced", label: "متعادل" },
  { value: "demanding", label: "جدّی" },
];

function UnitsCard({ server, reload }: { server: Partial<Preferences> | null; reload: () => void }) {
  const [draft, setDraft] = useState<UnitsValue>({ weight: "kg", length: "cm" });
  const seeded = useRef(false);
  const submit = useSubmit();
  const [saved, flash] = useSavedFlash();

  useEffect(() => {
    if (seeded.current || !server?.units) return;
    seeded.current = true;
    setDraft(server.units);
  }, [server]);

  const save = async () => {
    const result = await submit.run(() => api.profile.setPreference("units", draft));
    if (result) {
      flash();
      reload();
    }
  };

  return (
    <Card tone="sunken" className="flex flex-col gap-4">
      <CardHead
        title="یکاها"
        meta={server?.units ? "از سرور خوانده شد" : "مقادیر پیش‌فرض فرم — تا ذخیره، روی سرور چیزی نیست"}
      />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink-2">وزن</span>
        <Segmented label="واحد وزن" options={WEIGHT_OPTIONS} value={draft.weight} onChange={(v) => setDraft((d) => ({ ...d, weight: v }))} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink-2">قد و طول</span>
        <Segmented label="واحد طول" options={LENGTH_OPTIONS} value={draft.length} onChange={(v) => setDraft((d) => ({ ...d, length: v }))} />
      </div>
      <ErrorLine error={submit.error} />
      <div className="flex items-center justify-between gap-3">
        <SavedBadge visible={saved} />
        <Button variant="primary" size="sm" loading={submit.pending} onClick={() => void save()}>
          ذخیره یکاها
        </Button>
      </div>
    </Card>
  );
}

function RemindersCard({ server, reload }: { server: Partial<Preferences> | null; reload: () => void }) {
  const [draft, setDraft] = useState<RemindersValue>({
    workout: false,
    water: false,
    weighIn: false,
    quietFrom: "22:00",
    quietTo: "07:00",
  });
  const seeded = useRef(false);
  const submit = useSubmit();
  const [saved, flash] = useSavedFlash();

  useEffect(() => {
    if (seeded.current || !server?.reminders) return;
    seeded.current = true;
    setDraft(server.reminders);
  }, [server]);

  const from = cleanTime(draft.quietFrom);
  const to = cleanTime(draft.quietTo);
  const timeInvalid = from === null || to === null;

  const save = async () => {
    if (timeInvalid || from === null || to === null) return;
    const result = await submit.run(() =>
      api.profile.setPreference("reminders", { ...draft, quietFrom: from, quietTo: to }),
    );
    if (result) {
      flash();
      reload();
    }
  };

  const toggle = (key: "workout" | "water" | "weighIn") => setDraft((d) => ({ ...d, [key]: !d[key] }));

  return (
    <Card tone="sunken" className="flex flex-col gap-4">
      <CardHead
        title="یادآوری‌ها"
        meta={server?.reminders ? "از سرور خوانده شد" : "مقادیر پیش‌فرض فرم — تا ذخیره، روی سرور چیزی نیست"}
      />
      <div role="group" aria-label="یادآوری‌ها" className="flex flex-wrap gap-2">
        <Choice selected={draft.workout} onClick={() => toggle("workout")}>
          یادآوری تمرین
        </Choice>
        <Choice selected={draft.water} onClick={() => toggle("water")}>
          یادآوری آب
        </Choice>
        <Choice selected={draft.weighIn} onClick={() => toggle("weighIn")}>
          یادآوری وزن‌کشی
        </Choice>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="سکوت از" htmlFor="rm-from" hint="HH:MM" error={timeInvalid ? "قالب ساعت باید معتبر باشد، مثلاً ۲۲:۳۰." : undefined}>
          <TextInput
            id="rm-from"
            dir="ltr"
            inputMode="numeric"
            maxLength={5}
            className="text-left font-mono"
            value={draft.quietFrom}
            invalid={timeInvalid}
            onChange={(e) => setDraft((d) => ({ ...d, quietFrom: e.target.value }))}
          />
        </Field>
        <Field label="سکوت تا" htmlFor="rm-to" hint="HH:MM" error={undefined}>
          <TextInput
            id="rm-to"
            dir="ltr"
            inputMode="numeric"
            maxLength={5}
            className="text-left font-mono"
            value={draft.quietTo}
            invalid={timeInvalid}
            onChange={(e) => setDraft((d) => ({ ...d, quietTo: e.target.value }))}
          />
        </Field>
      </div>
      <ErrorLine error={submit.error} />
      <div className="flex items-center justify-between gap-3">
        <SavedBadge visible={saved} />
        <Button variant="primary" size="sm" loading={submit.pending} disabled={timeInvalid} onClick={() => void save()}>
          ذخیره یادآوری‌ها
        </Button>
      </div>
    </Card>
  );
}

function CoachCard({ server, reload }: { server: Partial<Preferences> | null; reload: () => void }) {
  const [draft, setDraft] = useState<CoachValue>({
    tone: "concise",
    strictness: "balanced",
    allowAiPlanEdits: false,
  });
  const seeded = useRef(false);
  const submit = useSubmit();
  const [saved, flash] = useSavedFlash();

  useEffect(() => {
    if (seeded.current || !server?.coach) return;
    seeded.current = true;
    setDraft(server.coach);
  }, [server]);

  const save = async () => {
    const result = await submit.run(() => api.profile.setPreference("coach", draft));
    if (result) {
      flash();
      reload();
    }
  };

  return (
    <Card tone="sunken" className="flex flex-col gap-4">
      <CardHead
        title="لحن مربی"
        meta={server?.coach ? "از سرور خوانده شد" : "مقادیر پیش‌فرض فرم — تا ذخیره، روی سرور چیزی نیست"}
      />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink-2">لحن پاسخ‌ها</span>
        <Segmented label="لحن پاسخ‌ها" options={TONE_OPTIONS} value={draft.tone} onChange={(v) => setDraft((d) => ({ ...d, tone: v }))} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink-2">سخت‌گیری</span>
        <Segmented label="سخت‌گیری" options={STRICTNESS_OPTIONS} value={draft.strictness} onChange={(v) => setDraft((d) => ({ ...d, strictness: v }))} />
      </div>
      <div role="group" aria-label="ویرایش برنامه توسط هوش مصنوعی" className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink-2">دسترسی هوش مصنوعی به برنامه</span>
        <div className="flex flex-wrap gap-2">
          <Choice selected={draft.allowAiPlanEdits} onClick={() => setDraft((d) => ({ ...d, allowAiPlanEdits: !d.allowAiPlanEdits }))}>
            ویرایش برنامه با پیشنهاد هوش مصنوعی
          </Choice>
        </div>
        <p className="text-sm leading-relaxed text-ink-3">
          حتی با این گزینه روشن، هیچ تغییری بدون تأیید شما اعمال نمی‌شود.
        </p>
      </div>
      <ErrorLine error={submit.error} />
      <div className="flex items-center justify-between gap-3">
        <SavedBadge visible={saved} />
        <Button variant="primary" size="sm" loading={submit.pending} onClick={() => void save()}>
          ذخیره ترجیحات مربی
        </Button>
      </div>
    </Card>
  );
}

/* ---------- honesty + appearance ---------- */

const STATUS_TONE: Record<keyof typeof PLAN_CHANGE_STATUS_FA, "solid" | "outline" | "neutral"> = {
  pending: "solid",
  confirmed: "outline",
  applied: "outline",
  rejected: "neutral",
  reverted: "neutral",
};

function HonestySection() {
  const changes = useApiData(() => api.planChanges.list(), []);

  return (
    <SettingsSection title="داده و صداقت" description="قرارهای این برنامه با شما، شفاف و بدون ادعا">
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2 text-sm leading-relaxed text-ink-2">
          <li className="flex items-start gap-2">
            <Info size={12} className="mt-1 shrink-0" aria-hidden />
            پیشنهادهای هوش مصنوعی تا تأیید صریح شما هیچ داده‌ای را تغییر نمی‌دهند.
          </li>
          <li className="flex items-start gap-2">
            <Info size={12} className="mt-1 shrink-0" aria-hidden />
            مقدارهای محاسبه‌شده (مانند انرژی روزانه) همیشه با برچسب «تقریبی» نمایش داده
            می‌شوند و به‌جای اندازه‌گیری واقعی جا نمی‌زنند.
          </li>
          <li className="flex items-start gap-2">
            <Info size={12} className="mt-1 shrink-0" aria-hidden />
            اعمال و بازگرداندن تغییرات برنامه با فاز ۶ افزوده می‌شود؛ در این نسخه فقط
            وضعیت پیشنهادها نمایش داده می‌شود و هیچ دکمهٔ اعمال یا بازگردانی کار نمی‌کند.
          </li>
        </ul>

        {changes.loading ? (
          <LoadingState label="در حال خواندن وضعیت تغییرات" rows={2} />
        ) : changes.error ? (
          <ErrorState title="وضعیت تغییرات برنامه در دسترس نیست" description={changes.error.message} onRetry={changes.reload} />
        ) : changes.data && changes.data.items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {changes.data.items.slice(0, 6).map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 rounded-md border border-divider bg-card-2 px-3 py-2 text-2xs">
                <span className="min-w-0">{c.summary}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-ink-3">{faRelative(c.createdAt)}</span>
                  <Chip tone={STATUS_TONE[c.status]}>{PLAN_CHANGE_STATUS_FA[c.status]}</Chip>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" className="text-sm text-ink-3">در حال حاضر هیچ پیشنهاد تغییری ثبت نشده است.</p>
        )}
      </div>
    </SettingsSection>
  );
}

function AppearanceSection() {
  return (
    <SettingsSection
      title="ظاهر و تایپوگرافی"
      description="رنگ‌ها ثابت‌اند؛ قلم را خودتان انتخاب می‌کنید"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-2">
          <p>
            پالت این برنامه به‌عمد تک‌رنگ (سیاه‌وسفید) است: تضاد جوهر، ضخامت خط و سطح
            کارت‌ها پیام‌ها را منتقل می‌کنند، نه رنگ. برای همین کلید تعویض تم رنگی
            ارائه نشده است تا خوانایی متن فارسی و کنتراست یکپارچه بماند.
          </p>
          <p>تقویم جلالی، ارقام فارسی و چیدمان راست‌به‌چپ همیشه روشن‌اند و بخشی از طراحی‌اند، نه تنظیم.</p>
        </div>
        <FontPicker />
      </div>
    </SettingsSection>
  );
}

/* ---------- page ---------- */

export function Settings() {
  const prefs = useApiData(() => api.profile.preferences(), []);

  return (
    <div className="flex flex-col gap-6 py-6">
      <SectionTitle title="تنظیمات" description="هوش مصنوعی، ترجیحات برنامه و شفافیت داده‌ها." />

      <ProvidersSection />

      <div className="flex flex-col gap-3">
        <SectionTitle title="ترجیحات" description="هر کارت جدا و با کل مقدار خودش ذخیره می‌شود." />
        {prefs.loading ? (
          <LoadingState label="در حال بارگذاری ترجیحات" rows={3} />
        ) : prefs.error ? (
          <ErrorState title="ترجیحات بارگذاری نشد" description={prefs.error.message} onRetry={prefs.reload} />
        ) : (
          <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2">
            <UnitsCard server={prefs.data} reload={prefs.reload} />
            <RemindersCard server={prefs.data} reload={prefs.reload} />
            <CoachCard server={prefs.data} reload={prefs.reload} />
          </div>
        )}
      </div>

      <HonestySection />
      <AppearanceSection />
    </div>
  );
}
