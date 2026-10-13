import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "racekiosk"))

from racekiosk_lib.kiosk_client import KioskClient, _ascii_idna_codec  # noqa: E402
from racekiosk_lib.outbox import Outbox  # noqa: E402


class StubServer(object):
    """A tiny kiosk server: records requests and answers with canned (status, body) per path."""

    def __init__(self):
        self.requests = []
        self.responses = {}
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length).decode("utf-8"))
                stub.requests.append((self.path, body, self.headers.get("X-Kiosk-Key")))
                status, payload = stub.responses.get(self.path, (404, {"success": False, "message": "Not found"}))
                raw = json.dumps(payload).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()

    def paths(self):
        return [request[0] for request in self.requests]


class Settings(object):
    def __init__(self, port):
        self.backend_url = "http://127.0.0.1:{}".format(port)
        self.rig_id = 2
        self.kiosk_key = "secret"
        self.poll_interval = 0.2
        self.request_timeout = 1.0


def ok(payload):
    return 200, {"success": True, "message": "ok", "responseObject": payload, "statusCode": 200}


def wait_for(predicate, timeout=3.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.02)
    return False


def lap(lap_id):
    return {"clientLapId": lap_id, "sessionId": "s1", "lapTimeMs": 50000, "valid": True}


class KioskClientTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.outbox = Outbox(os.path.join(self.dir, "outbox.json"))
        self.server = StubServer()
        self.server.responses["/rigs/2/heartbeat"] = ok({"serverTime": 123, "state": "FREE"})
        self.client = KioskClient(Settings(self.server.port), self.outbox, "9.9.9")
        self.events = []

    def tearDown(self):
        self.client.stop()
        self.server.stop()
        shutil.rmtree(self.dir)

    def collect(self):
        self.events.extend(self.client.poll_events())
        return self.events

    def kinds(self):
        return [event[0] for event in self.collect()]

    def test_heartbeat_reports_status_with_car_info_and_key(self):
        self.client.set_car_info("ks_vallelunga", "club", "abarth500")
        self.client.start()

        self.assertTrue(wait_for(lambda: "status" in self.kinds()))
        path, body, key = self.server.requests[0]
        self.assertEqual(path, "/rigs/2/heartbeat")
        self.assertEqual(body, {"appVersion": "9.9.9", "track": "ks_vallelunga", "trackConfig": "club",
                                "car": "abarth500"})
        self.assertEqual(key, "secret")
        status_event = [e for e in self.events if e[0] == "status"][0]
        self.assertEqual(status_event[1]["serverTime"], 123)
        self.assertLessEqual(status_event[2], status_event[3])

    def test_sends_laps_and_reports_the_result(self):
        self.server.responses["/rigs/2/laps"] = ok({"valid": True, "isPersonalBest": True})
        self.client.submit_lap(lap("a"))
        self.client.submit_lap(lap("b"))
        self.client.start()

        self.assertTrue(wait_for(lambda: self.kinds().count("lap_result") == 2))
        self.assertEqual(len(self.outbox), 0)

    def test_keeps_laps_while_the_server_fails(self):
        self.server.responses["/rigs/2/laps"] = (500, {"success": False, "message": "boom"})
        self.client.submit_lap(lap("a"))
        self.client.start()

        self.assertTrue(wait_for(lambda: "/rigs/2/laps" in self.server.paths()))
        time.sleep(0.3)
        self.assertEqual(len(self.outbox), 1)

    def test_drops_laps_the_server_rejects(self):
        self.server.responses["/rigs/2/laps"] = (404, {"success": False, "message": "Session not found"})
        self.client.submit_lap(lap("a"))
        self.client.start()

        self.assertTrue(wait_for(lambda: "lap_rejected" in self.kinds()))
        self.assertEqual(len(self.outbox), 0)

    def test_action_returns_status_then_done(self):
        self.server.responses["/rigs/2/session/start"] = ok({"serverTime": 456, "state": "RACING"})
        self.client.start()
        self.client.request("start", {"queueEntryId": "q1"})

        self.assertTrue(wait_for(lambda: "action_done" in self.kinds()))
        self.assertIn(("/rigs/2/session/start", {"queueEntryId": "q1"}, "secret"), self.server.requests)

    def test_action_failure_carries_the_server_message(self):
        self.server.responses["/rigs/2/call/skip"] = (409, {"success": False, "message": "Not called anymore"})
        self.client.start()
        self.client.request("skip", {"queueEntryId": "q1"})

        self.assertTrue(wait_for(lambda: "action_failed" in self.kinds()))
        failed = [e for e in self.events if e[0] == "action_failed"][0]
        self.assertEqual(failed[1:], ("skip", "Not called anymore"))

    def test_unreachable_server_reports_offline(self):
        self.server.stop()
        self.client = KioskClient(Settings(self.server.port), self.outbox, "9.9.9")
        self.server = StubServer()  # replaced so tearDown has something to stop
        self.client.start()

        self.assertTrue(wait_for(lambda: "offline" in self.kinds()))


class AsciiIdnaCodecTest(unittest.TestCase):
    def test_encodes_ascii_hostnames_unchanged(self):
        codec = _ascii_idna_codec("idna")
        self.assertEqual(codec.encode("localhost")[0], b"localhost")
        self.assertEqual(codec.encode("127.0.0.1")[0], b"127.0.0.1")
        self.assertRaises(UnicodeEncodeError, codec.encode, "b\u00fccher.de")

    def test_ignores_other_encodings(self):
        self.assertIsNone(_ascii_idna_codec("utf_8"))


class OutboxTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "outbox.json")

    def tearDown(self):
        shutil.rmtree(self.dir)

    def test_survives_a_restart(self):
        Outbox(self.path).add(lap("a"))

        reloaded = Outbox(self.path)
        self.assertEqual(reloaded.peek()["clientLapId"], "a")
        reloaded.remove("a")
        self.assertEqual(len(Outbox(self.path)), 0)

    def test_ignores_a_corrupt_file(self):
        with open(self.path, "w") as f:
            f.write("{not json")

        self.assertEqual(len(Outbox(self.path)), 0)


if __name__ == "__main__":
    unittest.main()
