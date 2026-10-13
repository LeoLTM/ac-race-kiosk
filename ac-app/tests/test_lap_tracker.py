import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "racekiosk"))

from racekiosk_lib.lap_tracker import CUT, OUT_LAP, PIT, TOO_SHORT, LapTracker  # noqa: E402


class Car(object):
    """Simulates the values AC reports, sampled every 0.1s."""

    def __init__(self, tracker):
        self.tracker = tracker
        self.now = 1000.0
        self.lap_count = 0
        self.last_lap_ms = 0
        self.invalidated = False
        self.in_pitlane = False
        self.laps = []

    def drive(self, seconds):
        for _ in range(int(round(seconds * 10))):
            self.sample()

    def sample(self):
        self.now += 0.1
        self.laps.extend(self.tracker.update(self.now, self.lap_count, self.last_lap_ms, self.invalidated,
                                             self.in_pitlane))

    def cross_line(self, lap_time_ms, last_lap_delay_frames=0):
        """Completes a lap; AC may update LastLap a few frames after LapCount."""
        self.lap_count += 1
        if last_lap_delay_frames == 0:
            self.last_lap_ms = lap_time_ms
            self.sample()
        else:
            for _ in range(last_lap_delay_frames):
                self.sample()
            self.last_lap_ms = lap_time_ms
            self.sample()
        self.invalidated = False


class LapTrackerTest(unittest.TestCase):
    def setUp(self):
        self.car = Car(LapTracker(min_lap_ms=20000))
        self.car.sample()

    def test_first_lap_seen_is_an_out_lap(self):
        self.car.drive(30)
        self.car.cross_line(51000)

        self.assertEqual(len(self.car.laps), 1)
        self.assertEqual(self.car.laps[0].invalid_reason, OUT_LAP)

    def test_full_lap_is_valid(self):
        self.car.cross_line(60000)
        self.car.drive(50)
        self.car.cross_line(50123)

        lap = self.car.laps[-1]
        self.assertTrue(lap.valid)
        self.assertEqual(lap.lap_time_ms, 50123)
        self.assertEqual(lap.number, 2)

    def test_cut_invalidates_the_lap(self):
        self.car.cross_line(60000)
        self.car.drive(20)
        self.car.invalidated = True
        self.car.drive(30)
        self.car.cross_line(49000)

        self.assertEqual(self.car.laps[-1].invalid_reason, CUT)

    def test_invalid_flag_lingering_after_the_line_does_not_spoil_the_next_lap(self):
        self.car.cross_line(60000)
        self.car.drive(48)
        self.car.invalidated = True  # cut in the last corner
        self.car.drive(1)
        self.car.lap_count += 1
        self.car.last_lap_ms = 49000
        self.car.drive(0.5)  # flag still set for half a second into the new lap
        self.car.invalidated = False
        self.car.drive(50)
        self.car.cross_line(50000)

        self.assertEqual([lap.invalid_reason for lap in self.car.laps[-2:]], [CUT, None])

    def test_pit_lane_invalidates_the_lap(self):
        self.car.cross_line(60000)
        self.car.in_pitlane = True
        self.car.drive(5)
        self.car.in_pitlane = False
        self.car.drive(40)
        self.car.cross_line(70000)

        self.assertEqual(self.car.laps[-1].invalid_reason, PIT)

    def test_waits_for_last_lap_to_update(self):
        self.car.cross_line(60000)
        self.car.drive(50)
        self.car.cross_line(50500, last_lap_delay_frames=3)

        self.assertEqual(self.car.laps[-1].lap_time_ms, 50500)
        self.assertEqual(len(self.car.laps), 2)

    def test_identical_lap_time_is_reported_after_timeout(self):
        self.car.cross_line(50000)
        self.car.drive(50)
        self.car.lap_count += 1  # LastLap stays 50000
        self.car.drive(1)
        self.assertEqual(len(self.car.laps), 1)

        self.car.drive(1.5)
        self.assertEqual(len(self.car.laps), 2)
        self.assertEqual(self.car.laps[-1].lap_time_ms, 50000)

    def test_session_restart_resets_without_reporting(self):
        self.car.cross_line(60000)
        self.car.cross_line(55000)
        count = len(self.car.laps)

        self.car.lap_count = 0
        self.car.last_lap_ms = 0
        self.car.drive(30)
        self.assertEqual(len(self.car.laps), count)

        self.car.cross_line(52000)
        self.assertEqual(self.car.laps[-1].invalid_reason, OUT_LAP)

    def test_too_short_lap(self):
        self.car.cross_line(60000)
        self.car.drive(10)
        self.car.cross_line(12000)

        self.assertEqual(self.car.laps[-1].invalid_reason, TOO_SHORT)

    def test_mark_partial_turns_the_running_lap_into_an_out_lap(self):
        self.car.cross_line(60000)
        self.car.drive(20)
        self.car.tracker.mark_partial()
        self.car.drive(30)
        self.car.cross_line(50000)
        self.car.drive(50)
        self.car.cross_line(49000)

        self.assertEqual([lap.invalid_reason for lap in self.car.laps[-2:]], [OUT_LAP, None])


if __name__ == "__main__":
    unittest.main()
