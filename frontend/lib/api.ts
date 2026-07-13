const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

let _token: string | null = null

export function setAuthToken(token: string | null) {
  _token = token
}

/** Called on a 401 — the session expired or is invalid. Clear it and send to login. */
export function handleSessionExpired() {
  if (typeof window === 'undefined') return
  _token = null
  try {
    window.localStorage.removeItem('auth-storage')
  } catch { /* ignore */ }
  if (!window.location.pathname.startsWith('/auth/')) {
    window.location.href = '/auth/login?expired=1'
  }
}

/** Resolve the auth token: prefer the in-memory token, fall back to persisted store. */
function resolveToken(): string | null {
  if (_token) return _token
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem('auth-storage')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const token = parsed?.state?.accessToken ?? null
    if (token) _token = token // cache it back
    return token
  } catch {
    return null
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  const token = resolveToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (response.status === 401) {
    handleSessionExpired()
    throw new Error('Your session expired — please log in again.')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(error.detail || `Request failed (${response.status})`)
  }

  if (response.status === 204) return undefined as T
  return response.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
