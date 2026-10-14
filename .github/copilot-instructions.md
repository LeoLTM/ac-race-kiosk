# Assetto Corsa Race Kiosk - AI Coding Assistant Instructions

## Project Overview

Queue-based racing session manager for Assetto Corsa across multiple racing rigs. Players join one shared queue via the web UI; the backend calls them to the next free rig, runs timed sessions (hard stop) and keeps a lap-time leaderboard. An in-game AC Python app on each rig (`ac-app/racekiosk/`) shows the handover screens and reports laps. AC keeps running all day - drivers are swapped in the app, not by restarting the game.

## Architecture (3 Components)

### 1. Control Server Backend (`server/backend/`)
- **Stack**: Node.js/TypeScript, Express 5, Zod validation, OpenAPI docs, Prisma 7 + SQLite
- **Pattern**: Feature-based organization (`api/user/`, `api/healthCheck/`)
- **Key Files**: 
  - `src/server.ts` - Express app setup with middleware chain
  - `src/common/models/serviceResponse.ts` - Standardized API responses
  - `src/common/utils/httpHandlers.ts` - Request validation with Zod
  - `src/common/utils/prismaClient.ts` - Prisma client singleton with libsql adapter
  - `prisma/schema.prisma` - Database schema definition
  - `prisma.config.ts` - Prisma 7 configuration with datasource URL

### 2. Web UI (`server/frontend/`)
- **Stack**: React 19, TanStack Router (file-based), TanStack Query, Tailwind CSS 4, shadcn/ui
- **Routing**: File-based in `src/routes/` (auto-generates `routeTree.gen.ts`)
- **Layout**: Root layout at `src/routes/__root.tsx` with `<Outlet />` for child routes
- **Key Files**:
  - `src/main.tsx` - QueryClient provider setup
  - `src/routes/__root.tsx` - Global layout with devtools

### 3. AC App (`ac-app/racekiosk/`)
- **Stack**: Python 3.3 (Assetto Corsa's embedded interpreter), AC Python app API (`ac`, `acsys`), no third-party packages
- **Purpose**: In-game window on each rig: "Get ready, {name}!" with START / NOT HERE, session countdown, lap tracking and upload
- **Key Files**:
  - `racekiosk.py` - `acMain` / `acUpdate` / `acShutdown`, reads car state
  - `racekiosk_lib/controller.py` - screens, buttons, lap attribution (pure logic)
  - `racekiosk_lib/lap_tracker.py` - completed laps + validity from per-frame car state (pure logic)
  - `racekiosk_lib/kiosk_client.py` - background HTTP thread (heartbeat, actions, laps)
  - `stdlib/`, `stdlib64/` - `_socket.pyd` / `_ctypes.pyd` from Python 3.3.5, missing in AC's interpreter

## Development Workflows

`server/` is one Bun workspace (`backend`, `frontend`, `shared`) with a single `bun.lock`, hoisted `node_modules` (`bunfig.toml`) and one Biome config. Run everything from `server/`:

```bash
cd server
bun install                 # All packages; postinstall generates the Prisma client
bun run dev                 # Backend (bun --watch) + frontend (Vite, port 3000) together
bun run dev:backend         # Only one of them (also dev:frontend)
bun run build               # Backend: tsup -> backend/dist/index.js (CJS, runs on Node); frontend: vite build
bun run start               # node backend/dist/index.js
bun run test                # Vitest in backend and frontend
bun run typecheck           # tsc in every package
bun run lint                # Biome lint + format check (CI); `bun run check` applies fixes
bun run db:generate         # Regenerate Prisma client after schema changes
bun run db:migrate          # Create and apply database migrations
bun run db:deploy           # Apply existing migrations
bun run db:studio           # Prisma Studio GUI
bun add <pkg> --cwd backend # Add a dependency to one package
bunx --bun shadcn@latest add <component>   # From server/frontend: add shadcn components
```

The production backend must keep running on Node (not only Bun): it will be packaged into standalone Linux/Windows binaries with yao-pkg.

### AC App
```bash
python -m unittest discover -s ac-app/tests                       # Tests (no AC needed)
python ac-app/tools/fake_rig.py --rig 1 --url http://localhost:8080 --key <KIOSK_KEY>   # Simulated rig
```

## Project-Specific Conventions

### Backend Patterns
1. **API Feature Structure**: Each feature has `{feature}Model.ts`, `{feature}Service.ts`, `{feature}Repository.ts`, `{feature}Controller.ts`, `{feature}Router.ts`
2. **ServiceResponse Pattern**: All service methods return `ServiceResponse<T>` with `.success()` or `.failure()` static methods (see `userService.ts`)
3. **Validation**: Use `validateRequest(schema)` middleware with Zod schemas defined in model files (e.g., `GetUserSchema`)
4. **OpenAPI**: Register routes in registry within router files using `@asteasolutions/zod-to-openapi`
5. **Path Aliases**: Use `@/` for imports (e.g., `@/api/user/userModel`) - configured in `tsconfig.json`
6. **Database (Prisma 7)**:
   - Schema defined in `prisma/schema.prisma`, config in `prisma.config.ts`
   - Uses `@prisma/adapter-libsql` for Bun compatibility
   - Import client from `@/generated/prisma` (generated to `src/generated/prisma/`)
   - Use singleton `prisma` from `@/common/utils/prismaClient`
   - Run `bun run db:migrate` (from `server/`) after schema changes

### Frontend Patterns
1. **Routing**: Add route by creating file in `src/routes/` - TanStack Router auto-generates types
2. **Data Fetching**: Use TanStack Query with `queryClient` from root context (see `demo/tanstack-query.tsx`)
3. **Styling**: Tailwind with `cn()` utility from `lib/utils.ts` for conditional classes
4. **Components**: shadcn/ui components installed to `src/components/` via `bunx --bun shadcn@latest add`
5. **Path Aliases**: Use `@/` for imports - configured in `vite.config.ts` and `tsconfig.json`
6. **API types**: Import from `@/lib/api`, which re-exports the types from `@racekiosk/shared`

### Backend Kiosk Logic
1. **Single owner**: All queue/call/session/lap transitions live in `src/api/rig/rigService.ts` and run through `transition()` (serialized by a lock, broadcasts `queue-update` afterwards)
2. **Background tick**: `rigService.tick()` runs every second (hard stop, no-show timeouts, release calls of offline rigs, call players to free rigs)
3. **Time in tests**: Use `clock.now()` (`src/common/utils/clock.ts`) instead of `new Date()`; tests control it via `fakeClock()`
4. **Auth**: Rig and admin routes use `requireKioskKey` (`X-Kiosk-Key` header = `KIOSK_KEY`)

### AC App Patterns
1. **Python 3.3 only**: no f-strings, `pathlib`, `enum`, `typing` or third-party packages; use `.format()`
2. **No network on AC's render thread**: `acUpdate` exchanges messages with `KioskClient`'s worker thread via queues
3. **Testable core**: everything except `ui.py`, `sim_info.py` and `racekiosk.py` has no `ac` imports and is unit tested on desktop Python
4. **Unique package name**: `racekiosk_lib`, since all AC apps share one interpreter and `sys.modules`

## Integration Points

### Backend ↔ Frontend
- Backend exposes REST API with CORS configured via `env.CORS_ORIGIN`
- Frontend uses TanStack Query for API calls (see `/demo/tanstack-query` for pattern)
- `server/shared/` (`@racekiosk/shared`) holds the response types (`Rig`, `DashboardResponse`, ...), the `ApiResponse` envelope and the typed Socket.IO events (`ServerToClientEvents`)
- The backend's Zod view schemas end in `satisfies z.ZodType<Api.X>`, so changing a response without updating the shared type fails `bun run typecheck`
- `shared` is consumed as TypeScript source (`exports` -> `src/index.ts`); the backend's tsup build bundles it

### Backend ↔ AC App
- **Heartbeat**: App POSTs `/rigs/:rigId/heartbeat` every second; the response is the rig status (`FREE` / `CALLING` / `RACING`, called player, session with `endsAt`, last session summary, `serverTime` for clock sync)
- **Actions**: `/rigs/:rigId/session/start|end`, `/rigs/:rigId/call/skip`, always with the `queueEntryId` / `sessionId` they refer to (409 if stale)
- **Laps**: `/rigs/:rigId/laps`, idempotent per `clientLapId`; buffered in `outbox.json` while the server is unreachable
- Full API: `server/backend/src/api/rig/README.md`

### AC App ↔ Assetto Corsa
- Reads `acsys.CS.LapCount`, `LastLap`, `LapInvalidated` and `ac.isCarInPitline(0)` about 10x per second
- First lap after START, pit lane laps, cut laps and laps after the time limit are reported as invalid

## Key Files Reference

| File | Purpose |
|------|---------|
| `server/backend/src/server.ts` | Express app setup, middleware chain |
| `server/backend/src/common/models/serviceResponse.ts` | Standard response wrapper |
| `server/backend/src/api/rig/rigService.ts` | Queue, rig calls, sessions, laps, background tick |
| `server/backend/src/api/leaderboard/leaderboardService.ts` | Best lap per driver per track/car combo |
| `server/frontend/src/routes/__root.tsx` | Root layout with devtools |
| `server/frontend/src/main.tsx` | App entry, QueryClient setup |
| `server/frontend/src/routes/admin.tsx` | Staff page (PIN = `KIOSK_KEY`) |
| `ac-app/racekiosk/racekiosk.py` | AC app entry point |

## Testing

- **Backend**: Vitest with `supertest` for API tests (`__tests__/` co-located with features); DB tests run against `prisma/test.db`, recreated from migrations in `src/test/globalSetup.ts`
- **Frontend**: Vitest + Testing Library
- Both use `.test.ts` suffix and have `globals: true` in Vitest config
- **AC app**: `unittest` in `ac-app/tests/` (runs on Python 3.3 and current Python; `fake_ac.py` only allows real AC API functions)

## Tools & Formatting

- **Biome** for linting and formatting everywhere (`server/biome.json`): backend and shared use tabs, double quotes, 120 columns; `frontend/**` overrides to 2 spaces, single quotes, no semicolons, 80 columns
- **TypeScript**: strict, shared options in `server/tsconfig.base.json` (Bundler resolution); each package's `tsconfig.json` extends it; path aliases via `@/`
