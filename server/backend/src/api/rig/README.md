# Queue API Documentation

## Overview

The Queue API manages racing sessions across multiple rigs. It provides endpoints for players to join queues, rigs to retrieve next players, and dashboard updates via Socket.io.

## Architecture

### Data Models

#### Player
```typescript
{
  id: string;           // Auto-generated unique ID
  name: string;         // Player name (1-50 chars)
  joinedAt: Date;       // Timestamp when joined
}
```

#### Rig
```typescript
{
  id: string;                    // "rig-1", "rig-2", etc.
  state: "FREE" | "RACING";      // Current rig state
  currentPlayer: Player | null;  // Active player (when RACING)
  queue: Player[];               // Waiting players
}
```

### State Transitions

```
FREE → RACING:  POST /rigs/:rigId/state { state: "RACING", playerId: "..." }
RACING → FREE:  POST /queue/complete/:rigId
```

## REST API Endpoints

### Join Queue
**POST** `/queue`

Adds player to the rig with shortest queue.

**Request:**
```json
{
  "playerName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Player joined queue",
  "responseObject": {
    "playerId": "player-1234567890-abc123",
    "rigId": "rig-1",
    "queuePosition": 3
  },
  "statusCode": 200
}
```

---

### Get Next Player
**GET** `/queue/next/:rigId`

Returns next player in queue for specified rig (used by race interceptor polling).

**Response (player available):**
```json
{
  "success": true,
  "message": "Next player retrieved",
  "responseObject": {
    "player": {
      "id": "player-1234567890-abc123",
      "name": "John Doe",
      "joinedAt": "2025-11-24T10:30:00.000Z"
    }
  },
  "statusCode": 200
}
```

**Response (no player):**
```json
{
  "success": true,
  "message": "Next player retrieved",
  "responseObject": {
    "player": null
  },
  "statusCode": 200
}
```

---

### Update Rig State
**POST** `/rigs/:rigId/state`

Transitions rig between FREE and RACING states.

**Request (start session):**
```json
{
  "state": "RACING",
  "playerId": "player-1234567890-abc123"
}
```

**Request (end session):**
```json
{
  "state": "FREE"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Rig state updated",
  "responseObject": {
    "rig": {
      "id": "rig-1",
      "state": "RACING",
      "currentPlayer": { ... },
      "queue": [ ... ]
    }
  },
  "statusCode": 200
}
```

---

### Complete Session
**POST** `/queue/complete/:rigId`

Removes current player and sets rig to FREE state.

**Response:**
```json
{
  "success": true,
  "message": "Session completed",
  "responseObject": {
    "rig": {
      "id": "rig-1",
      "state": "FREE",
      "currentPlayer": null,
      "queue": [ ... ]
    }
  },
  "statusCode": 200
}
```

---

### Get Dashboard
**GET** `/dashboard`

Returns all rig states for dashboard display.

**Response:**
```json
{
  "success": true,
  "message": "Dashboard data retrieved",
  "responseObject": {
    "rigs": [
      {
        "id": "rig-1",
        "state": "RACING",
        "currentPlayer": { "name": "John Doe", ... },
        "queue": [
          { "name": "Player 2", ... },
          { "name": "Player 3", ... }
        ]
      },
      {
        "id": "rig-2",
        "state": "FREE",
        "currentPlayer": null,
        "queue": [ ... ]
      }
    ]
  },
  "statusCode": 200
}
```

## Socket.io Events

### Client → Server
None (client only listens)

### Server → Client

#### `queue-update`
Emitted whenever queue state changes (player joins, session starts/ends).

**Payload:**
```json
{
  "rigs": [
    {
      "id": "rig-1",
      "state": "RACING",
      "currentPlayer": { ... },
      "queue": [ ... ]
    }
  ]
}
```

## User Flow Example

### 1. Player Joins Queue
```bash
# Player visits web UI and enters name
POST /queue
{ "playerName": "John Doe" }

# Response indicates assigned rig
# Socket.io emits "queue-update" to all connected clients
```

### 2. Race Interceptor Polls for Next Player
```bash
# Interceptor on rig-1 polls every 1 second (when FREE)
GET /queue/next/rig-1

# Returns next player or null
```

### 3. Player Starts Session
```bash
# Interceptor displays "Start as John Doe" button
# User clicks "Start", watchdog monitors race.ini

# When Content Manager writes race.ini, interceptor:
# 1. Overrides player name
# 2. Transitions rig to RACING

POST /rigs/rig-1/state
{ "state": "RACING", "playerId": "player-..." }

# Socket.io emits "queue-update"
```

### 4. Session Completion
```bash
# Player clicks "Finish" button in interceptor

POST /queue/complete/rig-1

# Rig returns to FREE, starts polling again
# Socket.io emits "queue-update"
```

## Configuration

Default configuration initializes **2 rigs** (`rig-1`, `rig-2`). To modify:

Edit `queueRepository.ts`:
```typescript
constructor() {
  this.initializeRigs(4); // Change to desired number
}
```

## Testing

```bash
# Run tests
cd control_server/backend
bun run test

# Run specific test file
bun run test queueService.test.ts
```

## OpenAPI Documentation

Interactive API documentation available at:
- **Swagger UI**: `http://localhost:PORT/swagger`
- **OpenAPI JSON**: `http://localhost:PORT/swagger.json`
