"""HTTP client for the kiosk server, running on a background thread.

AC calls acUpdate on its render thread, so nothing there may wait for the network. The main thread hands
actions and laps to this worker and picks up the results with poll_events(). AC's Python 3.3 has no
_socket module built in; racekiosk.py puts the bundled _socket.pyd on sys.path before this is imported.

Events (tuples) delivered to the main thread:
    ("status", rig_status, sent_at, received_at)  fresh rig status from a heartbeat or an action
    ("offline", message)                          the server could not be reached or refused the request
    ("action_done", action)
    ("action_failed", action, message)
    ("lap_result", lap, result)                   the server stored a lap (result has rank / personal best)
    ("lap_rejected", lap, message)                the server refused a lap for good; it was dropped
"""

import codecs
import http.client
import json
import queue
import threading
import time
from urllib.parse import urlparse


def _ascii_idna_codec(name):
    if name != "idna":
        return None
    ascii_codec = codecs.lookup("ascii")
    return codecs.CodecInfo(ascii_codec.encode, ascii_codec.decode, name="idna")


# AC's Python ships encodings/idna.py but not the unicodedata module it needs, so Python 3.3's socket module
# can't encode any hostname, not even "127.0.0.1" ("unknown encoding: idna"). ASCII hostnames and IP
# addresses are already in IDNA form, so plain ASCII encoding is enough.
try:
    codecs.lookup("idna")
except LookupError:
    codecs.register(_ascii_idna_codec)

ACTION_PATHS = {
    "start": "/session/start",
    "end": "/session/end",
    "skip": "/call/skip",
}

# Wait this long before re-sending a lap after the server failed
LAP_RETRY_SECONDS = 5.0


class KioskClient(object):
    def __init__(self, settings, outbox, app_version):
        url = urlparse(settings.backend_url)
        self._host = url.hostname or "localhost"
        self._port = url.port or 80
        self._base_path = url.path.rstrip("/")
        self._rig_path = "/rigs/{}".format(settings.rig_id)
        self._kiosk_key = settings.kiosk_key
        self._timeout = settings.request_timeout
        self._poll_interval = settings.poll_interval
        self._outbox = outbox
        self._app_version = app_version

        self._events = queue.Queue()
        self._actions = queue.Queue()
        self._stop = threading.Event()
        self._thread = None
        self._car_info_lock = threading.Lock()
        self._car_info = {}
        self._online = False
        self._next_lap_attempt = 0.0

    # ---- Called from AC's main thread ----

    def start(self):
        self._thread = threading.Thread(target=self._run, name="racekiosk-client")
        self._thread.daemon = True
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread is not None:
            self._thread.join(1.0)

    def set_car_info(self, track, track_config, car):
        with self._car_info_lock:
            self._car_info = {"track": track, "trackConfig": track_config, "car": car}

    def request(self, action, payload):
        self._actions.put((action, payload))

    def submit_lap(self, lap):
        self._outbox.add(lap)

    def pending_laps(self):
        return len(self._outbox)

    def poll_events(self):
        events = []
        while True:
            try:
                events.append(self._events.get_nowait())
            except queue.Empty:
                return events

    # ---- Worker thread ----

    def _run(self):
        next_heartbeat = 0.0
        while not self._stop.is_set():
            try:
                action = self._actions.get(timeout=0.05)
            except queue.Empty:
                action = None

            if action is not None:
                self._send_action(action[0], action[1])
                continue

            now = time.time()
            if now >= next_heartbeat:
                next_heartbeat = now + self._poll_interval
                self._send_heartbeat()
            elif self._online and now >= self._next_lap_attempt:
                self._send_next_lap()

    def _send_heartbeat(self):
        with self._car_info_lock:
            body = dict(self._car_info)
        body["appVersion"] = self._app_version

        sent_at = time.time()
        try:
            code, response = self._post(self._rig_path + "/heartbeat", body)
        except Exception as e:
            self._online = False
            self._events.put(("offline", "Kiosk server unreachable ({})".format(e)))
            return

        if code == 200 and response.get("success"):
            self._online = True
            self._events.put(("status", response["responseObject"], sent_at, time.time()))
        else:
            self._online = False
            self._events.put(("offline", "Kiosk server error {}: {}".format(code, response.get("message", ""))))

    def _send_action(self, action, payload):
        sent_at = time.time()
        try:
            code, response = self._post(self._rig_path + ACTION_PATHS[action], payload)
        except Exception:
            self._events.put(("action_failed", action, "Kiosk server unreachable"))
            return

        if code == 200 and response.get("success"):
            self._events.put(("status", response["responseObject"], sent_at, time.time()))
            self._events.put(("action_done", action))
        else:
            self._events.put(("action_failed", action, response.get("message") or "Error {}".format(code)))

    def _send_next_lap(self):
        lap = self._outbox.peek()
        if lap is None:
            return

        try:
            code, response = self._post(self._rig_path + "/laps", lap)
        except Exception:
            self._next_lap_attempt = time.time() + LAP_RETRY_SECONDS
            return

        if code == 200 and response.get("success"):
            self._outbox.remove(lap["clientLapId"])
            self._events.put(("lap_result", lap, response["responseObject"]))
        elif 400 <= code < 500 and code not in (401, 408, 429):
            # Validation error or unknown session: retrying won't help
            self._outbox.remove(lap["clientLapId"])
            self._events.put(("lap_rejected", lap, response.get("message", "")))
        else:
            self._next_lap_attempt = time.time() + LAP_RETRY_SECONDS

    def _post(self, path, body):
        connection = http.client.HTTPConnection(self._host, self._port, timeout=self._timeout)
        try:
            headers = {"Content-Type": "application/json"}
            if self._kiosk_key:
                headers["X-Kiosk-Key"] = self._kiosk_key
            connection.request("POST", self._base_path + path, json.dumps(body).encode("utf-8"), headers)
            response = connection.getresponse()
            raw = response.read()
            try:
                payload = json.loads(raw.decode("utf-8")) if raw else {}
            except ValueError:
                payload = {}
            return response.status, payload if isinstance(payload, dict) else {}
        finally:
            connection.close()
