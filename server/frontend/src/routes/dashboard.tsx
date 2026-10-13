import { createFileRoute } from '@tanstack/react-router'
import { Flag, Gauge, Timer, Trophy, Users, WifiOff, Wrench } from 'lucide-react'
import { useDashboard, useServerNow } from '../hooks/useQueue'
import { useLeaderboard } from '../hooks/useLeaderboard'
import {   RigState } from '../lib/api'
import type {QueueEntry, Rig} from '../lib/api';
import { formatCountdown, formatEta, formatLapTime, formatTrack } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Footer } from '@/components/Footer'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { data, isLoading, isError } = useDashboard()
  const serverNow = useServerNow(data?.serverTime)

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Gauge className="w-24 h-24 mx-auto mb-6 animate-spin text-primary" />
            <p className="text-3xl font-bold text-foreground">Loading Dashboard...</p>
          </div>
        </div>
        <div className="relative z-10">
          <Footer />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Flag className="w-24 h-24 mx-auto mb-6 text-destructive" />
            <p className="text-3xl font-bold text-destructive">Connection Lost</p>
            <p className="text-muted-foreground mt-4 text-xl">Reconnecting...</p>
          </div>
        </div>
        <div className="relative z-10">
          <Footer />
        </div>
      </div>
    )
  }

  const rigCount = data.rigs.length

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
      <div className="flex-1 flex gap-6 p-6 min-h-0">
        {/* Rigs - grid adapts to number of rigs */}
        <div className={`flex-1 min-w-0 grid gap-6 ${
          rigCount === 1 ? 'grid-cols-1' :
          rigCount === 2 ? 'grid-cols-2' :
          rigCount <= 4 ? 'grid-cols-2 auto-rows-fr' :
          'grid-cols-3 auto-rows-fr'
        }`}>
          {data.rigs.map((rig) => (
            <RigCard key={rig.id} rig={rig} compact={rigCount > 2} serverNow={serverNow} />
          ))}
        </div>

        {/* Shared queue + today's fastest */}
        <div className="w-104 shrink-0 flex flex-col gap-6 min-h-0">
          <QueueCard queue={data.queue} />
          <FastestCard />
        </div>
      </div>
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  )
}

interface RigCardProps {
  rig: Rig
  compact: boolean
  serverNow: number
}

function RigCard({ rig, compact, serverNow }: RigCardProps) {
  const unavailable = !rig.enabled || !rig.online
  const isCalling = rig.state === RigState.CALLING
  const isRacing = rig.state === RigState.RACING

  const tone = unavailable
    ? { border: 'border-border opacity-60', dot: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' }
    : isCalling
      ? { border: 'border-amber-500 shadow-lg', dot: 'bg-amber-500 animate-pulse', badge: 'bg-amber-500 text-white' }
      : isRacing
        ? { border: 'border-primary shadow-md', dot: 'bg-primary animate-pulse', badge: 'bg-primary text-primary-foreground' }
        : { border: 'border-green-500 shadow-md', dot: 'bg-green-500', badge: 'bg-green-500 text-white' }

  const badgeText = !rig.enabled
    ? 'CLOSED'
    : !rig.online && !isRacing
      ? 'OFFLINE'
      : isCalling
        ? '⚠️ CALLING'
        : isRacing
          ? '🏁 RACING'
          : '✓ FREE'

  return (
    <Card className={`h-full flex flex-col border-4 transition-all duration-500 ${tone.border}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className={`font-bold flex items-center gap-4 ${compact ? 'text-5xl' : 'text-7xl'}`}>
            <div className={`rounded-full ${compact ? 'w-6 h-6' : 'w-8 h-8'} ${tone.dot}`} />
            RIG {rig.id}
          </CardTitle>
          <Badge className={`font-bold ${compact ? 'text-xl px-5 py-2' : 'text-3xl px-8 py-4'} ${tone.badge}`}>
            {badgeText}
          </Badge>
        </div>
        {rig.track && rig.car && (
          <p className="text-muted-foreground text-lg truncate">
            {formatTrack(rig.track, rig.trackConfig ?? '')}
          </p>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-center min-h-0">
        {isRacing && rig.session ? (
          <RacingContent rig={rig} compact={compact} serverNow={serverNow} />
        ) : isCalling && rig.called ? (
          <div className="rounded-lg border-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-6">
            <p className={`uppercase tracking-wider font-bold text-amber-600 dark:text-amber-400 ${compact ? 'text-xl' : 'text-3xl'}`}>
              👉 Please come to Rig {rig.id}!
            </p>
            <p className={`font-black text-foreground truncate mt-2 ${compact ? 'text-5xl' : 'text-7xl'} animate-pulse`}>
              {rig.called.driverName}
            </p>
            <p className={`text-muted-foreground mt-3 ${compact ? 'text-lg' : 'text-2xl'}`}>
              Press START on the rig · {formatCountdown(rig.called.timeoutAt - serverNow)} left
            </p>
          </div>
        ) : unavailable ? (
          <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
            {!rig.enabled ? <Wrench className="w-16 h-16" /> : <WifiOff className="w-16 h-16" />}
            <p className={compact ? 'text-2xl' : 'text-4xl'}>
              {!rig.enabled ? 'Temporarily closed' : 'Rig offline'}
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className={`font-bold text-green-600 dark:text-green-400 ${compact ? 'text-3xl' : 'text-5xl'}`}>
              Ready for the next driver
            </p>
            <p className={`text-muted-foreground mt-3 ${compact ? 'text-xl' : 'text-2xl'}`}>
              Register at the kiosk to race!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RacingContent({ rig, compact, serverNow }: RigCardProps) {
  const session = rig.session!
  const remaining = session.endsAt - serverNow
  const timerColor =
    remaining <= 10_000 ? 'text-destructive animate-pulse' : remaining <= 60_000 ? 'text-amber-500' : 'text-foreground'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Flag className={`text-primary shrink-0 ${compact ? 'w-8 h-8' : 'w-12 h-12'}`} />
          <span className={`font-bold truncate ${compact ? 'text-4xl' : 'text-6xl'}`}>{session.driverName}</span>
        </div>
        <span className={`font-mono font-black tabular-nums shrink-0 ${compact ? 'text-5xl' : 'text-7xl'} ${timerColor}`}>
          {formatCountdown(remaining)}
        </span>
      </div>
      <div className={`grid grid-cols-3 gap-3 text-center ${compact ? 'text-xl' : 'text-2xl'}`}>
        <Stat label="Laps" value={String(session.lapCount)} />
        <Stat label="Last" value={formatLapTime(session.lastLapMs)} />
        <Stat label="Best" value={formatLapTime(session.bestLapMs)} highlight />
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-muted-foreground text-sm uppercase tracking-wider font-bold">{label}</p>
      <p className={`font-mono font-bold ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}

function QueueCard({ queue }: { queue: Array<QueueEntry> }) {
  return (
    <Card className="flex-1 flex flex-col min-h-0 border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-3xl font-bold flex items-center gap-3">
            <Users className="w-8 h-8" />
            Up Next
          </CardTitle>
          <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400 font-bold text-lg px-3 py-1">
            {queue.length} waiting
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {queue.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center bg-muted rounded-lg border-4 border-dashed border-border py-10">
            <p className="text-2xl font-bold text-muted-foreground">Queue Empty</p>
            <p className="text-lg text-muted-foreground/60 mt-2">Register now - no waiting!</p>
          </div>
        ) : (
          queue.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 bg-muted rounded-lg border-2 border-border p-3">
              <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400 font-bold text-xl min-w-14 justify-center">
                #{entry.position}
              </Badge>
              <span className="text-2xl font-medium truncate flex-1">{entry.driverName}</span>
              <span className="text-muted-foreground text-lg flex items-center gap-1 shrink-0">
                <Timer className="w-4 h-4" />
                {formatEta(entry.etaSec)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function FastestCard() {
  const { data } = useLeaderboard(null, 'today')
  const entries = data?.entries.slice(0, 5) ?? []

  return (
    <Card className="shrink-0 border-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-2xl font-bold flex items-center gap-3">
          <Trophy className="w-7 h-7 text-amber-500" />
          Today's Fastest
        </CardTitle>
        {data?.combo && (
          <p className="text-muted-foreground truncate">{formatTrack(data.combo.track, data.combo.trackConfig)}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-lg">No laps yet today - be the first!</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.driverId} className="flex items-center gap-3 text-xl">
              <span className={`font-bold w-8 ${entry.rank === 1 ? 'text-yellow-500' : entry.rank === 2 ? 'text-gray-400' : entry.rank === 3 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {entry.rank}
              </span>
              <span className="flex-1 truncate">{entry.driverName}</span>
              <span className="font-mono text-primary">{formatLapTime(entry.lapTimeMs)}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
