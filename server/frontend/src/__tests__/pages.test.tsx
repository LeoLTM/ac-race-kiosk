// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AdminOverview,
  DashboardResponse,
  LeaderboardResponse,
} from '../lib/api'
import { RigState } from '../lib/api'
import { routeTree } from '../routeTree.gen'

// No real Socket.IO connection in tests
vi.mock('@/lib/socket', () => ({
  socket: { connected: true, on: vi.fn(), off: vi.fn() },
}))

const now = Date.now()
const combo = {
  track: 'ks_brands_hatch',
  trackConfig: 'indy',
  car: 'ks_mercedes_amg_gt3',
}

const dashboard: DashboardResponse = {
  serverTime: now,
  config: { sessionDurationSec: 600, callTimeoutSec: 120 },
  rigs: [
    {
      id: 1,
      enabled: true,
      online: true,
      lastSeenAt: now,
      appVersion: '1.0.0',
      ...combo,
      state: RigState.RACING,
      called: null,
      session: {
        id: 's1',
        driverId: 'd1',
        driverName: 'Alice',
        startedAt: now - 60_000,
        endsAt: now + 245_000,
        lapCount: 3,
        validLapCount: 2,
        bestLapMs: 48_412,
        lastLapMs: 49_001,
      },
    },
    {
      id: 2,
      enabled: true,
      online: true,
      lastSeenAt: now,
      appVersion: '1.0.0',
      ...combo,
      state: RigState.CALLING,
      session: null,
      called: {
        queueEntryId: 'q2',
        driverName: 'Bob',
        calledAt: now,
        timeoutAt: now + 90_000,
      },
    },
    {
      id: 3,
      enabled: false,
      online: false,
      lastSeenAt: null,
      appVersion: null,
      track: null,
      trackConfig: null,
      car: null,
      state: RigState.FREE,
      session: null,
      called: null,
    },
  ],
  queue: [
    {
      id: 'q3',
      driverName: 'Carol',
      position: 1,
      skipCount: 0,
      joinedAt: now,
      etaSec: 280,
    },
  ],
}

const leaderboard: LeaderboardResponse = {
  combo,
  period: 'today',
  entries: [
    {
      rank: 1,
      driverId: 'd1',
      driverName: 'Alice',
      lapTimeMs: 48_412,
      completedAt: now,
      rigId: 1,
      lapId: 'l1',
    },
  ],
}

const overview: AdminOverview = {
  ...dashboard,
  recentLaps: [
    {
      id: 'l1',
      driverId: 'd1',
      driverName: 'Alice',
      rigId: 1,
      lapTimeMs: 48_412,
      valid: true,
      invalidReason: null,
      ...combo,
      completedAt: now,
    },
  ],
}

function respond(responseObject: unknown, status = 200) {
  return Promise.resolve(
    new Response(
      JSON.stringify({
        success: status < 400,
        message: 'ok',
        responseObject,
        statusCode: status,
      }),
      { status },
    ),
  )
}

function mockApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input)
      if (url.pathname === '/queue' && init?.method === 'POST') {
        return respond({
          queueEntryId: 'q9',
          driverName: 'Dave',
          position: 2,
          etaSec: 540,
          calledRigId: null,
        })
      }
      if (url.pathname === '/queue') return respond(dashboard)
      if (url.pathname === '/leaderboard') return respond(leaderboard)
      if (url.pathname === '/leaderboard/combos')
        return respond({
          combos: [{ ...combo, lapCount: 2, lastLapAt: now }],
          current: combo,
        })
      if (url.pathname === '/admin/overview') return respond(overview)
      return respond(null, 404)
    }),
  )
}

function renderPage(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('pages', () => {
  beforeEach(() => {
    mockApi()
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('dashboard shows racing, calling and closed rigs plus the queue', async () => {
    renderPage('/dashboard')

    expect(await screen.findByText('RIG 1')).toBeTruthy()
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('👉 Please come to Rig 2!')).toBeTruthy()
    expect(screen.getByText('Temporarily closed')).toBeTruthy()
    expect(screen.getByText('Carol')).toBeTruthy()
    expect(screen.getByText('~5 min')).toBeTruthy()
    expect(screen.getAllByText('0:48.412').length).toBeGreaterThan(0)
    expect(await screen.findByText("Today's Fastest")).toBeTruthy()
  })

  it('leaderboard lists the best laps for the current combo', async () => {
    renderPage('/lap-times')

    expect(await screen.findByText('Alice')).toBeTruthy()
    expect(screen.getByText('0:48.412')).toBeTruthy()
    expect(
      screen.getByText('Brands Hatch Indy · Mercedes Amg Gt3'),
    ).toBeTruthy()
  })

  it('register shows the queue position and wait after joining', async () => {
    renderPage('/register')

    fireEvent.change(await screen.findByLabelText('Driver Name'), {
      target: { value: 'Dave' },
    })
    fireEvent.click(screen.getByText('Join the Queue'))

    expect(await screen.findByText("You're In!")).toBeTruthy()
    expect(screen.getByText('#2')).toBeTruthy()
    expect(screen.getByText('~9 min')).toBeTruthy()
  })

  it('admin shows rig controls, queue and laps', async () => {
    renderPage('/admin')

    expect(await screen.findByText('Rig 1')).toBeTruthy()
    expect(screen.getByText('End session')).toBeTruthy()
    expect(screen.getByText('Calling Bob')).toBeTruthy()
    expect(screen.getByText('Reopen rig')).toBeTruthy()
    expect(screen.getByText('Carol')).toBeTruthy()
    expect(screen.getByText('Invalidate')).toBeTruthy()
  })

  it('admin asks for the PIN when the server rejects the key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => respond(null, 401)),
    )
    renderPage('/admin')

    expect(await screen.findByText('Staff Access')).toBeTruthy()
  })
})
