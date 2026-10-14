import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@racekiosk/shared'
import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'

// Socket.IO client singleton with reconnection configuration; connects to the origin that served the page
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
})
