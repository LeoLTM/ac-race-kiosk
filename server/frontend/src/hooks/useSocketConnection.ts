import { useEffect, useState } from 'react'
import { socket } from '@/lib/socket'

export function useSocketConnection() {
  const [isConnected, setIsConnected] = useState(socket.connected)

  useEffect(() => {
    function onConnect() {
      setIsConnected(true)
    }

    function onDisconnect() {
      setIsConnected(false)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)

    // Check initial connection state
    setIsConnected(socket.connected)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  return { isConnected, socket }
}
