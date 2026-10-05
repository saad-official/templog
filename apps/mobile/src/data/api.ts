// Minimal JSON client for the Templog API (apps/web). Sends the Better Auth session cookie.
import { API_URL, getSessionCookie } from './auth-client';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Init = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | undefined>;
  signal?: AbortSignal;
};

/** Throws `ApiError` (status 0 = network failure / timeout). */
export async function apiFetch<T>(path: string, init: Init = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const cookie = await getSessionCookie();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  init.signal?.addEventListener('abort', () => controller.abort());
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      credentials: 'omit',
    });
  } catch (error) {
    throw new ApiError(0, error instanceof Error ? error.message : 'Network error', 'network');
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body
  }
  if (!res.ok) {
    const err = (json ?? {}) as { error?: string; code?: string };
    throw new ApiError(res.status, err.error ?? `Request failed (${res.status})`, err.code);
  }
  return json as T;
}
