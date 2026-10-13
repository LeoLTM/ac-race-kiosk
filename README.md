# Assetto Corsa Race Kiosk

Queue and lap-time system for sim racing cafés running Assetto Corsa on several rigs:

1. Players register with their name at a kiosk tablet.
2. They join one shared queue, and the next free rig calls them.
3. Every lap they drive lands on a live leaderboard.

## Architecture

```text
[Kiosk tablet / TV / staff PC]  --HTTP + Socket.IO-->  [Backend]  <--HTTP, polled every 1s--  [AC app on each rig]
  server/frontend                                       server/backend                        ac-app/racekiosk
  register, dashboard,                                  queue, rig calls, session timers,     "Get ready, Max!", START,
  leaderboard, /admin                                   laps, leaderboard (SQLite)            countdown, lap reporting
```

- **Backend** (`server/backend/`):
  - Express 5 + Prisma/SQLite.
  - Owns all state: the shared queue, which player is called to which rig, session timers (hard stop) and laps.
  - A 1-second tick ends expired sessions, times out no-shows and calls waiting players to free rigs.
  - See [the rig API README](server/backend/src/api/rig/README.md).
- **Frontend** (`server/frontend/`):
  - React + TanStack Router/Query.
  - Pages: registration kiosk, TV dashboard, leaderboard, staff admin page.
  - Live updates via Socket.IO.
- **AC app** (`ac-app/racekiosk/`):
  - Python app that runs inside Assetto Corsa on every rig.
  - Shows the handover screens, counts the session down and reports every lap.
  - AC keeps running all day and drivers are swapped in the app, so nothing restarts the game or touches `race.ini`.
  - See [ac-app/README.md](ac-app/README.md).

## Café flow

1. **Register.** The player enters a name at `/register` and gets a queue position and estimated wait. If a rig is free right away, they're told "Go to Rig 2".
2. **Called.**
   - The next free rig calls the head of the queue.
   - The TV dashboard shows "Max → please come to Rig 2!" and the rig shows **"Get ready, Max!"** with **START** / **NOT HERE**.
   - A player who doesn't press START within `CALL_TIMEOUT_SEC` moves back in the queue. The second time, they're dropped.
3. **Race.**
   - START begins a `SESSION_DURATION_MIN` session.
   - Laps are validated in game (out lap, pit lane, cuts) and appear on the leaderboard live, with "PERSONAL BEST! P3 today" feedback in game.
4. **Time's up.**
   - Hard stop at the limit: laps finished afterwards don't count.
   - The rig shows a summary (best lap, rank) and immediately calls the next player, who can press START right away.
5. **Staff** use `/admin` (PIN = `KIOSK_KEY`) to:
   - start, skip or end sessions, and add or remove minutes,
   - close a rig for maintenance,
   - reorder the queue or call a specific player,
   - invalidate laps and delete inappropriate names.

Rigs whose AC app isn't running (offline) or that are closed never get players called to them.

## Getting started

```bash
# Backend
cd server/backend
cp .env.example .env        # set NUMBER_OF_RIGS, KIOSK_KEY, SESSION_DURATION_MIN, ...
bun install
bun run prisma:push         # apply migrations
bun run prisma:seed         # optional sample drivers + laps
bun run start:dev           # http://localhost:8080 (Swagger UI at /)

# Frontend
cd server/frontend
cp .env.example .env        # VITE_API_BASE_URL=http://<server>:8080
bun install
bun --bun run dev           # http://localhost:3000
```

Then install the AC app on every rig as described in [ac-app/README.md](ac-app/README.md). To try everything without Assetto Corsa, run a few simulated rigs:

```bash
python ac-app/tools/fake_rig.py --rig 1 --url http://localhost:8080 --key <KIOSK_KEY>
```

## Tests

```bash
cd server/backend && bun run test          # queue/session/lap logic against a temporary SQLite DB
cd server/frontend && bun --bun run test   # page smoke tests
python -m unittest discover -s ac-app/tests
```
