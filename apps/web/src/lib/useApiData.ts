import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export type AsyncData<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Re-runs the request; a page that cannot reach the server must offer this. */
  reload: () => void;
};

/**
 * One GET-style fetch per screen. `loader` identity changes on every render, so
 * the effect keys off `deps` — pass the values the request actually depends on.
 * A cancelled or superseded response never lands, which is what keeps a fast tab
 * switch from painting the previous screen's numbers.
 */
export function useApiData<T>(loader: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loaderRef
      .current(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(cause instanceof ApiError ? cause : new ApiError(0, "unknown", "درخواست انجام نشد."));
        setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/** Tracks a mutation so a button can show its own spinner and block double submits. */
export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setPending(true);
    setError(null);
    try {
      return await action();
    } catch (cause) {
      // A Persian message is guaranteed either way: the server sends one, and a
      // transport failure gets this fallback instead of an English exception.
      setError(cause instanceof ApiError ? cause : new ApiError(0, "unknown", "درخواست انجام نشد."));
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  return { pending, error, setError, run };
}
