# Assetto Corsa Race Kiosk - AI Coding Assistant Instructions

## Project Overview

Queue-based racing session manager for Assetto Corsa across multiple racing rigs. Players join via web UI, backend manages queues/rig states, and Python interceptors running on each rig inject player names into Content Manager's `race.ini` file.

## Architecture (3 Components)

### 1. Control Server Backend (`server/backend/`)
- **Stack**: Node.js/TypeScript, Express 5, Zod validation, OpenAPI docs
- **Pattern**: Feature-based organization (`api/user/`, `api/healthCheck/`)
- **Key Files**: 
  - `src/server.ts` - Express app setup with middleware chain
  - `src/common/models/serviceResponse.ts` - Standardized API responses
  - `src/common/utils/httpHandlers.ts` - Request validation with Zod

### 2. Web UI (`server/frontend/`)
- **Stack**: React 19, TanStack Router (file-based), TanStack Query, Tailwind CSS 4, shadcn/ui
- **Routing**: File-based in `src/routes/` (auto-generates `routeTree.gen.ts`)
- **Layout**: Root layout at `src/routes/__root.tsx` with `<Outlet />` for child routes
- **Key Files**:
  - `src/main.tsx` - QueryClient provider setup
  - `src/routes/__root.tsx` - Global layout with devtools

### 3. Race Interceptor (`interceptor/`)
- **Stack**: Python 3.6+, tkinter GUI, watchdog library
- **Purpose**: Monitors `~/Documents/Assetto Corsa/cfg/race.ini` on each racing rig, intercepts Content Manager writes, replaces driver name with queued player
- **Key Files**: `ac_nickname_interceptor.py` - Main application with `RaceIniHandler` and `NicknameInterceptorUI`

## Development Workflows

### Backend Commands
```bash
cd server/backend
bun install                 # Install dependencies
bun run start:dev          # Dev mode with --watch (tsx)
bun run build              # TypeScript compile + tsup bundle
bun run test               # Run Vitest tests
bun run check              # Biome format + lint
```

### Frontend Commands
```bash
cd server/frontend
bun install                           # Install dependencies
bun --bun run dev                     # Dev server on port 3000
bun --bun run build                   # Production build
pnpx shadcn@latest add <component>   # Add shadcn components
bun --bun run check                   # Prettier + ESLint fix
```

### Race Interceptor
```bash
cd interceptor
python -m pip install watchdog        # Install dependencies
python ac_nickname_interceptor.py     # Run kiosk UI
```

## Project-Specific Conventions

### Backend Patterns
1. **API Feature Structure**: Each feature has `{feature}Model.ts`, `{feature}Service.ts`, `{feature}Repository.ts`, `{feature}Controller.ts`, `{feature}Router.ts`
2. **ServiceResponse Pattern**: All service methods return `ServiceResponse<T>` with `.success()` or `.failure()` static methods (see `userService.ts`)
3. **Validation**: Use `validateRequest(schema)` middleware with Zod schemas defined in model files (e.g., `GetUserSchema`)
4. **OpenAPI**: Register routes in registry within router files using `@asteasolutions/zod-to-openapi`
5. **Path Aliases**: Use `@/` for imports (e.g., `@/api/user/userModel`) - configured in `tsconfig.json`

### Frontend Patterns
1. **Routing**: Add route by creating file in `src/routes/` - TanStack Router auto-generates types
2. **Data Fetching**: Use TanStack Query with `queryClient` from root context (see `demo/tanstack-query.tsx`)
3. **Styling**: Tailwind with `cn()` utility from `lib/utils.ts` for conditional classes
4. **Components**: shadcn/ui components installed to `src/components/` via pnpx command
5. **Path Aliases**: Use `@/` for imports - configured in `vite.config.ts`

### Race Interceptor Patterns
1. **File Watching**: `watchdog.Observer` monitors `race.ini`, `RaceIniHandler` extends `FileSystemEventHandler`
2. **Debouncing**: `last_modified_time` prevents duplicate events (0.5s threshold)
3. **File Locking**: Retry logic (max 5 attempts, 0.1s delay) handles locked files during CM writes
4. **Timing**: 0.15s delay after modification event ensures CM finished writing before intercept

## Integration Points

### Backend ↔ Frontend
- Backend exposes REST API with CORS configured via `env.CORS_ORIGIN`
- Frontend uses TanStack Query for API calls (see `/demo/tanstack-query` for pattern)
- Shared ServiceResponse schema for type-safe responses

### Backend ↔ Race Interceptor
- **Rig States**: Backend tracks `FREE` (polling every 1s) vs `RACING` (active session)
- **Queue Assignment**: Backend `/queue` endpoint assigns players to shortest queue
- **Player Injection**: Interceptor polls backend for next player, displays "Start as {PlayerName}" UI

### Race Interceptor ↔ Assetto Corsa
- Monitors `~/Documents/Assetto Corsa/cfg/race.ini` for changes
- Modifies `DRIVER_NAME=` in `[CAR_0]` section and `NAME=` in `[REMOTE]` section
- Preserves exact file formatting (whitespace, encoding) during modification

## Key Files Reference

| File | Purpose |
|------|---------|
| `server/backend/src/server.ts` | Express app setup, middleware chain |
| `server/backend/src/common/models/serviceResponse.ts` | Standard response wrapper |
| `server/backend/src/api/user/userService.ts` | Example service pattern |
| `server/frontend/src/routes/__root.tsx` | Root layout with devtools |
| `server/frontend/src/main.tsx` | App entry, QueryClient setup |
| `interceptor/ac_nickname_interceptor.py` | File watcher + GUI kiosk |

## Testing

- **Backend**: Vitest with `supertest` for API tests (`__tests__/` co-located with features)
- **Frontend**: Vitest + Testing Library (run with `bun --bun run test`)
- Both use `.test.ts` suffix and have `globals: true` in Vitest config

## Tools & Formatting

- **Backend**: Biome for linting/formatting (120 line width, `biome.json`)
- **Frontend**: ESLint (TanStack config) + Prettier
- **Common**: TypeScript strict mode, path aliases via `@/`
