import { apiRequest } from './api'

interface SiteSettingRow<T = unknown> {
  key: string
  value_json: T
  description?: string | null
}

export async function getSiteSetting<T>(token: string | null, key: string, fallback: T): Promise<T> {
  if (!token) return fallback
  try {
    const row = await apiRequest<SiteSettingRow<T> | null>(`/api/admin/site-settings?key=${encodeURIComponent(key)}`, {
      token,
    })
    if (row && typeof row === 'object' && 'value_json' in row) {
      return (row.value_json ?? fallback) as T
    }
    return fallback
  } catch {
    return fallback
  }
}

export async function saveSiteSetting(
  token: string | null,
  key: string,
  value: unknown,
  description: string
) {
  if (!token) return
  await apiRequest('/api/admin/site-settings', {
    method: 'POST',
    token,
    body: {
      key,
      value_json: value,
      description,
    },
  })
}
