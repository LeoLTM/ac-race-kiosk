import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { DashboardResponse } from '../lib/api'
import { api } from '../lib/api'
import { socket } from '../lib/socket'

// Rigs + shared queue. The server pushes every change as "queue-update"; polling is only a fallback.
export function useDashboard() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.getDashboard,
    refetchInterval: 10_000,
  })

  useEffect(() => {
    function onQueueUpdate(data: DashboardResponse) {
      queryClient.setQueryData(['dashboard'], data)
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
    }

    socket.on('queue-update', onQueueUpdate)
    return () => {
      socket.off('queue-update', onQueueUpdate)
    }
  }, [queryClient])

  return query
}

// Hook to join queue
export function useJoinQueue() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (playerName: string) => api.joinQueue(playerName),
    onSuccess: () => {
      // Invalidate dashboard query to refetch the data
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// The server's current time (epoch ms), ticking locally, so countdowns match the rigs
export function useServerNow(serverTime: number | undefined, intervalMs = 500) {
  const offset = useRef(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (serverTime !== undefined) offset.current = serverTime - Date.now()
  }, [serverTime])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return now + offset.current
}
