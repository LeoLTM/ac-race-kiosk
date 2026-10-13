# Race Kiosk – Assetto Corsa app

In-game Python app that runs on every rig. It replaces the old interceptor:

- AC stays running all day. Drivers are swapped in the app, not by restarting the game, so nothing touches `race.ini`.
- The app polls the kiosk server once per second and shows what the rig should do.
- It sends every completed lap to the server for the leaderboard.

## What drivers see

| Screen | When | Buttons |
| --- | --- | --- |
| **Rig N is free** | Nobody is waiting | – |
| **Get ready, Max!** | Max was called to this rig. Max is auto-skipped after `CALL_TIMEOUT_SEC`. | **START**, **NOT HERE** |
| **Max** + countdown (compact) | Max is driving. Shows lap, last lap, best lap, "PERSONAL BEST! P3 today" flashes and who's next. | **END SESSION** (click twice) |
| **Time's up, Max!** | Hard stop at the time limit, then a summary with best lap and rank for about 8 s. The next player can press START here already. | **START**, **NOT HERE** if someone is called |
| **Rig N is closed** | Staff closed the rig on the admin page | – |
| Red banner | The kiosk server is unreachable. Laps are saved and sent later. | – |

**NOT HERE**:

- The first time a player isn't there, they move back `SKIP_REQUEUE_POSITIONS` places.
- The second time, they're dropped.

A no-show timeout does the same.

## Which laps count

A lap is reported as invalid, and doesn't reach the leaderboard, when:

- it is the **first lap after START** (out lap, or the car was already mid-lap),
- the car was in the **pit lane** at any point during it,
- AC flagged it as **cut** (track limits),
- it is shorter than `min_lap_ms`,
- it finished **after the time limit** (hard stop).

## Installation (per rig)

1. Download the `racekiosk` artifact from GitHub Actions, or use this folder directly.
2. Copy the `racekiosk` folder to `<AC install>/apps/python/racekiosk/`.
   - The folder name must stay `racekiosk`, because it has to match `racekiosk.py`.
3. Start AC once, or copy `settings_defaults.ini` to `settings.ini`, then edit `settings.ini`:

   ```ini
   [kiosk]
   backend_url = http://192.168.1.100:8080   ; the kiosk server
   rig_id = 1                                ; 1..NUMBER_OF_RIGS, unique per rig
   kiosk_key = <KIOSK_KEY from the server's .env>
   ```

4. In-game, open the app sidebar on the right side of the screen and enable **Race Kiosk** once. Move the window where drivers can see and click it. AC remembers both.
5. In Content Manager's settings, set the driver name to **Rig N**. This is the name other cars see on track. The kiosk tracks the real player names.
6. Start AC once per day and join the server. A desktop shortcut or autostart entry works well:

   ```bat
   start "" "acmanager://race/online/join?ip=192.168.1.100&httpPort=8081&autoJoin=true"
   ```

   If AC crashes, just start it again. The app picks up the running session from the server.

### Recommended AC server setup

- Run a single long **Practice** session (`[PRACTICE] TIME` = several hours) with `LOOP_MODE=1`. Session changes reset AC's lap counter, and the first lap after a reset is always discarded.
- `ALLOWED_TYRES_OUT=2` (the usual default) decides when a lap counts as cut.

## Configuration

| Setting | Default | |
| --- | --- | --- |
| `kiosk.backend_url` | `http://192.168.1.100:8080` | Kiosk server URL |
| `kiosk.rig_id` | `1` | This rig's number |
| `kiosk.kiosk_key` | empty | Must match `KIOSK_KEY` on the server |
| `kiosk.poll_interval` | `1.0` | Seconds between status polls |
| `kiosk.request_timeout` | `2.0` | Seconds before a request is given up |
| `laps.min_lap_ms` | `20000` | Faster laps are rejected as glitches |
| `ui.scale` | `1.0` | Window size |
| `ui.opacity` | `0.85` | Window background opacity |

Session length, call timeout and requeue rules are configured on the server (`server/backend/.env`).

## How it works

```text
racekiosk.py               acMain / acUpdate / acShutdown, reads car state (LapCount, LastLap, LapInvalidated, pit lane)
racekiosk_lib/
  controller.py            screens, button handling, attributes laps to the current session (pure logic)
  lap_tracker.py           turns per-frame car state into completed laps + validity (pure logic)
  kiosk_client.py          background thread: heartbeat, actions and lap upload over HTTP
  outbox.py                laps waiting for upload, persisted to outbox.json
  ui.py                    the in-game window (AC app API)
  sim_info.py              AC shared memory, used to pause tracking during replays
stdlib/, stdlib64/         _ctypes.pyd and _socket.pyd for AC's embedded Python 3.3
```

- **No network on the render thread.** `acUpdate` only exchanges queued messages with the worker thread.
- **Server time.** Countdowns and lap timestamps use the server's clock, offset-corrected from every heartbeat. That way the hard stop happens at the same moment in game, on the dashboard and in the server's validation.
- **Missing modules.** AC's embedded Python 3.3 has no `_socket` or `_ctypes`. Both `.pyd` files come unmodified from the official Python 3.3.5 Windows installers (`python-3.3.5.amd64.msi` and `python-3.3.5.msi`, `DLLs/` folder).
- **Unique package name.** The package is called `racekiosk_lib`, not `lib`, because all AC apps share one interpreter and a generic name would collide with other apps.

## Development

Run the tests on a desktop Python:

```bash
python -m unittest discover -s ac-app/tests
```

The code must stay **Python 3.3 compatible**:

- no f-strings, `pathlib`, `enum` or `typing`,
- no third-party packages.

To test on the real 3.3.5 interpreter, run `msiexec /a python-3.3.5.amd64.msi /qn TARGETDIR=C:\py335`. This extracts the installer without installing it. Then run:

```bash
C:\py335\python.exe -E -s -m unittest discover -s ac-app/tests
```

To simulate rigs without Assetto Corsa, use `tools/fake_rig.py`. It runs the app's real client, controller and lap tracker with a simulated car:

```bash
python ac-app/tools/fake_rig.py --rig 1 --url http://localhost:8080 --key <KIOSK_KEY>
python ac-app/tools/fake_rig.py --rig 2 --url http://localhost:8080 --key <KIOSK_KEY> --no-show
```

To develop directly in AC, link the folder into the game:

```bat
mklink /J "<AC install>\apps\python\racekiosk" "<repo>\ac-app\racekiosk"
```

### Troubleshooting

- **The app doesn't appear in the sidebar.** Check `Documents/Assetto Corsa/logs/py_log.txt` and `log.txt`.
- **"Race Kiosk failed to load: …"** One of the bundled `.pyd` files is missing.
- **"Connecting to the kiosk server…" doesn't go away.** Check `backend_url`, the server firewall (port 8080) and `kiosk_key`. A wrong key shows "error 401" in the detail line.
- **Live log.** Press `Home` in game to open the console, where the app logs its start and any errors.
