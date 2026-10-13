"""Settings for the app, read from settings.ini next to racekiosk.py."""

import configparser
import os
import shutil


class Settings(object):
    def __init__(self, parser):
        self.backend_url = parser.get("kiosk", "backend_url", fallback="http://localhost:8080").rstrip("/")
        self.rig_id = parser.getint("kiosk", "rig_id", fallback=1)
        self.kiosk_key = parser.get("kiosk", "kiosk_key", fallback="")
        self.poll_interval = parser.getfloat("kiosk", "poll_interval", fallback=1.0)
        self.request_timeout = parser.getfloat("kiosk", "request_timeout", fallback=2.0)
        self.min_lap_ms = parser.getint("laps", "min_lap_ms", fallback=20000)
        self.ui_scale = parser.getfloat("ui", "scale", fallback=1.0)
        self.ui_opacity = parser.getfloat("ui", "opacity", fallback=0.85)


def load_settings(app_dir):
    """Reads settings.ini, creating it from settings_defaults.ini on first start."""
    defaults_path = os.path.join(app_dir, "settings_defaults.ini")
    path = os.path.join(app_dir, "settings.ini")

    if not os.path.exists(path) and os.path.exists(defaults_path):
        shutil.copyfile(defaults_path, path)

    parser = configparser.ConfigParser(inline_comment_prefixes=(";", "#"))
    parser.read([defaults_path, path])
    return Settings(parser)
