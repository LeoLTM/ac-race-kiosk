# Assetto Corsa Race Cafe Kiosk

A kiosk-style interface for race cafes where multiple players can quickly register their nickname before racing in Assetto Corsa. Perfect for LAN parties, racing cafes, and shared racing setups.

## Overview

This application automatically intercepts and modifies the Assetto Corsa `race.ini` file when Content Manager starts a race, replacing the default driver name with the player's chosen nickname. Players simply enter their name and start racing - no manual configuration needed.

## How It Works

1. Player enters their nickname in the kiosk interface
2. The application monitors `race.ini` for changes using a file system watcher
3. When Content Manager writes to `race.ini` (at race start), the application immediately intercepts it
4. The driver name is replaced with the registered nickname
5. The interface automatically clears and prepares for the next player

The system uses the `watchdog` library to monitor the `~/Documents/Assetto Corsa/cfg/race.ini` file and applies changes with precise timing to ensure Content Manager's settings are overridden.

## Features

- Clean, racing-themed kiosk interface
- Automatic nickname interception when races start
- Recent racers quick-select buttons (saves last 6 nicknames)
- Race counter to track sessions
- Auto-start monitoring on launch
- Persistent nickname history stored in `nickname_config.json`

## Requirements

### Runtime Requirements

- **Python 3.6 or higher**
- **Windows OS** (paths are configured for Windows)
- **Assetto Corsa** installed with Content Manager
- **watchdog** Python package for file system monitoring

### Development Requirements

All runtime requirements plus:
- Basic understanding of Python
- Text editor or IDE (VS Code, PyCharm, etc.)
- Git (optional, for version control)

## Installation

### Quick Setup

1. Clone or download this repository
2. Run the setup script:
   ```cmd
   setup_interceptor.bat
   ```

This will verify Python installation and install the required `watchdog` package.

### Manual Setup

If you prefer manual installation:

```cmd
python -m pip install watchdog
```

## Usage

### Running the Application

**Option 1: Using the batch file (recommended)**
```cmd
run_interceptor.bat
```

**Option 2: Direct Python execution**
```cmd
python ac_nickname_interceptor.py
```

### Workflow

1. Launch the kiosk application
2. Player enters their nickname and presses Enter (or clicks a recent name)
3. Player starts their race in Content Manager
4. The application automatically updates the driver name
5. After race starts, the interface clears for the next player

## Configuration

### nickname_config.json

Automatically created and maintained by the application. Stores recently used nicknames:

```json
{
  "nicknames": [
    "player1",
    "player2",
    "player3"
  ]
}
```

Up to 20 nicknames are stored, with the 6 most recent shown as quick-select buttons.

### Modified Files

The application modifies `~/Documents/Assetto Corsa/cfg/race.ini`, specifically:
- `DRIVER_NAME` in the `[CAR_0]` section
- `NAME` in the `[REMOTE]` section

## Development

### Code Structure

**RaceIniHandler Class**
- Extends `FileSystemEventHandler` from watchdog
- Monitors `race.ini` for modifications
- Handles file reading/writing with retry logic for locked files
- Implements debouncing to prevent multiple triggers

**NicknameInterceptorUI Class**
- Main application GUI using tkinter
- Manages nickname entry and quick-select interface
- Coordinates file monitoring and UI updates
- Handles persistent storage of nicknames

### Key Dependencies

- `watchdog.observers.Observer` - File system monitoring
- `watchdog.events.FileSystemEventHandler` - Event handling
- `tkinter` - GUI framework (included with Python)
- `configparser` - INI file parsing
- `pathlib` - Cross-platform path handling

### Customization

**UI Styling**: Modify the `setup_styles()` method to change colors and fonts

**Timing**: Adjust sleep delays in `RaceIniHandler.on_modified()` if interception is unreliable

**Nickname Limit**: Change the slice `[:20]` in `save_nicknames_list()` to store more/fewer nicknames

**Quick-Select Count**: Modify `[:6]` in `setup_ui()` to show more/fewer quick-select buttons

## Troubleshooting

**Application doesn't start**
- Verify Python is installed: `python --version`
- Ensure Python is in PATH
- Run `setup_interceptor.bat` to install dependencies

**Nickname not changing**
- Confirm Assetto Corsa is installed in default location
- Check that `~/Documents/Assetto Corsa/cfg/race.ini` exists
- Ensure Content Manager is being used to start races

**File permission errors**
- Close Assetto Corsa and Content Manager
- Delete `race.ini` and let Content Manager recreate it
- Run the application as administrator (if necessary)
- 