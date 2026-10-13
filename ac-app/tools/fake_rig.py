"""Simulates a rig running the racekiosk app, for testing the kiosk without Assetto Corsa.

Uses the app's own client, controller and lap tracker with a simulated car that completes a lap every
--lap-seconds. Prints whatever the in-game window would show whenever it changes.

    python ac-app/tools/fake_rig.py --rig 1 --url http://localhost:8080 --key <KIOSK_KEY>

A called player is started automatically after --start-after seconds (or never with --no-show, to test
the no-show timeout). Requires Python 3.3+.
"""

import argparse
import os
import random
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "racekiosk"))

from racekiosk_lib import APP_VERSION  # noqa: E402
from racekiosk_lib.controller import CALLED, CarSample, KioskController  # noqa: E402
from racekiosk_lib.kiosk_client import KioskClient  # noqa: E402
from racekiosk_lib.lap_tracker import LapTracker  # noqa: E402
from racekiosk_lib.outbox import Outbox  # noqa: E402


class Settings(object):
    def __init__(self, args):
        self.backend_url = args.url.rstrip("/")
        self.rig_id = args.rig
        self.kiosk_key = args.key
        self.poll_interval = 1.0
        self.request_timeout = 2.0


class SimulatedCar(object):
    def __init__(self, lap_seconds, cut_chance):
        self.lap_seconds = lap_seconds
        self.cut_chance = cut_chance
        self.lap_count = 0
        self.last_lap_ms = 0
        self.invalidated = False
        self._lap_started = time.time()

    def sample(self, now):
        if now - self._lap_started >= self.lap_seconds:
            self.lap_count += 1
            self.last_lap_ms = int(random.uniform(48000, 55000))
            self.invalidated = False
            self._lap_started = now
        elif not self.invalidated and random.random() < self.cut_chance / (self.lap_seconds * 10):
            self.invalidated = True
        return CarSample(self.lap_count, self.last_lap_ms, self.invalidated, False)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--rig", type=int, default=1)
    parser.add_argument("--url", default="http://localhost:8080")
    parser.add_argument("--key", default="")
    parser.add_argument("--lap-seconds", type=float, default=15.0, help="real seconds per simulated lap")
    parser.add_argument("--cut-chance", type=float, default=0.2, help="chance that a lap gets invalidated")
    parser.add_argument("--start-after", type=float, default=3.0, help="seconds until a called player presses START")
    parser.add_argument("--no-show", action="store_true", help="never press START")
    parser.add_argument("--track", default="ks_brands_hatch")
    parser.add_argument("--track-config", default="indy")
    parser.add_argument("--car", default="ks_mercedes_amg_gt3")
    args = parser.parse_args()

    car_info = {"track": args.track, "trackConfig": args.track_config, "car": args.car}
    outbox = Outbox(os.path.join(tempfile.gettempdir(), "fake_rig_{}_outbox.json".format(args.rig)))
    client = KioskClient(Settings(args), outbox, APP_VERSION + "-fake")
    client.set_car_info(args.track, args.track_config, args.car)
    controller = KioskController(args.rig, client, LapTracker(20000), car_info)
    car = SimulatedCar(args.lap_seconds, args.cut_chance)

    client.start()
    print("Fake rig {} -> {} (Ctrl+C to stop)".format(args.rig, args.url))

    last_key = None
    called_since = None
    try:
        while True:
            now = time.time()
            for event in client.poll_events():
                controller.handle_event(event, now)
            controller.update(now, car.sample(now))
            screen = controller.screen(now)

            if screen.kind == CALLED:
                called_since = called_since or now
                if not args.no_show and now - called_since >= args.start_after:
                    controller.press("start", now)
            else:
                called_since = None

            # Print changes, but not every countdown second
            key = (screen.kind, screen.title, screen.subtitle, screen.detail.split("auto-skip")[0], screen.banner)
            if key != last_key:
                last_key = key
                line = "[rig {}] {:8} {}".format(args.rig, screen.kind, screen.title)
                for part in (screen.timer, screen.subtitle, screen.detail, screen.banner):
                    if part:
                        line += " | " + part
                print(time.strftime("%H:%M:%S ") + line)
            time.sleep(0.1)
    except KeyboardInterrupt:
        pass
    finally:
        client.stop()


if __name__ == "__main__":
    main()
