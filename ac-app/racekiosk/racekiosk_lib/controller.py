"""The app's logic between the kiosk server, the lap tracker and the in-game window.

Runs on AC's main thread: racekiosk.py feeds it client events, car samples and button clicks, and
renders whatever screen() returns. Holds no AC imports so it can be tested on a desktop Python.
"""

import binascii
import os

# Screen kinds (ui.py picks colors and layout by these)
OFFLINE = "OFFLINE"
DISABLED = "DISABLED"
IDLE = "IDLE"
CALLED = "CALLED"
RACING = "RACING"
TIME_UP = "TIME_UP"

INVALID_REASON_TEXT = {
    "OUT_LAP": "out lap",
    "PIT": "pit lane",
    "CUT": "track limits",
    "TOO_SHORT": "too short",
    "AFTER_TIME": "after time limit",
    "STAFF": "removed by staff",
}


def format_lap(ms):
    if not ms or ms <= 0:
        return "-:--.---"
    ms = int(ms)
    return "{}:{:02d}.{:03d}".format(ms // 60000, (ms // 1000) % 60, ms % 1000)


def format_countdown(ms):
    seconds = max(0, int((ms + 999) // 1000))
    return "{}:{:02d}".format(seconds // 60, seconds % 60)


class CarSample(object):
    """One reading of the player's car, taken in acUpdate."""

    def __init__(self, lap_count, last_lap_ms, invalidated, in_pitlane):
        self.lap_count = lap_count
        self.last_lap_ms = last_lap_ms
        self.invalidated = invalidated
        self.in_pitlane = in_pitlane


class ClockSync(object):
    """Estimates the offset between this PC's clock and the kiosk server's clock.

    Countdowns and lap timestamps use the server's clock, so the hard stop happens at the same moment
    on the rig, the dashboard and in the server's lap validation.
    """

    WINDOW = 10

    def __init__(self):
        self._samples = []
        self.offset_ms = 0.0

    def add_sample(self, server_ms, sent_at, received_at):
        round_trip_ms = (received_at - sent_at) * 1000.0
        local_mid_ms = (sent_at + received_at) * 500.0
        self._samples = (self._samples + [(round_trip_ms, server_ms - local_mid_ms)])[-self.WINDOW:]
        # The fastest round trip has the least uncertainty
        self.offset_ms = min(self._samples)[1]

    def server_ms(self, local_seconds):
        return local_seconds * 1000.0 + self.offset_ms


class Screen(object):
    def __init__(self, kind, title, subtitle="", detail="", timer="", timer_level="normal", buttons=None,
                 banner="", detail_level="normal"):
        self.kind = kind
        self.title = title
        self.subtitle = subtitle
        self.detail = detail
        self.detail_level = detail_level
        self.timer = timer
        self.timer_level = timer_level
        # List of (button_id, label); ids: "start", "skip", "end"
        self.buttons = buttons or []
        self.banner = banner

    def key(self):
        return (self.kind, self.title, self.subtitle, self.detail, self.detail_level, self.timer,
                self.timer_level, tuple(self.buttons), self.banner)


class SessionStats(object):
    """Laps of the current session as seen by this app (shown instantly, also while offline)."""

    def __init__(self):
        self.lap_count = 0
        self.best_lap_ms = None
        self.last_lap_ms = None

    def add(self, lap):
        self.lap_count += 1
        self.last_lap_ms = lap.lap_time_ms
        if lap.valid and (self.best_lap_ms is None or lap.lap_time_ms < self.best_lap_ms):
            self.best_lap_ms = lap.lap_time_ms


class KioskController(object):
    # How long the "Time's up / Thanks" summary stays before the next player's screen
    SUMMARY_SECONDS = 8.0
    # How long a lap result ("PB! P3 today") stays visible
    FLASH_SECONDS = 6.0
    # Clicking END once arms it; a second click within this time ends the session
    END_CONFIRM_SECONDS = 3.0
    # Give up waiting for an action's response after this long
    ACTION_TIMEOUT = 6.0
    # Show the offline banner once heartbeats fail for this long
    OFFLINE_AFTER = 3.0

    def __init__(self, rig_id, client, tracker, car_info=None):
        self._rig_id = rig_id
        self._client = client
        self._tracker = tracker
        self._clock = ClockSync()
        self._car_info = car_info or {"track": "", "trackConfig": "", "car": ""}

        self.status = None
        self._connection_error = None
        self._last_ok_at = None
        self._session_id = None
        self._stats = SessionStats()
        self._summary = None
        self._summary_until = 0.0
        self._pending_action = None
        self._pending_since = 0.0
        self._end_armed_until = 0.0
        self._flash = None
        self._flash_until = 0.0
        self._flash_level = "normal"

    # ------------------------------------------------------------------
    # Inputs
    # ------------------------------------------------------------------

    def handle_event(self, event, now):
        kind = event[0]
        if kind == "status":
            _, status, sent_at, received_at = event
            self._clock.add_sample(status["serverTime"], sent_at, received_at)
            self._last_ok_at = now
            self._connection_error = None
            self._apply_status(status, now)
        elif kind == "offline":
            self._connection_error = event[1]
        elif kind == "action_done":
            self._pending_action = None
        elif kind == "action_failed":
            self._pending_action = None
            self._show_flash(event[2], now, "error")
        elif kind == "lap_result":
            self._show_lap_result(event[1], event[2], now)

    def update(self, now, sample):
        """Feeds a car sample (None while AC isn't live, e.g. in a replay)."""
        if self._pending_action is not None and now - self._pending_since > self.ACTION_TIMEOUT:
            self._pending_action = None

        if sample is None:
            return

        laps = self._tracker.update(now, sample.lap_count, sample.last_lap_ms, sample.invalidated, sample.in_pitlane)
        for lap in laps:
            self._attribute(lap)

    def press(self, button, now):
        status = self.status
        if status is None or self._pending_action is not None:
            return

        if button in ("start", "skip") and status.get("called"):
            self._send(button, {"queueEntryId": status["called"]["queueEntryId"]}, now)
        elif button == "end" and status.get("session"):
            if now < self._end_armed_until:
                self._end_armed_until = 0.0
                self._send("end", {"sessionId": status["session"]["id"]}, now)
            else:
                self._end_armed_until = now + self.END_CONFIRM_SECONDS

    # ------------------------------------------------------------------
    # Output
    # ------------------------------------------------------------------

    def screen(self, now):
        status = self.status
        banner = self._banner(now)

        if status is None:
            return Screen(OFFLINE, "Race Kiosk", "Connecting to the kiosk server...",
                          detail=self._connection_error or "", detail_level="error")

        server_now = self._clock.server_ms(now)
        session = status.get("session")
        called = status.get("called")

        if session:
            remaining = session["endsAt"] - server_now
            if remaining <= 0:
                return Screen(TIME_UP, "Time's up, {}!".format(session["driverName"]),
                              "Please drive back to the pits", self._stats_line(session), banner=banner)
            return self._racing_screen(session, remaining, status, now, banner)

        if self._summary is not None and now < self._summary_until:
            return self._summary_screen(self._summary, called, banner)

        if not status.get("enabled", True):
            return Screen(DISABLED, "Rig {} is closed".format(self._rig_id), "Temporarily out of service",
                          banner=banner)

        if called:
            flash = self._flash_text(now)
            if flash:
                detail, detail_level = flash, self._flash_level
            else:
                left = format_countdown(called["timeoutAt"] - server_now)
                detail, detail_level = "Car on track? ESC > Back to pits   |   auto-skip in {}".format(left), "normal"
            return Screen(CALLED, "Get ready, {}!".format(called["driverName"]), "Press START when you are seated",
                          detail, detail_level=detail_level,
                          buttons=self._buttons([("start", "START"), ("skip", "NOT HERE")]), banner=banner)

        waiting = status.get("queueLength", 0)
        detail = "{} waiting in the queue".format(waiting) if waiting else "Nobody is waiting right now"
        return Screen(IDLE, "Rig {} is free".format(self._rig_id), "Register at the kiosk to race!", detail,
                      banner=banner)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _apply_status(self, status, now):
        self.status = status
        session = status.get("session")

        if session and session["id"] != self._session_id:
            # A new driver took over: the lap in progress isn't theirs
            self._session_id = session["id"]
            self._stats = SessionStats()
            self._summary = None
            self._tracker.mark_partial()
        elif not session and self._session_id is not None:
            last = status.get("lastSession")
            if last and last["id"] == self._session_id:
                self._summary = last
                self._summary_until = now + self.SUMMARY_SECONDS
            self._session_id = None

    def _attribute(self, lap):
        session = self.status.get("session") if self.status else None
        if not session or session["id"] != self._session_id:
            return  # nobody is driving

        completed_at = int(self._clock.server_ms(lap.detected_at))
        if completed_at > session["endsAt"]:
            return  # hard stop: nothing counts after the time limit

        self._stats.add(lap)
        self._client.submit_lap({
            "clientLapId": "{}-{}-{}".format(self._rig_id, completed_at, binascii.hexlify(os.urandom(4)).decode()),
            "sessionId": session["id"],
            "lapTimeMs": int(lap.lap_time_ms),
            "valid": lap.valid,
            "invalidReason": lap.invalid_reason,
            "track": self._car_info["track"],
            "trackConfig": self._car_info["trackConfig"],
            "car": self._car_info["car"],
            "completedAt": completed_at,
        })
        if not lap.valid:
            self._show_flash("Lap {} - not counted ({})".format(
                format_lap(lap.lap_time_ms), INVALID_REASON_TEXT.get(lap.invalid_reason, lap.invalid_reason)),
                lap.detected_at, "warn")

    def _send(self, action, payload, now):
        self._pending_action = action
        self._pending_since = now
        self._client.request(action, payload)

    def _show_lap_result(self, lap, result, now):
        if not result.get("valid"):
            return
        parts = ["Lap {}".format(format_lap(lap["lapTimeMs"]))]
        if result.get("rankToday"):
            parts.append("P{} today".format(result["rankToday"]))
        text = "   ".join(parts)
        if result.get("isPersonalBest"):
            self._show_flash("PERSONAL BEST! " + text, now, "good")
        else:
            self._show_flash(text, now, "normal")

    def _show_flash(self, text, now, level):
        self._flash = text
        self._flash_until = now + self.FLASH_SECONDS
        self._flash_level = level

    def _flash_text(self, now):
        return self._flash if self._flash and now < self._flash_until else ""

    def _buttons(self, buttons):
        if self._pending_action is None:
            return buttons
        return [(button_id, "..." if button_id == self._pending_action else label) for button_id, label in buttons]

    def _banner(self, now):
        if self._connection_error and (self._last_ok_at is None or now - self._last_ok_at > self.OFFLINE_AFTER):
            pending = self._client.pending_laps()
            suffix = " ({} laps saved)".format(pending) if pending else " - laps are saved"
            return "Kiosk server unreachable" + suffix
        return ""

    def _stats_line(self, session):
        lap_count = max(session.get("lapCount", 0), self._stats.lap_count)
        best = [ms for ms in (session.get("bestLapMs"), self._stats.best_lap_ms) if ms]
        last = self._stats.last_lap_ms or session.get("lastLapMs")
        return "Lap {}   Last {}   Best {}".format(lap_count, format_lap(last), format_lap(min(best) if best else None))

    def _racing_screen(self, session, remaining, status, now, banner):
        level = "critical" if remaining <= 10000 else "warn" if remaining <= 60000 else "normal"
        flash = self._flash_text(now)
        if flash:
            detail, detail_level = flash, self._flash_level
        elif status.get("nextDriverName"):
            detail, detail_level = "Up next: {}".format(status["nextDriverName"]), "normal"
        else:
            detail, detail_level = "", "normal"

        end_label = "CONFIRM END?" if now < self._end_armed_until else "END SESSION"
        return Screen(RACING, session["driverName"], self._stats_line(session), detail,
                      timer=format_countdown(remaining), timer_level=level, detail_level=detail_level,
                      buttons=self._buttons([("end", end_label)]), banner=banner)

    def _summary_screen(self, summary, called, banner):
        name = summary["driverName"]
        title = "Time's up, {}!".format(name) if summary["endReason"] == "TIME_UP" else "Thanks, {}!".format(name)

        if summary.get("bestLapMs"):
            subtitle = "Best lap {}".format(format_lap(summary["bestLapMs"]))
            if summary.get("rankToday"):
                subtitle += "  -  P{} today".format(summary["rankToday"])
        else:
            subtitle = "No valid lap this time"

        if not called:
            return Screen(TIME_UP, title, subtitle, "Please make room for the next driver", banner=banner)

        # The next player's call is already running, so let them start right away
        return Screen(TIME_UP, title, subtitle, "Next up: {} - get ready!".format(called["driverName"]),
                      buttons=self._buttons([("start", "START"), ("skip", "NOT HERE")]), banner=banner)
