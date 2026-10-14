import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronsUp,
  Lock,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { ConnectionIndicator } from '@/components/ConnectionIndicator'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAdminAction, useAdminOverview } from '@/hooks/useAdmin'
import { useServerNow } from '@/hooks/useQueue'
import type { AdminOverview, QueueEntry, RecentLap, Rig } from '@/lib/api'
import { ApiError, api, kioskKey, RigState } from '@/lib/api'
import {
  formatCountdown,
  formatEta,
  formatLapTime,
  formatTrack,
} from '@/lib/format'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

type RunAction = (action: () => Promise<unknown>, confirmText?: string) => void

function AdminPage() {
  const [hasKey, setHasKey] = useState(true)
  const overview = useAdminOverview(hasKey)
  const action = useAdminAction()

  const unauthorized =
    overview.error instanceof ApiError && overview.error.status === 401

  if (!hasKey || unauthorized) {
    return (
      <PinGate
        wrongPin={unauthorized && kioskKey.get() !== ''}
        onSubmit={(pin) => {
          kioskKey.set(pin)
          setHasKey(true)
          overview.refetch()
        }}
      />
    )
  }

  const run: RunAction = (fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return
    action.mutate(fn)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-6 h-6" />
              </Button>
            </Link>
            <ShieldCheck className="w-10 h-10 text-primary" />
            <h1 className="text-4xl font-bold">Staff</h1>
          </div>
          <div className="flex items-center gap-4">
            <ConnectionIndicator />
            <Button
              variant="outline"
              onClick={() => {
                kioskKey.clear()
                setHasKey(false)
              }}
            >
              <Lock /> Lock
            </Button>
          </div>
        </div>

        {action.error && (
          <Alert className="bg-destructive/10 border-destructive/50 border p-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-destructive font-medium">
              {action.error.message}
            </p>
          </Alert>
        )}

        {overview.isLoading || !overview.data ? (
          <p className="text-muted-foreground text-lg">
            {overview.isError
              ? `Failed to load: ${overview.error.message}`
              : 'Loading...'}
          </p>
        ) : (
          <AdminContent
            data={overview.data}
            run={run}
            busy={action.isPending}
          />
        )}
      </div>
    </div>
  )
}

function PinGate({
  wrongPin,
  onSubmit,
}: {
  wrongPin: boolean
  onSubmit: (pin: string) => void
}) {
  const [pin, setPin] = useState('')

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Card className="w-full max-w-md border-2">
        <CardHeader className="text-center">
          <Lock className="w-12 h-12 mx-auto text-primary mb-2" />
          <CardTitle className="text-3xl">Staff Access</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit(pin)
            }}
          >
            <Input
              type="password"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Staff PIN (KIOSK_KEY)"
              className="text-xl h-12"
            />
            {wrongPin && (
              <p className="text-destructive font-medium">Wrong PIN</p>
            )}
            <Button type="submit" size="lg" className="w-full text-lg">
              Unlock
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function AdminContent({
  data,
  run,
  busy,
}: {
  data: AdminOverview
  run: RunAction
  busy: boolean
}) {
  const serverNow = useServerNow(data.serverTime)

  return (
    <>
      <section>
        <h2 className="text-2xl font-bold mb-4">Rigs</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.rigs.map((rig) => (
            <RigControls
              key={rig.id}
              rig={rig}
              serverNow={serverNow}
              run={run}
              busy={busy}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">
          Queue{' '}
          <span className="text-muted-foreground font-normal">
            ({data.queue.length} waiting)
          </span>
        </h2>
        <QueueTable queue={data.queue} rigs={data.rigs} run={run} busy={busy} />
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">Recent Laps</h2>
        <LapsTable laps={data.recentLaps} run={run} busy={busy} />
      </section>
    </>
  )
}

function RigControls({
  rig,
  serverNow,
  run,
  busy,
}: {
  rig: Rig
  serverNow: number
  run: RunAction
  busy: boolean
}) {
  const session = rig.session
  const called = rig.called

  return (
    <Card className={`border-2 ${rig.enabled ? '' : 'opacity-70'}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl">Rig {rig.id}</CardTitle>
          <div className="flex gap-2">
            <Badge
              className={
                rig.online
                  ? 'bg-green-500 text-white'
                  : 'bg-destructive text-white'
              }
            >
              {rig.online ? 'online' : 'offline'}
            </Badge>
            <Badge variant="outline">{rig.state}</Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {rig.track
            ? `${formatTrack(rig.track, rig.trackConfig ?? '')} · ${rig.car}`
            : 'No track reported'}
          {rig.appVersion && ` · app ${rig.appVersion}`}
          {rig.lastSeenAt &&
            !rig.online &&
            ` · last seen ${new Date(rig.lastSeenAt).toLocaleTimeString()}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rig.state === RigState.RACING && session && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-bold truncate">
                {session.driverName}
              </span>
              <span className="font-mono text-2xl font-bold">
                {formatCountdown(session.endsAt - serverNow)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {session.lapCount} laps · best {formatLapTime(session.bestLapMs)}
            </p>
            <div className="flex flex-wrap gap-2">
              {[120, 300, -60].map((seconds) => (
                <Button
                  key={seconds}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      api.admin.extendSession(rig.id, session.id, seconds),
                    )
                  }
                >
                  {seconds > 0 ? `+${seconds / 60} min` : `${seconds / 60} min`}
                </Button>
              ))}
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api.admin.endSession(rig.id, session.id),
                    `End ${session.driverName}'s session now?`,
                  )
                }
              >
                End session
              </Button>
            </div>
          </>
        )}

        {rig.state === RigState.CALLING && called && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-bold truncate">
                Calling {called.driverName}
              </span>
              <span className="text-sm text-muted-foreground">
                auto-skip in {formatCountdown(called.timeoutAt - serverNow)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() => api.admin.startSession(rig.id, called.queueEntryId))
                }
              >
                Start
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(() => api.admin.skipCall(rig.id, called.queueEntryId))
                }
              >
                Skip (not here)
              </Button>
            </div>
          </>
        )}

        {rig.state === RigState.FREE && (
          <p className="text-muted-foreground">
            {!rig.enabled
              ? 'Closed - no players are called here'
              : rig.online
                ? 'Free'
                : 'Offline - is AC running with the Race Kiosk app?'}
          </p>
        )}

        <Button
          size="sm"
          variant={rig.enabled ? 'secondary' : 'default'}
          disabled={busy}
          onClick={() =>
            run(
              () => api.admin.setRigEnabled(rig.id, !rig.enabled),
              rig.enabled
                ? `Close rig ${rig.id}? Players won't be called there until it's reopened.`
                : undefined,
            )
          }
        >
          {rig.enabled ? 'Close rig (maintenance)' : 'Reopen rig'}
        </Button>
      </CardContent>
    </Card>
  )
}

function QueueTable({
  queue,
  rigs,
  run,
  busy,
}: {
  queue: Array<QueueEntry>
  rigs: Array<Rig>
  run: RunAction
  busy: boolean
}) {
  // A player can be called to any rig that is available and not racing
  const callableRigs = rigs.filter(
    (rig) => rig.enabled && rig.online && rig.state !== RigState.RACING,
  )

  if (queue.length === 0) {
    return <p className="text-muted-foreground">Nobody is waiting.</p>
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Wait</TableHead>
            <TableHead>Skips</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queue.map((entry, index) => (
            <TableRow key={entry.id}>
              <TableCell className="font-bold">{entry.position}</TableCell>
              <TableCell className="font-medium">{entry.driverName}</TableCell>
              <TableCell>{formatEta(entry.etaSec)}</TableCell>
              <TableCell>{entry.skipCount}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Move to top"
                    disabled={busy || index === 0}
                    onClick={() =>
                      run(() => api.admin.moveEntry(entry.id, 'top'))
                    }
                  >
                    <ChevronsUp />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Move up"
                    disabled={busy || index === 0}
                    onClick={() =>
                      run(() => api.admin.moveEntry(entry.id, 'up'))
                    }
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Move down"
                    disabled={busy || index === queue.length - 1}
                    onClick={() =>
                      run(() => api.admin.moveEntry(entry.id, 'down'))
                    }
                  >
                    <ArrowDown />
                  </Button>
                  {callableRigs.map((rig) => (
                    <Button
                      key={rig.id}
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      title={
                        rig.called
                          ? `${rig.called.driverName} goes back to the queue`
                          : undefined
                      }
                      onClick={() =>
                        run(() => api.admin.callEntry(entry.id, rig.id))
                      }
                    >
                      Call to {rig.id}
                    </Button>
                  ))}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Remove from queue"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api.admin.removeEntry(entry.id),
                        `Remove ${entry.driverName} from the queue?`,
                      )
                    }
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function LapsTable({
  laps,
  run,
  busy,
}: {
  laps: Array<RecentLap>
  run: RunAction
  busy: boolean
}) {
  if (laps.length === 0) {
    return <p className="text-muted-foreground">No laps yet.</p>
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Rig</TableHead>
            <TableHead>Lap</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Moderation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {laps.map((lap) => (
            <TableRow key={lap.id}>
              <TableCell className="text-muted-foreground">
                {new Date(lap.completedAt).toLocaleTimeString()}
              </TableCell>
              <TableCell className="font-medium">{lap.driverName}</TableCell>
              <TableCell>#{lap.rigId}</TableCell>
              <TableCell className="font-mono">
                {formatLapTime(lap.lapTimeMs)}
              </TableCell>
              <TableCell>
                {lap.valid ? (
                  <Badge className="bg-green-500 text-white">valid</Badge>
                ) : (
                  <Badge variant="outline">
                    {lap.invalidReason ?? 'invalid'}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  {lap.valid && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api.admin.invalidateLap(lap.id),
                          `Remove this ${formatLapTime(lap.lapTimeMs)} lap by ${lap.driverName} from the leaderboard?`,
                        )
                      }
                    >
                      Invalidate
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api.admin.deleteDriver(lap.driverId),
                        `Delete driver "${lap.driverName}" and ALL their laps?`,
                      )
                    }
                  >
                    <Trash2 className="text-destructive" /> Driver
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
