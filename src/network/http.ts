import { Capacitor, CapacitorHttp } from '@capacitor/core'

/** JSON POST via native transport on Android/iOS; browser uses fetch. */
export async function postJson<T>(url: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  if (Capacitor.isNativePlatform()) {
    if (signal?.aborted) throw new Error('Request cancelled')
    const response = await CapacitorHttp.post({
      url, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      data: payload, connectTimeout: 15000, readTimeout: 20000,
    })
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`)
    const data: unknown = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    return data as T
  }
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload), signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json() as T
}
