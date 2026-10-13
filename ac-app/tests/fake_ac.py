"""Stand-ins for AC's built-in ac / acsys modules, for running the app outside the game.

FakeAc only accepts functions that exist in AC's Python API (names checked against acs.exe), so a typo
or an invented function fails the tests instead of failing silently in game.
"""

import itertools

AC_FUNCTIONS = {
    "addButton", "addLabel", "addOnClickedListener", "addRenderCallback", "console", "drawBorder",
    "getCarName", "getCarState", "getTrackConfiguration", "getTrackName", "isCarInPitline", "log", "newApp",
    "setBackgroundColor", "setBackgroundOpacity", "setFontAlignment", "setFontColor", "setFontSize",
    "setIconPosition", "setPosition", "setSize", "setText", "setTitle", "setVisible",
}


class FakeAc(object):
    def __init__(self):
        self.calls = []
        self.texts = {}
        self.visible = {}
        self.listeners = {}
        self.render_callbacks = []
        self.car = {"LapCount": 0, "LastLap": 0, "LapInvalidated": 0}
        self.in_pitline = 0
        self._ids = itertools.count(1)

    def __getattr__(self, name):
        if name not in AC_FUNCTIONS:
            raise AttributeError("ac.{} does not exist in AC's Python API".format(name))

        def call(*args):
            self.calls.append((name, args))
            return self._handle(name, args)

        return call

    def _handle(self, name, args):
        if name in ("newApp", "addLabel", "addButton"):
            control = next(self._ids)
            self.texts[control] = args[1] if name != "newApp" else args[0]
            return control
        if name == "setText":
            self.texts[args[0]] = args[1]
        elif name == "setVisible":
            self.visible[args[0]] = args[1]
        elif name == "addOnClickedListener":
            self.listeners[args[0]] = args[1]
        elif name == "addRenderCallback":
            self.render_callbacks.append(args[1])
        elif name == "getCarState":
            return self.car[FakeAcsys.CS.names[args[1]]]
        elif name == "isCarInPitline":
            return self.in_pitline
        elif name == "getTrackName":
            return "ks_brands_hatch"
        elif name == "getTrackConfiguration":
            return "indy"
        elif name == "getCarName":
            return "ks_mercedes_amg_gt3"
        return 1

    def visible_texts(self):
        return [text for control, text in self.texts.items() if self.visible.get(control, 1) and text]

    def click(self, label):
        for control, text in self.texts.items():
            if text == label and self.visible.get(control, 1) and control in self.listeners:
                self.listeners[control](0, 0)
                return
        raise AssertionError("No visible button {!r} in {}".format(label, self.visible_texts()))


class FakeAcsys(object):
    class CS(object):
        names = {0: "LapCount", 1: "LastLap", 2: "LapInvalidated"}
        LapCount = 0
        LastLap = 1
        LapInvalidated = 2
