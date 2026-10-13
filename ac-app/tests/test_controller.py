import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "racekiosk"))

from racekiosk_lib import controller as c  # noqa: E402
from racekiosk_lib.lap_tracker import LapTracker  # noqa: E402

CAR_INFO = {"track": "ks_brands_hatch", "trackConfig": "indy", "car": "ks_mercedes_amg_gt3"}

# The server's clock runs 5 minutes ahead of the rig's
SERVER_OFFSET_MS = 300000


class FakeClient(object):
    def __init__(self):
        self.requests = []
        self.laps = []

    def request(self, action, payload):
        self.requests.append((action, payload))

    def submit_lap(self, lap):
        self.laps.append(lap)

    def pending_laps(self):
        return len(self.laps)


def rig_status(now, **overrides):
    status = {
        "id": 1,
        "enabled": True,
        "online": True,
        "state": "FREE",
        "session": None,
        "called": None,
        "lastSession": None,
        "queueLength": 0,
        "nextDriverName": None,
        "serverTime": int(now * 1000 + SERVER_OFFSET_MS),
    }
    status.update(overrides)
    return status


def session(now, name="Alice", minutes_left=10, session_id="s1"):
    server_now = now * 1000 + SERVER_OFFSET_MS
    return {
        "id": session_id,
        "driverId": "d1",
        "driverName": name,
        "startedAt": int(server_now),
        "endsAt": int(server_now + minutes_left * 60000),
        "lapCount": 0,
        "validLapCount": 0,
        "bestLapMs": None,
        "lastLapMs": None,
    }


def call(now, name="Bob", entry_id="q2"):
    server_now = now * 1000 + SERVER_OFFSET_MS
    return {"queueEntryId": entry_id, "driverName": name, "calledAt": int(server_now),
            "timeoutAt": int(server_now + 120000)}


class ControllerTest(unittest.TestCase):
    def setUp(self):
        self.now = 1000.0
        self.client = FakeClient()
        self.controller = c.KioskController(1, self.client, LapTracker(20000), CAR_INFO)
        self.lap_count = 0
        self.last_lap = 0

    def receive(self, status):
        self.controller.handle_event(("status", status, self.now - 0.01, self.now), self.now)

    def tick(self, seconds=0.1):
        for _ in range(int(round(seconds * 10))):
            self.now += 0.1
            sample = c.CarSample(self.lap_count, self.last_lap, False, False)
            self.controller.update(self.now, sample)

    def complete_lap(self, lap_ms):
        self.lap_count += 1
        self.last_lap = lap_ms
        self.tick()

    def screen(self):
        return self.controller.screen(self.now)

    def test_connecting_screen_before_first_status(self):
        screen = self.screen()

        self.assertEqual(screen.kind, c.OFFLINE)
        self.assertIn("Connecting", screen.subtitle)

    def test_called_player_gets_start_and_skip(self):
        self.receive(rig_status(self.now, state="CALLING", called=call(self.now)))

        screen = self.screen()
        self.assertEqual(screen.kind, c.CALLED)
        self.assertEqual(screen.title, "Get ready, Bob!")
        self.assertEqual([b[0] for b in screen.buttons], ["start", "skip"])
        self.assertIn("auto-skip in 2:00", screen.detail)

    def test_start_sends_the_called_entry_and_waits_for_the_answer(self):
        self.receive(rig_status(self.now, state="CALLING", called=call(self.now)))

        self.controller.press("start", self.now)
        self.controller.press("start", self.now)  # double click

        self.assertEqual(self.client.requests, [("start", {"queueEntryId": "q2"})])
        self.assertEqual(self.screen().buttons[0], ("start", "..."))

        self.controller.handle_event(("action_done", "start"), self.now)
        self.assertEqual(self.screen().buttons[0], ("start", "START"))

    def test_failed_action_shows_the_error(self):
        self.receive(rig_status(self.now, state="CALLING", called=call(self.now)))
        self.controller.press("skip", self.now)

        self.controller.handle_event(("action_failed", "skip", "Not called anymore"), self.now)

        self.assertEqual(self.screen().detail, "Not called anymore")
        self.assertEqual(self.screen().detail_level, "error")

    def test_racing_screen_counts_down_in_server_time(self):
        self.receive(rig_status(self.now, state="RACING", session=session(self.now, minutes_left=5)))
        self.tick(30)

        screen = self.screen()
        self.assertEqual(screen.kind, c.RACING)
        self.assertEqual(screen.title, "Alice")
        self.assertEqual(screen.timer, "4:30")
        self.assertEqual(screen.timer_level, "normal")

        self.tick(4 * 60 + 25)
        self.assertEqual(self.screen().timer_level, "critical")

    def test_laps_are_attributed_to_the_session_in_server_time(self):
        self.receive(rig_status(self.now, state="RACING", session=session(self.now)))
        self.tick(30)
        self.complete_lap(65000)  # out lap
        self.tick(50)
        self.complete_lap(50123)

        self.assertEqual([(lap["lapTimeMs"], lap["valid"], lap["invalidReason"]) for lap in self.client.laps],
                         [(65000, False, "OUT_LAP"), (50123, True, None)])
        lap = self.client.laps[1]
        self.assertEqual(lap["sessionId"], "s1")
        self.assertEqual(lap["track"], "ks_brands_hatch")
        self.assertAlmostEqual(lap["completedAt"], self.now * 1000 + SERVER_OFFSET_MS, delta=150)
        self.assertNotEqual(lap["clientLapId"], self.client.laps[0]["clientLapId"])
        self.assertEqual(self.screen().subtitle, "Lap 2   Last 0:50.123   Best 0:50.123")

    def test_no_laps_without_a_session(self):
        self.receive(rig_status(self.now))
        self.tick(1)
        self.complete_lap(60000)
        self.tick(50)
        self.complete_lap(50000)

        self.assertEqual(self.client.laps, [])

    def test_hard_stop_drops_laps_after_the_time_limit(self):
        self.receive(rig_status(self.now, state="RACING", session=session(self.now, minutes_left=1)))
        self.tick(1)
        self.complete_lap(60000)
        self.tick(60)

        self.assertEqual(self.screen().kind, c.TIME_UP)
        self.complete_lap(50000)
        self.assertEqual([lap["lapTimeMs"] for lap in self.client.laps], [60000])

    def test_summary_after_the_session_then_next_player(self):
        self.receive(rig_status(self.now, state="RACING", session=session(self.now)))
        self.tick(1)
        last = {"id": "s1", "driverName": "Alice", "endedAt": 0, "endReason": "TIME_UP", "lapCount": 6,
                "bestLapMs": 49500, "rankToday": 3}
        self.receive(rig_status(self.now, state="CALLING", called=call(self.now), lastSession=last))

        screen = self.screen()
        self.assertEqual(screen.kind, c.TIME_UP)
        self.assertEqual(screen.title, "Time's up, Alice!")
        self.assertEqual(screen.subtitle, "Best lap 0:49.500  -  P3 today")
        self.assertEqual(screen.detail, "Next up: Bob - get ready!")
        self.assertEqual([b[0] for b in screen.buttons], ["start", "skip"])

        self.tick(9)
        self.assertEqual(self.screen().kind, c.CALLED)

    def test_next_player_can_start_during_the_summary(self):
        self.receive(rig_status(self.now, state="RACING", session=session(self.now)))
        last = {"id": "s1", "driverName": "Alice", "endedAt": 0, "endReason": "DRIVER", "lapCount": 0,
                "bestLapMs": None, "rankToday": None}
        self.receive(rig_status(self.now, state="CALLING", called=call(self.now), lastSession=last))

        self.assertEqual(self.screen().title, "Thanks, Alice!")
        self.assertEqual(self.screen().subtitle, "No valid lap this time")
        self.controller.press("start", self.now)

        self.assertEqual(self.client.requests, [("start", {"queueEntryId": "q2"})])

    def test_a_new_session_does_not_inherit_the_lap_in_progress(self):
        self.receive(rig_status(self.now, state="RACING", session=session(self.now)))
        self.tick(1)
        self.complete_lap(60000)
        self.tick(20)
        self.receive(rig_status(self.now, state="RACING", session=session(self.now, "Bob", session_id="s2")))
        self.tick(30)
        self.complete_lap(51000)

        self.assertEqual(self.client.laps[-1]["sessionId"], "s2")
        self.assertEqual(self.client.laps[-1]["invalidReason"], "OUT_LAP")

    def test_end_needs_a_second_click(self):
        self.receive(rig_status(self.now, state="RACING", session=session(self.now)))

        self.controller.press("end", self.now)
        self.assertEqual(self.client.requests, [])
        self.assertEqual(self.screen().buttons, [("end", "CONFIRM END?")])

        self.controller.press("end", self.now + 1)
        self.assertEqual(self.client.requests, [("end", {"sessionId": "s1"})])

    def test_end_confirmation_expires(self):
        self.receive(rig_status(self.now, state="RACING", session=session(self.now)))

        self.controller.press("end", self.now)
        self.controller.press("end", self.now + 5)

        self.assertEqual(self.client.requests, [])

    def test_offline_banner_after_failed_heartbeats(self):
        self.receive(rig_status(self.now, state="RACING", session=session(self.now)))
        self.controller.handle_event(("offline", "unreachable"), self.now)
        self.assertEqual(self.screen().banner, "")

        self.tick(4)
        self.assertIn("Kiosk server unreachable", self.screen().banner)
        self.assertEqual(self.screen().kind, c.RACING)

    def test_lap_result_flash(self):
        self.receive(rig_status(self.now, state="RACING", session=session(self.now)))
        lap = {"lapTimeMs": 49876}

        self.controller.handle_event(("lap_result", lap, {"valid": True, "isPersonalBest": True, "rankToday": 2}),
                                     self.now)

        self.assertEqual(self.screen().detail, "PERSONAL BEST! Lap 0:49.876   P2 today")
        self.assertEqual(self.screen().detail_level, "good")

    def test_disabled_rig(self):
        self.receive(rig_status(self.now, enabled=False))

        self.assertEqual(self.screen().kind, c.DISABLED)


class ClockSyncTest(unittest.TestCase):
    def test_uses_the_fastest_round_trip(self):
        clock = c.ClockSync()
        clock.add_sample(server_ms=10500, sent_at=10.0, received_at=11.0)  # slow: offset estimate 0
        clock.add_sample(server_ms=20100, sent_at=20.0, received_at=20.02)  # fast: offset 90

        self.assertAlmostEqual(clock.offset_ms, 90, delta=0.01)
        self.assertAlmostEqual(clock.server_ms(30.0), 30090, delta=0.01)


class FormatTest(unittest.TestCase):
    def test_format_lap(self):
        self.assertEqual(c.format_lap(83456), "1:23.456")
        self.assertEqual(c.format_lap(None), "-:--.---")

    def test_format_countdown_rounds_up(self):
        self.assertEqual(c.format_countdown(59001), "1:00")
        self.assertEqual(c.format_countdown(-5), "0:00")


if __name__ == "__main__":
    unittest.main()
