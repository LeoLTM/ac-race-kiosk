"""Runs racekiosk.py (acMain / acUpdate / clicks / acShutdown) against a fake AC and a stub kiosk server."""

import importlib
import os
import shutil
import sys
import tempfile
import time
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
APP_SOURCE = os.path.join(TESTS_DIR, "..", "racekiosk")
sys.path.insert(0, TESTS_DIR)

from fake_ac import FakeAc, FakeAcsys  # noqa: E402
from test_kiosk_client import StubServer, ok, wait_for  # noqa: E402


class AppTest(unittest.TestCase):
    def setUp(self):
        # Run a copy of the app so settings.ini / outbox.json land in a temp folder
        self.dir = tempfile.mkdtemp()
        self.app_dir = os.path.join(self.dir, "racekiosk")
        shutil.copytree(APP_SOURCE, self.app_dir, ignore=shutil.ignore_patterns("settings.ini", "outbox.json*"))

        self.server = StubServer()
        with open(os.path.join(self.app_dir, "settings.ini"), "w") as f:
            f.write("[kiosk]\nbackend_url = http://127.0.0.1:{}\nrig_id = 2\npoll_interval = 0.1\n".format(
                self.server.port))

        self.ac = FakeAc()
        sys.modules["ac"] = self.ac
        sys.modules["acsys"] = FakeAcsys
        sys.path.insert(0, self.app_dir)
        # Import the copy fresh, but keep modules other tests imported alive: Python 3.3 clears the globals
        # of garbage-collected modules, which would break classes those tests still hold
        self.saved_modules = {}
        for name in list(sys.modules):
            if name == "racekiosk" or name.startswith("racekiosk_lib"):
                self.saved_modules[name] = sys.modules.pop(name)
        self.app = importlib.import_module("racekiosk")
        self.app.sim_info = None  # no shared memory outside AC

    def tearDown(self):
        self.app.acShutdown()
        self.server.stop()
        sys.path.remove(self.app_dir)
        sys.modules.update(self.saved_modules)
        shutil.rmtree(self.dir, ignore_errors=True)

    def run_frames(self, seconds):
        deadline = time.time() + seconds
        while time.time() < deadline:
            self.app.acUpdate(0.1)
            time.sleep(0.02)

    def update_until(self, text):
        return wait_for(lambda: self.app.acUpdate(0.2) or any(text in t for t in self.ac.visible_texts()))

    def status(self, **overrides):
        now = int(time.time() * 1000)
        status = {"id": 2, "enabled": True, "online": True, "state": "FREE", "session": None, "called": None,
                  "lastSession": None, "queueLength": 0, "nextDriverName": None, "serverTime": now}
        status.update(overrides)
        return ok(status)

    def test_full_handover(self):
        self.assertEqual(self.app.acMain(1), "racekiosk")
        self.assertIsNone(self.app.IMPORT_ERROR)
        self.assertTrue(any("Connecting" in t for t in self.ac.visible_texts()))

        # Rig is free
        self.server.responses["/rigs/2/heartbeat"] = self.status()
        self.assertTrue(self.update_until("Rig 2 is free"))
        self.assertEqual(self.server.requests[0][1]["track"], "ks_brands_hatch")

        # Bob gets called and presses START
        now = int(time.time() * 1000)
        called = {"queueEntryId": "q1", "driverName": "Bob", "calledAt": now, "timeoutAt": now + 120000}
        self.server.responses["/rigs/2/heartbeat"] = self.status(state="CALLING", called=called)
        self.assertTrue(self.update_until("Get ready, Bob!"))

        session = {"id": "s1", "driverId": "d1", "driverName": "Bob", "startedAt": now, "endsAt": now + 600000,
                   "lapCount": 0, "validLapCount": 0, "bestLapMs": None, "lastLapMs": None}
        racing = self.status(state="RACING", session=session)
        self.server.responses["/rigs/2/session/start"] = racing
        self.server.responses["/rigs/2/heartbeat"] = racing
        self.ac.click("START")
        self.assertTrue(self.update_until("END SESSION"))
        self.assertIn(("/rigs/2/session/start", {"queueEntryId": "q1"}, None), self.server.requests)

        # Out lap, then a flying lap gets reported
        self.server.responses["/rigs/2/laps"] = ok({"valid": True, "isPersonalBest": True, "rankToday": 1})
        self.ac.car.update(LapCount=1, LastLap=70000)
        self.run_frames(0.3)
        self.ac.car.update(LapCount=2, LastLap=50321)
        self.assertTrue(self.update_until("PERSONAL BEST! Lap 0:50.321   P1 today"))
        laps = [body for path, body, _ in self.server.requests if path == "/rigs/2/laps"]
        self.assertEqual([(lap["lapTimeMs"], lap["invalidReason"]) for lap in laps],
                         [(70000, "OUT_LAP"), (50321, None)])
        self.assertEqual(laps[1]["sessionId"], "s1")

        # Every ac.* call went to a real AC function (FakeAc raises otherwise) and the window was drawn
        self.assertTrue(self.ac.render_callbacks)
        self.ac.render_callbacks[0](0.016)


if __name__ == "__main__":
    unittest.main()
