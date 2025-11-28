// API configuration and types
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

// Types matching backend
export enum RigState {
  FREE = 'FREE',
  RACING = 'RACING',
}

export interface Player {
  id: string
  name: string
  joinedAt: string
}

export interface Rig {
  id: number
  state: RigState
  currentPlayer: Player | null
  queue: Player[]
}

export interface DashboardResponse {
  rigs: Rig[]
}

export interface JoinQueueRequest {
  playerName: string
}

export interface JoinQueueResponse {
  playerId: string
  rigId: number
  queuePosition: number
}

// API client
export const api = {
  // Get dashboard data (all rigs)
  getDashboard: async (): Promise<DashboardResponse> => {
    const response = await fetch(`${API_BASE_URL}/queue`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch dashboard data')
    }

    const data = await response.json()
    return data.responseObject
  },

  // Join queue
  joinQueue: async (playerName: string): Promise<JoinQueueResponse> => {
    const response = await fetch(`${API_BASE_URL}/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playerName }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to join queue')
    }

    const data = await response.json()
    return data.responseObject
  },
}
