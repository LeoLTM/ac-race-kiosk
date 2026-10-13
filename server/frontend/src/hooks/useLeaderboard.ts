import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {Combo, LeaderboardPeriod} from '@/lib/api';
import {   api } from '@/lib/api'
import { socket } from '@/lib/socket'

// Refetch leaderboards whenever the server reports a new valid lap
function useLeaderboardUpdates() {
  const queryClient = useQueryClient()

  useEffect(() => {
    function onLeaderboardUpdate() {
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
      queryClient.invalidateQueries({ queryKey: ['leaderboard-combos'] })
    }

    socket.on('leaderboard-update', onLeaderboardUpdate)
    return () => {
      socket.off('leaderboard-update', onLeaderboardUpdate)
    }
  }, [queryClient])
}

// combo null = whatever is loaded on the rigs right now
export function useLeaderboard(combo: Combo | null, period: LeaderboardPeriod) {
  useLeaderboardUpdates()

  return useQuery({
    queryKey: ['leaderboard', combo, period],
    queryFn: () => api.getLeaderboard(combo, period),
  })
}

export function useCombos() {
  useLeaderboardUpdates()

  return useQuery({
    queryKey: ['leaderboard-combos'],
    queryFn: api.getCombos,
  })
}
