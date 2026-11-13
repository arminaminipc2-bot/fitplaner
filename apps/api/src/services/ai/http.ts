import { env } from "../../env.js";
import { AppError } from "../../http.js";
import type { ProviderId } from "./types.js";

/**
 * Every outbound provider call goes through here, so the two things that would
 * otherwise hang or explode a request thread are enforced in one place:
 * a hard deadline and a hard byte cap. Nothing in this file may put provider
 * key material into a message, a log line or a thrown error.
 */

export const DEFAULT_TIMEOUT_MS = 45_000;
export const DEFAULT_STREAM_IDLE_MS = 30_000;
export const DEFAULT_MAX_BYTES = 4_000_000;

type Guard = {
  timeoutMs: number;
  idleMs: number;
  maxBytes: number;
  /** Substrings that must never appear in an error message (the API key). */
  redact: string[];
  provider: ProviderId;
  label: string;
};

export function guard(
  partial: Partial<Guard> & { provider: ProviderId; label: string },
): Guard {
  return {
    timeoutMs: partial.timeoutMs ?? env.AI_TIMEOUT_MS,
    idleMs: partial.idleMs ?? env.AI_STREAM_IDLE_MS,
    maxBytes: partial.maxBytes ?? env.AI_MAX_RESPONSE_BYTES,
    redact: partial.redact ?? [],
    provider: partial.provider,
    label: partial.label,
  };
}

/** Keys are never logged; this scrubs any of them out of provider text. */
export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 6) out = out.split(secret).join("•");
  }
  return out;
}

/**
 * The whole-call deadline plus the caller's own abort (a browser closing an SSE
 * connection). Stream inactivity is timed separately in `readSse`.
 */
function deadline(external?: AbortSignal, timeoutMs = env.AI_TIMEOUT_MS) {
  const controller = new AbortController();
  const hard = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const onExternal = () => controller.abort(external?.reason ?? new Error("aborted"));
  if (external) {
    if (external.aborted) onExternal();
    else external.addEventListener("abort", onExternal, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(hard);
      external?.removeEventListener("abort", onExternal);
    },
    abortedReason: () => controller.signal.reason,
  };
}

/** Maps an aborted/failed fetch onto the honest Persian reason it represents. */
function transportError(reason: Error, g: Guard): AppError {
  if (reason.message === "aborted") {
    return new AppError(500, "ai_cancelled", "دریافت پاسخ لغو شد و چیزی ذخیره نشد.");
  }
  return new AppError(
    504,
    "ai_timeout",
    `پاسخ سرویس هوش مصنوعی «${g.label}» در زمان مجاز نرسید. دوباره تلاش کنید یا مدل سبک‌تری انتخاب کنید.`,
  );
}

export type HttpResponse = {
  status: number;
  ok: boolean;
  text: string;
};

/**
 * Non-streaming fetch with a deadline and a byte cap. A non-2xx response is
 * returned as-is so the adapter can map the status; only transport failures
 * throw.
 */
export async function fetchBounded(
  url: string,
  init: RequestInit,
  g: Guard,
  external?: AbortSignal,
): Promise<HttpResponse> {
  const timer = deadline(external, g.timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: timer.signal });
  } catch (error) {
    timer.dispose();
    throw networkOrTimeout(error, g, timer.abortedReason());
  }

  try {
    const text = await readCapped(response, g, timer);
    timer.dispose();
    return { status: response.status, ok: response.ok, text };
  } catch (error) {
    timer.dispose();
    if (error instanceof AppError) throw error;
    throw networkOrTimeout(error, g, timer.abortedReason());
  }
}

function networkOrTimeout(raw: unknown, g: Guard, reason: unknown): AppError {
  if (raw instanceof AppError) return raw;
  if (
    reason instanceof Error &&
    (reason.message === "timeout" || reason.message === "idle" || reason.message === "aborted")
  ) {
    return transportError(reason, g);
  }
  const detail = redact(String(raw instanceof Error ? raw.message : raw), g.redact).slice(0, 200);
  // The provider host and the failure text go to the log, never the key.
  console.error(`[ai] ${g.provider} transport failure: ${detail}`);
  return new AppError(
    502,
    "ai_network_unreachable",
    `اتصال به سرویس هوش مصنوعی «${g.label}» برقرار نشد. اینترنت یا آدرس پایهٔ سرویس را بررسی کنید.`,
  );
}

async function readCapped(
  res: Response,
  g: Guard,
  timer: { signal: AbortSignal; abortedReason: () => unknown },
): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await withAbort(reader.read(), timer.signal);
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > g.maxBytes) {
        await reader.cancel().catch(() => {});
        throw new AppError(
          502,
          "ai_response_too_large",
          "پاسخ سرویس هوش مصنوعی از حد مجاز بزرگ‌تر بود و کامل خوانده نشد.",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof AppError) throw error;
    const reason = timer.abortedReason();
    if (reason instanceof Error) throw transportError(reason, g);
    throw networkOrTimeout(error, g, reason);
  }
  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return redact(buffer.toString("utf8"), g.redact);
}

/**
 * A response body read while a deadline is armed. The read is raced against the
 * abort signal rather than trusting the stream to notice it: a provider that
 * stalls without closing its socket would otherwise keep the request open past
 * the deadline, which is exactly the hang this layer must never allow.
 */
function withAbort<T>(read: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    read.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** Reads an image body as bytes under the same deadline and byte cap. */
export async function fetchBytes(
  url: string,
  init: RequestInit,
  g: Guard,
  external?: AbortSignal,
): Promise<{ status: number; ok: boolean; contentType: string; bytes: Buffer }> {
  const timer = deadline(external, g.timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: timer.signal });
  } catch (error) {
    timer.dispose();
    throw networkOrTimeout(error, g, timer.abortedReason());
  }

  try {
    if (!response.body) {
      timer.dispose();
      return { status: response.status, ok: response.ok, contentType: "", bytes: Buffer.alloc(0) };
    }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await withAbort(reader.read(), timer.signal);
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > g.maxBytes) {
        void reader.cancel().catch(() => {});
        throw new AppError(
          422,
          "ai_image_too_large",
          "حجم تصویر از حد مجاز بیشتر است. تصویر کوچک‌تری بفرستید.",
        );
      }
      chunks.push(Buffer.from(value));
    }
    timer.dispose();
    return {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type") ?? "",
      bytes: Buffer.concat(chunks),
    };
  } catch (error) {
    timer.dispose();
    if (error instanceof AppError) throw error;
    throw networkOrTimeout(error, g, timer.abortedReason());
  }
}

/**
 * A streaming response plus the deadline that owns it. The caller must
 * `dispose()` the handle when the stream ends so the hard timer does not outlive
 * the request.
 */
export type StreamHandle = {
  res: Response;
  signal: AbortSignal;
  reason: () => unknown;
  dispose: () => void;
};

/**
 * Opens a streaming response. Non-2xx comes back as a handle too — the adapter
 * reads the small error body and maps the status, so a rejected key never looks
 * like an empty answer.
 */
export async function fetchStreaming(
  url: string,
  init: RequestInit,
  g: Guard,
  external?: AbortSignal,
): Promise<StreamHandle> {
  const timer = deadline(external, g.timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: timer.signal });
    return { res, signal: timer.signal, reason: timer.abortedReason, dispose: timer.dispose };
  } catch (error) {
    const reason = timer.abortedReason();
    timer.dispose();
    throw networkOrTimeout(error, g, reason);
  }
}

/**
 * Streams the response body, yielding decoded SSE frames. A stalled provider is
 * cut off by the idle timer (which cancels the reader) and the hard deadline on
 * the handle, so nothing here can hang the request thread.
 */
export async function* readSse(
  handle: StreamHandle,
  g: Guard,
): AsyncGenerator<{ event: string; data: string }> {
  const res = handle.res;
  if (!res.body) return;
  const body = res.body.pipeThrough(new TextDecoderStream("utf8")) as ReadableStream<string>;
  const reader = body.getReader();
  let buffer = "";
  let bytes = 0;
  let idle: ReturnType<typeof setTimeout> | null = null;

  const frame = (raw: string): { event: string; data: string } | null => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (!dataLines.length) return null;
    return { event, data: dataLines.join("\n") };
  };

  const nextChunk = async () => {
    // Three ways this read can end: data, silence past the idle budget, or the
    // whole-call deadline / the client hanging up. All of them are honoured.
    const read = withAbort(reader.read(), handle.signal);
    const stalled = new Promise<never>((_, reject) => {
      idle = setTimeout(() => reject(new Error("idle")), g.idleMs);
    });
    try {
      return await Promise.race([read, stalled]);
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    } finally {
      if (idle) clearTimeout(idle);
      idle = null;
    }
  };

  try {
    for (;;) {
      const { done, value } = await nextChunk();
      if (done) break;
      if (value) {
        bytes += Buffer.byteLength(value, "utf8");
        if (bytes > g.maxBytes) {
          void reader.cancel().catch(() => {});
          throw new AppError(
            502,
            "ai_response_too_large",
            "پاسخ سرویس هوش مصنوعی از حد مجاز بزرگ‌تر بود و کامل خوانده نشد.",
          );
        }
        buffer += value;
      }
      let cut: number;
      // SSE frames are separated by a blank line.
      while ((cut = findFrameEnd(buffer)) >= 0) {
        const raw = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const parsed = frame(raw);
        if (parsed) yield parsed;
      }
    }
    const tail = frame(buffer.trim());
    if (tail) yield tail;
  } catch (error) {
    if (error instanceof AppError) {
      handle.dispose();
      void reader.cancel().catch(() => {});
      throw error;
    }
    const reason = handle.reason();
    handle.dispose();
    void reader.cancel().catch(() => {});
    if (reason instanceof Error && reason.message !== "idle") throw transportError(reason, g);
    if (error instanceof Error && error.message === "idle") throw transportError(error, g);
    throw new AppError(
      502,
      "ai_stream_interrupted",
      `جریان پاسخ سرویس «${g.label}» پیش از پایان قطع شد. پاسخی که کامل نشده ذخیره نمی‌شود.`,
    );
  } finally {
    handle.dispose();
    reader.releaseLock();
  }
}

function findFrameEnd(buffer: string): number {
  const a = buffer.indexOf("\n\n");
  const b = buffer.indexOf("\r\n\r\n");
  if (a < 0) return b;
  if (b < 0) return a;
  return Math.min(a, b);
}

/**
 * Status → machine code → Persian sentence. Codes stay Latin snake_case because
 * only the message reaches the user.
 */
export function mapProviderStatus(status: number, g: Guard, detail = ""): AppError {
  const map: Record<number, [number, string, string] | undefined> = {
    400: [
      422,
      "provider_request_rejected",
      `سرویس «${g.label}» این درخواست را نپذیرفت. احتمالاً حجم گفت‌وگو یا قالب پیام بیش از حد مجاز است.`,
    ],
    401: [
      502,
      "provider_auth_failed",
      `کلید API سرویس «${g.label}» پذیرفته نشد. در بخش پروفایل، کلید را بررسی یا جای‌گزینی کنید.`,
    ],
    402: [
      502,
      "provider_quota_exceeded",
      `سهمیهٔ حساب «${g.label}» تمام شده است. موجودی یا پلن سرویس را بررسی کنید.`,
    ],
    403: [
      502,
      "provider_auth_failed",
      `دسترسی کلید API سرویس «${g.label}» مجاز نیست. کلید یا مدل انتخابی را بررسی کنید.`,
    ],
    404: [
      502,
      "provider_model_unavailable",
      `این مدل روی سرویس «${g.label}» یافت نشد. از فهرست مدل‌ها یک مدل در دسترس انتخاب کنید.`,
    ],
    408: [
      504,
      "ai_timeout",
      `سرویس «${g.label}» در زمان مجاز پاسخ نداد. کمی بعد دوباره تلاش کنید.`,
    ],
    413: [
      422,
      "provider_request_too_large",
      `درخواست ارسالی به «${g.label}» بزرگ است. گفت‌وگوی تازه‌تر یا تصویر کوچک‌تر را امتحان کنید.`,
    ],
    422: [
      422,
      "provider_request_rejected",
      `سرویس «${g.label}» قالب درخواست را نپذیرفت. مدل یا پارامترها را تغییر دهید.`,
    ],
    429: [
      429,
      "ai_rate_limited",
      `سرویس «${g.label}» موقتاً درخواست‌ها را محدود کرده است. چند دقیقه بعد دوباره تلاش کنید.`,
    ],
  };

  const known = map[status];
  const resolved: [number, string, string] = known ?? [
    status >= 500 ? 503 : 502,
    status >= 500 ? "provider_unavailable" : "provider_request_failed",
    status >= 500
      ? `سرویس «${g.label}» در دسترس نیست یا خطای سمت خود داده است. کمی بعد دوباره تلاش کنید.`
      : `سرویس «${g.label}» پاسخی داد که این برنامه انتظارش را نداشت.`,
  ];

  const safeDetail = redact(detail, g.redact).slice(0, 180);
  if (safeDetail) console.error(`[ai] ${g.provider} HTTP ${status}: ${safeDetail}`);

  return new AppError(resolved[0], resolved[1], resolved[2]);
}

/** Parses a body that must be JSON; anything else is an honest failure. */
export function parseJson(text: string, g: Guard): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    console.error(
      `[ai] ${g.provider} returned a non-JSON body (${text.slice(0, 120).replace(/\s+/g, " ")})`,
    );
    return null;
  }
}

export class InvalidProviderResponse extends AppError {
  constructor(g: Guard) {
    super(
      502,
      "ai_invalid_response",
      `پاسخ سرویس «${g.label}» قابل خواندن نبود (قالب نامعتبر). دوباره تلاش کنید.`,
    );
  }
}

/**
 * A reply with no text and no tool call is a failure, not an answer: storing an
 * empty message as if the model had spoken would be the fabrication this layer
 * exists to prevent.
 */
export function emptyResponse(label: string): AppError {
  return new AppError(
    502,
    "ai_empty_response",
    `سرویس «${label}» بدون متن پاسخ برگرداند. چیزی ذخیره نشد؛ دوباره تلاش کنید.`,
  );
}
