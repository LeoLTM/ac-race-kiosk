import type {
  AdminOverview,
  ApiResponse,
  Combo,
  CombosResponse,
  DashboardResponse,
  JoinQueueResponse,
  LeaderboardPeriod,
  LeaderboardResponse,
} from '@racekiosk/shared'

// API types live in the shared workspace package; re-exported so pages keep importing from '@/lib/api'
export * from '@racekiosk/shared'

// The backend serves this app, so the API is on the same origin (proxied to the backend by Vite in dev)
const API_BASE_URL = '/api'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  const data: ApiResponse<T> | null = await response.json().catch(() => null)
  if (!response.ok || !data?.success) {
    throw new ApiError(
      data?.message || `Request failed (${response.status})`,
      response.status,
    )
  }
  return data.responseObject
}

// The staff PIN is the server's KIOSK_KEY, remembered on the staff device
const KIOSK_KEY_STORAGE = 'raceKiosk.kioskKey'

export const kioskKey = {
  get: () => localStorage.getItem(KIOSK_KEY_STORAGE) ?? '',
  set: (key: string) => localStorage.setItem(KIOSK_KEY_STORAGE, key),
  clear: () => localStorage.removeItem(KIOSK_KEY_STORAGE),
}

function adminRequest<T = null>(
  path: string,
  method: 'GET' | 'POST' | 'DELETE' = 'POST',
  body?: unknown,
): Promise<T> {
  return request<T>(`/admin${path}`, {
    method,
    headers: { 'X-Kiosk-Key': kioskKey.get() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

// API client
export const api = {
  // Rigs and the shared queue (also pushed live as Socket.IO "queue-update")
  getDashboard: () => request<DashboardResponse>('/queue'),

  joinQueue: (playerName: string) =>
    request<JoinQueueResponse>('/queue', {
      method: 'POST',
      body: JSON.stringify({ playerName }),
    }),

  // Without a combo the server picks the one currently loaded on the rigs
  getLeaderboard: (combo: Combo | null, period: LeaderboardPeriod) => {
    const params = new URLSearchParams({ period })
    if (combo) {
      params.set('track', combo.track)
      params.set('trackConfig', combo.trackConfig)
      params.set('car', combo.car)
    }
    return request<LeaderboardResponse>(`/leaderboard?${params}`)
  },

  getCombos: () => request<CombosResponse>('/leaderboard/combos'),

  admin: {
    overview: () => adminRequest<AdminOverview>('/overview', 'GET'),
    setRigEnabled: (rigId: number, enabled: boolean) =>
      adminRequest(`/rigs/${rigId}/${enabled ? 'enable' : 'disable'}`),
    startSession: (rigId: number, queueEntryId: string) =>
      adminRequest(`/rigs/${rigId}/start`, 'POST', { queueEntryId }),
    endSession: (rigId: number, sessionId: string) =>
      adminRequest(`/rigs/${rigId}/end`, 'POST', { sessionId }),
    extendSession: (rigId: number, sessionId: string, seconds: number) =>
      adminRequest(`/rigs/${rigId}/extend`, 'POST', { sessionId, seconds }),
    skipCall: (rigId: number, queueEntryId: string) =>
      adminRequest(`/rigs/${rigId}/skip`, 'POST', { queueEntryId }),
    moveEntry: (entryId: string, direction: 'up' | 'down' | 'top') =>
      adminRequest(`/queue/${entryId}/move`, 'POST', { direction }),
    callEntry: (entryId: string, rigId: number) =>
      adminRequest(`/queue/${entryId}/call`, 'POST', { rigId }),
    removeEntry: (entryId: string) =>
      adminRequest(`/queue/${entryId}`, 'DELETE'),
    invalidateLap: (lapId: string) => adminRequest(`/laps/${lapId}/invalidate`),
    deleteDriver: (driverId: string) =>
      adminRequest(`/drivers/${driverId}`, 'DELETE'),
  },
}
