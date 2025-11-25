# Assetto Corsa Race Interceptor Client

Race rig client application that integrates with the control server backend to manage queue-based racing sessions. This application runs on each racing rig and handles automatic player name injection into Assetto Corsa's configuration files.

## Overview

This client connects to the control server backend via REST API and Socket.IO to receive real-time queue updates. When a player is ready to race, the operator clicks "Start Race" which activates a "hot phase" watchdog that intercepts Content Manager's `race.ini` file writes and injects the queued player's name.

## How It Works

1. Client connects to control server via Socket.IO for real-time updates
2. Displays next player in queue and queue depth on minimal UI
3. Operator clicks "Start Race" when ready
4. Client transitions rig to RACING state via REST API
5. Watchdog activates and monitors `race.ini` for changes
6. When Content Manager writes to `race.ini`, watchdog intercepts and injects player name
7. Watchdog stops after successful injection
8. Operator clicks "End Session" after player finishes racing
9. Client transitions rig back to FREE state and awaits next player

## Features

- **Real-time queue updates** via Socket.IO (no polling overhead)
- **Minimal UI** showing connection status, current player, and queue depth
- **Hot phase watchdog** - only active during race start initialization
- **Automatic reconnection** with exponential backoff
- **State machine management** - FREE vs RACING states
- **REST API integration** for state transitions
- **Skip player** functionality to remove players from queue

## Requirements

### Runtime Requirements

- **Python 3.6 or higher**
- **Windows OS** (paths configured for Windows)
- **Assetto Corsa** with Content Manager
- **Network access** to control server backend
- **Dependencies**: watchdog, requests, python-dotenv, python-socketio

### Backend Requirements

- Control server backend must be running and accessible
- Rig must be configured in backend (via `NUMBER_OF_RIGS` env variable)

## Installation

### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

Or manually:
```bash
pip install watchdog requests python-dotenv python-socketio[client]
```

### 2. Configure Environment

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
BACKEND_URL=http://localhost
BACKEND_PORT=8080
RIG_ID=1
```

**Important**: `RIG_ID` must match a rig configured in the backend (1, 2, 3, etc.)

## Usage

### Running the Client

```bash
python ac_nickname_interceptor.py
```

Or on Windows:
```cmd
run_interceptor.bat
```

### Operator Workflow

1. **Launch client** - Application connects to backend and shows connection status
2. **Wait for player** - UI displays "Waiting for player..." until someone joins queue
3. **Player appears** - UI shows "Next: PlayerName" with queue depth
4. **Start race**:
   - Operator clicks "Start Race" button
   - Client transitions to RACING state
   - Watchdog activates (hot phase begins)
5. **Player starts race in Content Manager**:
   - Watchdog intercepts `race.ini` write
   - Injects player name automatically
   - Watchdog stops after successful injection
6. **Player finishes racing**:
   - Operator clicks "End Session" button
   - Client transitions back to FREE state
   - UI updates with next player (if any in queue)

### Skip Player

If a player doesn't show up or wants to leave the queue:
- Operator clicks "Skip Player" button
- Confirms action in dialog
- Player is removed from queue and memory
- Next player appears (if any)

## Configuration

### Environment Variables (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| `BACKEND_URL` | Backend server URL (without port) | `http://localhost` |
| `BACKEND_PORT` | Backend server port | `8080` |
| `RIG_ID` | Unique rig identifier (must match backend config) | `1` |

### Backend API Endpoints

The client communicates with these backend endpoints:

- **Socket.IO**: Real-time queue updates
  - Event: `queue-update` - Receives rig state changes
  
- **REST API**:
  - `POST /rigs/:rigId/state` - Transition rig state (FREE ↔ RACING)
  - `POST /queue/complete/:rigId` - Complete session and return to FREE
  - `POST /queue/skip/:rigId` - Skip current player in queue

## UI Elements

### Status Display

- **Connection Status**: Green dot (●Connected) or red dot (●Disconnected)
- **Player Name**: "Waiting for player..." or "Next: PlayerName"
- **Queue Depth**: "N players waiting"
- **Rig State**: "State: FREE" or "State: RACING"

### Buttons

- **Start Race** (green) - Enabled when player available and rig FREE
- **Skip Player** (orange) - Enabled when player available and rig FREE
- **End Session** (red) - Only visible when rig is RACING

## Development

### Code Structure

**config.py**
- Loads environment variables from `.env`
- Validates required configuration
- Exports singleton `config` instance

**backend_client.py**
- `BackendClient` class with REST methods and Socket.IO integration
- Automatic reconnection with exponential backoff
- Request retry logic (3 attempts)
- Event callback system for queue updates

**ac_nickname_interceptor.py**
- `RaceIniHandler` - File system event handler for hot phase watchdog
- `RaceInterceptorUI` - Minimal tkinter UI with backend integration
- State machine logic (FREE ↔ RACING transitions)

### Key Dependencies

- `watchdog` - File system monitoring (hot phase only)
- `requests` - HTTP client for REST API
- `python-dotenv` - Environment variable management
- `python-socketio` - Socket.IO client for real-time updates
- `tkinter` - GUI framework (included with Python)

### Modified Files

The application modifies `~/Documents/Assetto Corsa/cfg/race.ini`:
- `DRIVER_NAME` in `[CAR_0]` section
- `NAME` in `[REMOTE]` section

## Troubleshooting

### Connection Issues

**"Disconnected" status**
- Verify backend server is running
- Check `BACKEND_URL` and `BACKEND_PORT` in `.env`
- Ensure firewall allows connections
- Check network connectivity

**"Rig not found" errors**
- Verify `RIG_ID` matches backend configuration
- Backend must have `NUMBER_OF_RIGS` >= your `RIG_ID`

### Watchdog Issues

**Player name not injecting**
- Ensure Assetto Corsa is installed in default location
- Verify `~/Documents/Assetto Corsa/cfg/race.ini` exists
- Check that Content Manager is writing to `race.ini`
- Try running as administrator (if permission errors)

**Watchdog stays active**
- Should automatically stop after successful injection
- If stuck, click "End Session" to reset
- Check console output for errors

### State Issues

**Rig stuck in RACING state**
- Click "End Session" to transition back to FREE
- If client crashes during RACING, manually restart and click "End Session"
- Consider adding startup state reset logic if this occurs frequently

### Dependency Errors

**Import errors on startup**
- Run `pip install -r requirements.txt`
- Verify Python version: `python --version` (must be 3.6+)
- Check that packages are installed: `pip list`

## Architecture Integration

This client is part of the larger Race Kiosk system:

- **Control Server Backend** - Manages queues and rig states
- **Web UI** - Players join queues via browser
- **Race Interceptor** (this component) - Runs on each racing rig

See main project README for full architecture documentation.

## License

See LICENSE file in project root.