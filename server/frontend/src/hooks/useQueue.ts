import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// Hook to fetch dashboard data
export function useDashboard(refetchInterval = 1000) {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: api.getDashboard,
    refetchInterval,
  })
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
