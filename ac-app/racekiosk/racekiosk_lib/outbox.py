"""Laps waiting to be sent to the kiosk server.

Persisted to a JSON file so laps driven while the server is unreachable (or right before AC crashes)
are delivered later. Shared between AC's main thread (adds laps) and the network thread (sends them).
"""

import json
import os
import threading


class Outbox(object):
    def __init__(self, path):
        self._path = path
        self._lock = threading.Lock()
        self._items = self._load()

    def add(self, lap):
        with self._lock:
            self._items.append(lap)
            self._save()

    def peek(self):
        with self._lock:
            return self._items[0] if self._items else None

    def remove(self, client_lap_id):
        with self._lock:
            self._items = [lap for lap in self._items if lap.get("clientLapId") != client_lap_id]
            self._save()

    def __len__(self):
        with self._lock:
            return len(self._items)

    def _load(self):
        try:
            with open(self._path, "r") as f:
                items = json.load(f)
            return items if isinstance(items, list) else []
        except (IOError, OSError, ValueError):
            return []

    def _save(self):
        # Write to a temp file first so a crash mid-write can't corrupt the outbox
        tmp_path = self._path + ".tmp"
        with open(tmp_path, "w") as f:
            json.dump(self._items, f)
        os.replace(tmp_path, self._path)
