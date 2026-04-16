type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface ApiRequestOptions {
  method?: RequestMethod
  body?: unknown
  token?: string | null
}

interface LegacyOkPayload {
  ok?: boolean
  error?: string
}

interface SuccessPayload<T> {
  success?: boolean
  data?: T
  error?: string
  message?: string
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const candidate = payload as { error?: unknown; message?: unknown }
  if (typeof candidate.error === 'string' && candidate.error.trim()) return candidate.error
  if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message
  return fallback
}

function hasDataKey<T>(payload: unknown): payload is SuccessPayload<T> {
  return Boolean(payload && typeof payload === 'object' && 'data' in payload)
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method || 'GET'
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.token) headers.Authorization = `Bearer ${options.token}`

  const response = await fetch(path, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, `Request failed (${response.status})`))
  }

  if (hasDataKey<T>(payload)) {
    return payload.data as T
  }

  const legacy = payload as LegacyOkPayload
  if (legacy?.ok === true) {
    return payload as T
  }

  return payload as T
}
