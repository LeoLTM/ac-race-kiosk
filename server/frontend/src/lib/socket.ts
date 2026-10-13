import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

// Socket.IO client singleton with reconnection configuration
export const socket: Socket = io(API_BASE_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
})
