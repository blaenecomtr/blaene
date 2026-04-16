export interface AdminApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  meta?: unknown;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  code?: string;
  meta?: unknown;
}

export async function fetchAdmin<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<AdminApiResult<T>> {
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(path, {
    ...init,
    headers,
  });

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    return {
      ok: false,
      status: response.status,
      data: null,
      error: payload?.error || `API request failed (${response.status})`,
      meta: payload?.meta,
    };
  }

  return {
    ok: true,
    status: response.status,
    data: (payload.data ?? null) as T | null,
    error: null,
    meta: payload.meta,
  };
}

