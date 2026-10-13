# Queue, Rig & Lap API

The backend owns all kiosk state:

- the shared queue,
- which player is called to which rig,
- driving sessions with their hard stop,
- laps.

Everything is persisted in SQLite, so a backend restart doesn't lose the queue.

All state changes go through `rigService`. It serializes them with a lock, so concurrent clicks from a rig and staff can't race, and broadcasts the new dashboard over Socket.IO afterwards.

## State machine

```text
Queue entry:  WAITING ──called to a free rig──▶ CALLED ──START──▶ STARTED
                 ▲                                │
                 └── first skip / no-show ────────┤  (moves back SKIP_REQUEUE_POSITIONS places)
                     rig went offline / closed    │  (back at its old position, not a skip)
                                                  └── second skip / no-show ──▶ NO_SHOW
              staff remove ──▶ REMOVED

Rig state (derived):  FREE ──▶ CALLING (has a CALLED entry) ──▶ RACING (has an active session) ──▶ FREE
```

Every second, `rigService.tick()` does four things:

1. Ends sessions whose `endsAt` has passed (`TIME_UP`, the hard stop).
2. Returns calls to rigs that are offline or closed back to the queue.
3. Treats calls older than `CALL_TIMEOUT_SEC` as a skip.
4. Calls the head of the queue to every free, enabled, online rig, in rig id order.

A rig is **online** while its AC app keeps sending heartbeats. It goes offline after `RIG_OFFLINE_AFTER_SEC` without one.

## Endpoints

All timestamps are epoch milliseconds. Responses use the usual `ServiceResponse` envelope (`success`, `message`, `responseObject`, `statusCode`). Swagger UI is served at `/`.

### Public (kiosk tablet, TV dashboard)

| Method | Path | |
| --- | --- | --- |
| POST | `/queue` `{ playerName }` | Join the queue. Returns `{ queueEntryId, driverName, position, etaSec, calledRigId }`. Returns 409 if the name is already queued or racing (case-insensitive). |
| GET | `/queue` | Dashboard: `{ serverTime, rigs[], queue[], config }` |
| GET | `/leaderboard?track&trackConfig&car&period=today\|all` | Best valid lap per driver. Without a combo, uses the one loaded on the online rigs. |
| GET | `/leaderboard/combos` | Track/car combos that have laps, plus the current one |

### Rig app (`X-Kiosk-Key` header)

| Method | Path | |
| --- | --- | --- |
| POST | `/rigs/:rigId/heartbeat` `{ appVersion, track, trackConfig, car }` | Polled every second. Returns the rig status. |
| POST | `/rigs/:rigId/session/start` `{ queueEntryId }` | The called player pressed START. Returns 409 if they aren't called here (anymore). |
| POST | `/rigs/:rigId/session/end` `{ sessionId }` | The driver ended early |
| POST | `/rigs/:rigId/call/skip` `{ queueEntryId }` | The called player isn't there |
| POST | `/rigs/:rigId/laps` `{ clientLapId, sessionId, lapTimeMs, valid, invalidReason?, sectorsMs?, track, trackConfig, car, completedAt }` | Report a lap. Idempotent per `clientLapId`. Laps completed after the session's end are stored as invalid (`AFTER_TIME`). Returns `{ isPersonalBest, rankToday, rankAllTime, ... }`. |

Heartbeat and the session/skip actions return the **rig status**: the rig's dashboard entry plus the fields below.

| Field | |
| --- | --- |
| `serverTime` | For clock sync |
| `lastSession` | Summary of the session that just ended, with best lap and today's rank |
| `queueLength` | |
| `nextDriverName` | |
| `config` | |

### Staff (`X-Kiosk-Key` header)

| Method | Path | |
| --- | --- | --- |
| GET | `/admin/overview` | Dashboard plus the 50 most recent laps |
| POST | `/admin/rigs/:rigId/enable` · `/disable` | Close or reopen a rig (maintenance) |
| POST | `/admin/rigs/:rigId/start` `{ queueEntryId }` | Start the called player |
| POST | `/admin/rigs/:rigId/end` `{ sessionId }` | End a session |
| POST | `/admin/rigs/:rigId/extend` `{ sessionId, seconds }` | Add (or remove, with a negative value) session time |
| POST | `/admin/rigs/:rigId/skip` `{ queueEntryId }` | Skip the called player |
| POST | `/admin/queue/:entryId/move` `{ direction: up\|down\|top }` | Reorder the queue |
| POST | `/admin/queue/:entryId/call` `{ rigId }` | Call this player to a rig. Whoever was called there goes back to their spot. |
| DELETE | `/admin/queue/:entryId` | Remove from the queue |
| POST | `/admin/laps/:lapId/invalidate` | Take a lap off the leaderboard |
| DELETE | `/admin/drivers/:driverId` | Delete a driver with all their laps |

## Socket.IO events (server → frontend)

| Event | Payload |
| --- | --- |
| `queue-update` | Same as `GET /queue`. Sent after every state change. |
| `leaderboard-update` | `{}`. A valid lap was added or a lap was removed; refetch leaderboards. |

## Configuration (`.env`)

| Variable | Default | |
| --- | --- | --- |
| `NUMBER_OF_RIGS` | 2 | Rigs `1..N` |
| `SESSION_DURATION_MIN` | 10 | Session length (hard stop) |
| `CALL_TIMEOUT_SEC` | 120 | Time a called player has to press START |
| `SKIP_REQUEUE_POSITIONS` | 3 | Places a skipped player moves back; 0 = drop immediately |
| `RIG_OFFLINE_AFTER_SEC` | 10 | Heartbeat timeout |
| `KIOSK_KEY` | empty | Shared secret for rig apps and the staff page. Empty disables the check. |

## Testing

`bun run test` runs the service and router tests against `prisma/test.db`, which is recreated from the migrations on every run. Tests move time with `fakeClock()` from `src/test/helpers.ts`.
