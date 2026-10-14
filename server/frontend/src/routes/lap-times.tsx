import { createFileRoute, Link } from '@tanstack/react-router'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowLeft, Trophy } from 'lucide-react'
import { useState } from 'react'
import { ConnectionIndicator } from '@/components/ConnectionIndicator'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCombos, useLeaderboard } from '@/hooks/useLeaderboard'
import type { Combo, LeaderboardEntry, LeaderboardPeriod } from '@/lib/api'
import { comboKey, formatCombo, formatLapTime } from '@/lib/format'

export const Route = createFileRoute('/lap-times')({
  component: LapTimesPage,
})

const columnHelper = createColumnHelper<LeaderboardEntry>()

const columns = [
  columnHelper.accessor('rank', {
    header: '#',
    cell: (info) => (
      <span className={`font-bold ${getRankColor(info.getValue())}`}>
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor('driverName', {
    header: 'Driver',
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor('lapTimeMs', {
    header: 'Best Lap',
    cell: (info) => (
      <span className="font-mono text-primary">
        {formatLapTime(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor('rigId', {
    header: 'Rig',
    cell: (info) => (
      <span className="text-muted-foreground">#{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor('completedAt', {
    header: 'Set',
    cell: (info) => (
      <span className="text-muted-foreground">
        {new Date(info.getValue()).toLocaleString([], {
          dateStyle: 'short',
          timeStyle: 'short',
        })}
      </span>
    ),
  }),
]

function getRankColor(rank: number): string {
  switch (rank) {
    case 1:
      return 'text-yellow-500' // Gold
    case 2:
      return 'text-gray-400' // Silver
    case 3:
      return 'text-amber-600' // Bronze
    default:
      return 'text-muted-foreground'
  }
}

function LapTimesPage() {
  // null = follow whatever track/car the rigs are running
  const [combo, setCombo] = useState<Combo | null>(null)
  const [period, setPeriod] = useState<LeaderboardPeriod>('today')
  const { data: combos } = useCombos()
  const { data, isLoading, isError, error } = useLeaderboard(combo, period)

  const entries = data?.entries ?? []
  const shownCombo = combo ?? data?.combo ?? null

  const table = useReactTable({
    data: entries,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <ArrowLeft className="w-6 h-6" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <Trophy className="w-10 h-10 text-amber-500" />
              <div>
                <h1 className="text-4xl font-bold text-foreground">
                  Leaderboard
                </h1>
                {shownCombo && (
                  <p className="text-muted-foreground">
                    {formatCombo(shownCombo)}
                  </p>
                )}
              </div>
            </div>
          </div>
          <ConnectionIndicator />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['today', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                className={`px-5 py-2 font-semibold transition-colors ${
                  period === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-muted'
                }`}
              >
                {value === 'today' ? 'Today' : 'All Time'}
              </button>
            ))}
          </div>

          {combos && combos.combos.length > 1 && (
            <select
              value={combo ? comboKey(combo) : ''}
              onChange={(e) =>
                setCombo(
                  combos.combos.find((c) => comboKey(c) === e.target.value) ??
                    null,
                )
              }
              className="h-10 rounded-lg border border-border bg-card px-3"
            >
              <option value="">Current track & car</option>
              {combos.combos.map((c) => (
                <option key={comboKey(c)} value={comboKey(c)}>
                  {formatCombo(c)} ({c.lapCount} laps)
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static loading placeholders
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-8 w-12 bg-muted" />
                  <Skeleton className="h-8 w-48 bg-muted" />
                  <Skeleton className="h-8 w-32 bg-muted" />
                  <Skeleton className="h-8 w-24 bg-muted" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-12 text-center">
              <p className="text-destructive text-lg">
                Failed to load lap times: {error?.message}
              </p>
            </div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center">
              <Trophy className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground text-lg">
                {period === 'today'
                  ? 'No lap times recorded today. Be the first to set a time!'
                  : 'No lap times recorded yet. Be the first to set a time!'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="border-border hover:bg-transparent"
                  >
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="text-muted-foreground font-semibold bg-muted"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="border-border hover:bg-muted/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Stats */}
        {entries.length > 0 && (
          <div className="mt-6 text-center text-muted-foreground">
            <p>
              Drivers: <span className="text-foreground">{entries.length}</span>
              {' · '}Only valid laps count (no track limit cuts, no pit lane)
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
