"""
Race Kiosk - in-game app for the acc-race-kiosk system
======================================================
Runs inside Assetto Corsa on every rig. It polls the kiosk server for who should drive this rig, shows
the handover screens ("Get ready, Max!" with START / NOT HERE), counts the session down and reports every
completed lap. AC keeps running all day; drivers are swapped in this app instead of restarting the game.

Install: copy this folder to <AC>/apps/python/racekiosk/, set up settings.ini and enable
"Race Kiosk" once in the in-game app sidebar. See ac-app/README.md.
"""

import os
import platform
import sys
import time

import ac
import acsys

APP_NAME = "racekiosk"
WINDOW_TITLE = "Race Kiosk"
APP_DIR = os.path.dirname(os.path.abspath(__file__))

# AC's embedded Python has no _socket / _ctypes: load the bundled ones for this architecture
sys.path.insert(0, os.path.join(APP_DIR, "stdlib64" if platform.architecture()[0] == "64bit" else "stdlib"))
sys.path.insert(0, APP_DIR)
os.environ["PATH"] = os.environ["PATH"] + ";."

IMPORT_ERROR = None
try:
    from racekiosk_lib import APP_VERSION
    from racekiosk_lib.config import load_settings
    from racekiosk_lib.controller import CarSample, KioskController
    from racekiosk_lib.kiosk_client import KioskClient
    from racekiosk_lib.lap_tracker import LapTracker
    from racekiosk_lib.outbox import Outbox
    from racekiosk_lib.ui import KioskWindow
except Exception as e:
    IMPORT_ERROR = e

# Shared memory is optional: only used to pause lap tracking while a replay is playing
sim_info = None
try:
    from racekiosk_lib.sim_info import AC_LIVE, info as sim_info
except Exception:
    pass

UPDATE_INTERVAL = 0.1

client = None
controller = None
window = None
update_timer = 0.0
last_error = None


def log(message):
    ac.log("{}: {}".format(APP_NAME, message))
    ac.console("{}: {}".format(APP_NAME, message))


def read_car_sample():
    if sim_info is not None and sim_info.graphics.status != AC_LIVE:
        return None
    return CarSample(
        lap_count=ac.getCarState(0, acsys.CS.LapCount),
        last_lap_ms=ac.getCarState(0, acsys.CS.LastLap),
        invalidated=bool(ac.getCarState(0, acsys.CS.LapInvalidated)),
        in_pitlane=bool(ac.isCarInPitline(0)),
    )


def on_button(button_id):
    if controller is not None:
        controller.press(button_id, time.time())
        window.render(controller.screen(time.time()))


def acMain(ac_version):
    global client, controller, window

    if IMPORT_ERROR is not None:
        log("failed to load: {}".format(IMPORT_ERROR))
        error_window = ac.newApp(WINDOW_TITLE)
        ac.setSize(error_window, 500, 80)
        label = ac.addLabel(error_window, "Race Kiosk failed to load:\n{}".format(IMPORT_ERROR))
        ac.setPosition(label, 10, 30)
        return APP_NAME

    settings = load_settings(APP_DIR)
    car_info = {
        "track": ac.getTrackName(0),
        "trackConfig": ac.getTrackConfiguration(0),
        "car": ac.getCarName(0),
    }

    client = KioskClient(settings, Outbox(os.path.join(APP_DIR, "outbox.json")), APP_VERSION)
    client.set_car_info(car_info["track"], car_info["trackConfig"], car_info["car"])
    controller = KioskController(settings.rig_id, client, LapTracker(settings.min_lap_ms), car_info)
    window = KioskWindow(ac, WINDOW_TITLE, settings.ui_scale, settings.ui_opacity, on_button)
    window.render(controller.screen(time.time()))
    client.start()

    log("v{} started for rig {} -> {} ({} / {})".format(
        APP_VERSION, settings.rig_id, settings.backend_url, car_info["track"], car_info["car"]))
    return APP_NAME


def acUpdate(delta_t):
    global update_timer, last_error

    if controller is None:
        return

    update_timer += delta_t
    if update_timer < UPDATE_INTERVAL:
        return
    update_timer = 0.0

    try:
        now = time.time()
        for event in client.poll_events():
            controller.handle_event(event, now)
        controller.update(now, read_car_sample())
        window.render(controller.screen(now))
    except Exception as e:
        # Log each distinct error once instead of every frame
        if str(e) != last_error:
            last_error = str(e)
            log("update failed: {}".format(e))


def acShutdown():
    if client is not None:
        client.stop()
