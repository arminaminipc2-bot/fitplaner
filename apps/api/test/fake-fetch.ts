/**
 * Offline fetch stub: the suite never touches a real provider and never needs a
 * real key. Every outbound call is recorded so a test can assert the exact wire
 * shape, and the handler decides what the provider "says".
 */

export type RecordedCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

export type FetchStub = {
  calls: RecordedCall[];
  last: () => RecordedCall;
  restore: () => void;
};

type Handler = (call: RecordedCall, index: number) => Response | Promise<Response>;

const original = globalThis.fetch;

export function installFetch(handler: Handler): FetchStub {
  const calls: RecordedCall[] = [];

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const headers: Record<string, string> = {};
    for (const [key, value] of new Headers(init?.headers as never)) {
      headers[key.toLowerCase()] = value;
    }
    let body: unknown = undefined;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: RecordedCall = { url, method: init?.method ?? "GET", headers, body };
    calls.push(call);
    const response = await handler(call, calls.length - 1);
    // A provider that hangs is not something the suite may do.
    if (!response.ok && response.status === 0) throw new Error("handler returned nothing");
    return response;
  }) as unknown as typeof fetch;

  return {
    calls,
    last: () => calls[calls.length - 1],
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function textResponse(text: string, status = 200, contentType = "text/plain"): Response {
  return new Response(text, { status, headers: { "content-type": contentType } });
}

/** Frames are written exactly the way a provider writes them: `data: …\n\n`. */
export function sseResponse(frames: string[], status = 200, contentType = "text/event-stream"): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { "content-type": contentType } });
}

/**
 * A stream that dies after N frames — the interrupted-provider case. The frames
 * are handed out one `pull` at a time: enqueuing them all and then erroring
 * would discard exactly the partial text this test needs to see.
 */
export function abortingSseResponse(frames: string[], error: Error): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < frames.length) {
        controller.enqueue(encoder.encode(frames[index++]));
        return;
      }
      controller.error(error);
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

export function openaiChunk(text: string, model = "gpt-4o-mini"): string {
  return `data: ${JSON.stringify({
    model,
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  })}\n\n`;
}

export function anthropicEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data as object })}\n\n`;
}
