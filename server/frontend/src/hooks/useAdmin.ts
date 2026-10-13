import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'
import { socket } from '@/lib/socket'

export function useAdminOverview(enabled: boolean) {
  const queryClient = useQueryClient()

  useEffect(() => {
    function onUpdate() {
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
    }

    socket.on('queue-update', onUpdate)
    socket.on('leaderboard-update', onUpdate)
    return () => {
      socket.off('queue-update', onUpdate)
      socket.off('leaderboard-update', onUpdate)
    }
  }, [queryClient])

  return useQuery({
    queryKey: ['admin-overview'],
    queryFn: api.admin.overview,
    enabled,
    // Keeps "last seen" / countdowns fresh even without socket events
    refetchInterval: 5_000,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 401) && failureCount < 3,
  })
}

// Runs one staff action and refreshes the overview afterwards
export function useAdminAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
    },
  })
}
