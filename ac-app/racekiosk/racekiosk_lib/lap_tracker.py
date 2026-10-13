"""Turns per-frame car state into completed laps.

Fed about 10 times per second from acUpdate with values from the AC API (LapCount, LastLap,
LapInvalidated, pit lane). It knows nothing about drivers or sessions - the controller decides which
completed laps belong to whom.
"""

# Why a completed lap doesn't count
OUT_LAP = "OUT_LAP"
PIT = "PIT"
CUT = "CUT"
TOO_SHORT = "TOO_SHORT"


class CompletedLap(object):
    def __init__(self, number, lap_time_ms, invalid_reason, detected_at):
        self.number = number
        self.lap_time_ms = lap_time_ms
        self.invalid_reason = invalid_reason
        self.valid = invalid_reason is None
        self.detected_at = detected_at

    def __repr__(self):
        return "CompletedLap({}, {}ms, {})".format(self.number, self.lap_time_ms, self.invalid_reason or "valid")


class LapTracker(object):
    # LastLap may still show the previous lap for a moment after LapCount increments; if it never
    # changes (two identical lap times) it's used anyway after this long
    LAST_LAP_TIMEOUT = 2.0

    # LapInvalidated can still be set from the previous lap right after crossing the line
    INVALID_GRACE = 1.0

    def __init__(self, min_lap_ms):
        self._min_lap_ms = min_lap_ms
        self._lap_count = None
        self._prev_last_lap_ms = 0
        self._pending = None
        self._begin_lap(0.0, partial=True)

    def mark_partial(self):
        """The lap in progress didn't fully belong to the current driver (a new session began mid-lap)."""
        self._partial = True

    def update(self, now, lap_count, last_lap_ms, invalidated, in_pitlane):
        """Feeds one sample; returns the laps completed since the previous call."""
        completed = []

        if self._lap_count is None or lap_count < self._lap_count:
            # First sample, or the server restarted the session: count from here, the current lap is unknown
            self._lap_count = lap_count
            self._pending = None
            self._begin_lap(now, partial=True)
        elif lap_count > self._lap_count:
            if self._pending is not None:
                completed.append(self._finish(self._pending, self._prev_last_lap_ms))
            self._pending = {
                "number": lap_count,
                "detected_at": now,
                "last_lap_before": self._prev_last_lap_ms,
                "cut": self._cut,
                "pit": self._pit,
                # Skipped laps (e.g. samples paused during a replay) can't be trusted either
                "partial": self._partial or lap_count - self._lap_count > 1,
            }
            self._lap_count = lap_count
            self._begin_lap(now, partial=False)

        pending = self._pending
        if pending is not None and (
            last_lap_ms != pending["last_lap_before"] or now - pending["detected_at"] >= self.LAST_LAP_TIMEOUT
        ):
            completed.append(self._finish(pending, last_lap_ms))
            self._pending = None

        # This sample belongs to the lap in progress
        if in_pitlane:
            self._pit = True
        if invalidated and now - self._lap_started_at >= self.INVALID_GRACE:
            self._cut = True
        self._prev_last_lap_ms = last_lap_ms

        return [lap for lap in completed if lap is not None]

    def _begin_lap(self, now, partial):
        self._lap_started_at = now
        self._partial = partial
        self._cut = False
        self._pit = False

    def _finish(self, pending, lap_time_ms):
        if lap_time_ms <= 0:
            return None

        if pending["partial"]:
            reason = OUT_LAP
        elif pending["pit"]:
            reason = PIT
        elif pending["cut"]:
            reason = CUT
        elif lap_time_ms < self._min_lap_ms:
            reason = TOO_SHORT
        else:
            reason = None

        return CompletedLap(pending["number"], lap_time_ms, reason, pending["detected_at"])
