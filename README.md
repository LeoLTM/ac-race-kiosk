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
- **Shared** (`server/shared/`): API response types and Socket.IO events used by both; the backend's Zod schemas are type-checked against them.
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

The backend and frontend form one [Bun workspace](https://bun.com/docs/install/workspaces) in `server/`, so a single install and one set of scripts cover both:

```text
server/
  backend/   @racekiosk/backend   Express 5 + Prisma/SQLite, Socket.IO
  frontend/  @racekiosk/frontend  React + TanStack Router/Query (Vite)
  shared/    @racekiosk/shared    API types used by both
```

```bash
cd server
bun install                         # all packages; also generates the Prisma client
cp backend/.env.example backend/.env     # set NUMBER_OF_RIGS, KIOSK_KEY, SESSION_DURATION_MIN, ...
bun run dev                         # pages on http://localhost:3000, API on http://localhost:8080/api (Swagger UI at /api/docs)
bun run db:seed                     # optional sample drivers + laps
```

The backend applies pending database migrations whenever it starts. In dev, Vite forwards `/api` and Socket.IO to the backend; in production the backend serves the built pages itself, so pages, API and rig apps all use one address (`http://<server>:8080`).

Then install the AC app on every rig as described in [ac-app/README.md](ac-app/README.md). To try everything without Assetto Corsa, run a few simulated rigs:

```bash
python ac-app/tools/fake_rig.py --rig 1 --url http://localhost:8080 --key <KIOSK_KEY>
```

### Running at a venue

The server ships as one executable per OS (Node, backend, pages and migrations inside; nothing to install). Download it from the [GitHub Releases](https://github.com/LeoLTM/acc-race-kiosk/releases) page (`racekiosk-server-<version>-windows-x64.exe` or `-linux-x64.tar.gz`), or build one for the current OS with `bun run package` (output in `server/backend/release/`).

1. Put the executable in its own folder, with a `.env` next to it that sets at least `NUMBER_OF_RIGS` and `KIOSK_KEY` (all settings: [backend/.env.example](server/backend/.env.example)).
2. Start it. It reads the `.env` and keeps its database (`racekiosk.db`) next to the executable, whatever folder it is started from, and creates and migrates the database on the first start.
3. Open `http://<server>:8080` on the kiosk tablet, TV and staff device, and point the rig apps' `backend_url` at the same address.

Pushing a `v*` tag runs `.github/workflows/release.yml`: it tests and builds the AC app and the server executables in parallel, then publishes all of them in one GitHub release.

### Scripts

Run from `server/`:

| Script | What it does |
|--------|--------------|
| `bun run dev` | Backend (watch mode) and frontend dev server together; `dev:backend` / `dev:frontend` for one |
| `bun run build` | Backend bundle (`backend/dist/index.js`, runs on Node) and frontend (`frontend/dist/`) |
| `bun run start` | Run the built backend with Node; it also serves `frontend/dist/` |
| `bun run package` | Build, then package everything into one executable for this OS (`backend/release/`) |
| `bun run test` | Backend and frontend tests |
| `bun run typecheck` | `tsc` in every package |
| `bun run lint` / `bun run check` | Biome lint + format check / apply fixes |
| `bun run db:migrate` | Create and apply a migration after changing `backend/prisma/schema.prisma` |
| `bun run db:deploy` / `db:seed` / `db:studio` / `db:generate` | Apply migrations without starting the server / sample data / Prisma Studio / regenerate the client |

To add a dependency to one package: `bun add <pkg> --cwd backend` (or `frontend`).

## Tests

```bash
cd server && bun run test                    # backend: queue/session/lap logic against a temporary SQLite DB; frontend: page smoke tests
python -m unittest discover -s ac-app/tests
```
