"""The in-game window. Renders a controller.Screen with AC's app UI API.

All calls must happen on AC's main thread (acMain / acUpdate / click listeners). The ac module is passed
in rather than imported, so the layout code can be exercised with a fake outside the game.
"""

from racekiosk_lib import controller

# Background color per screen kind (r, g, b)
BACKGROUNDS = {
    controller.OFFLINE: (0.25, 0.25, 0.25),
    controller.DISABLED: (0.25, 0.25, 0.25),
    controller.IDLE: (0.05, 0.28, 0.12),
    controller.CALLED: (0.80, 0.50, 0.04),
    controller.RACING: (0.06, 0.06, 0.10),
    controller.TIME_UP: (0.55, 0.08, 0.08),
}

TEXT_COLORS = {
    "normal": (1.0, 1.0, 1.0, 1.0),
    "good": (0.35, 1.0, 0.45, 1.0),
    "warn": (1.0, 0.75, 0.2, 1.0),
    "critical": (1.0, 0.3, 0.3, 1.0),
    "error": (1.0, 0.45, 0.45, 1.0),
}

BUTTON_COLORS = {
    "start": (0.1, 0.6, 0.15),
    "skip": (0.35, 0.35, 0.35),
    "end": (0.65, 0.1, 0.1),
}

# Window layouts at scale 1.0. Labels with "center" alignment are positioned by their center x.
LARGE = {
    "size": (620, 240),
    "banner": (310, 6, 14, "center"),
    "title": (310, 34, 40, "center"),
    "subtitle": (310, 94, 22, "center"),
    "detail": (310, 128, 16, "center"),
    "timer": None,
    "buttons": {"start": (30, 168, 360, 54), "skip": (410, 168, 180, 54)},
    "button_font": 26,
}

COMPACT = {
    "size": (480, 150),
    "banner": (240, 4, 13, "center"),
    "title": (16, 22, 28, "left"),
    "subtitle": (16, 70, 18, "left"),
    "detail": (16, 102, 16, "left"),
    "timer": (464, 14, 46, "right"),
    "buttons": {"end": (320, 100, 144, 38)},
    "button_font": 16,
}

LABELS = ("banner", "title", "subtitle", "detail", "timer")


class KioskWindow(object):
    def __init__(self, ac, title, scale, opacity, on_button):
        self._ac = ac
        self._scale = scale
        self._opacity = opacity
        self._on_button = on_button
        self._last_key = None
        self._layout = None
        self._background = BACKGROUNDS[controller.OFFLINE]

        self._app = ac.newApp(title)
        ac.setTitle(self._app, "")
        ac.setIconPosition(self._app, 0, -10000)
        ac.drawBorder(self._app, 0)
        ac.addRenderCallback(self._app, self._on_render)

        self._labels = {}
        for name in LABELS:
            self._labels[name] = ac.addLabel(self._app, "")

        self._buttons = {}
        # Keep references to the listener closures for as long as the window exists
        self._listeners = {}
        for button_id in BUTTON_COLORS:
            button = ac.addButton(self._app, "")
            listener = self._make_listener(button_id)
            ac.addOnClickedListener(button, listener)
            ac.drawBorder(button, 0)
            ac.setBackgroundOpacity(button, 1.0)
            ac.setBackgroundColor(button, *BUTTON_COLORS[button_id])
            ac.setFontAlignment(button, "center")
            self._buttons[button_id] = button
            self._listeners[button_id] = listener

    def render(self, screen):
        if screen.key() == self._last_key:
            return
        self._last_key = screen.key()

        ac = self._ac
        layout = COMPACT if screen.kind == controller.RACING else LARGE
        if layout is not self._layout:
            self._apply_layout(layout)

        self._background = BACKGROUNDS.get(screen.kind, BACKGROUNDS[controller.OFFLINE])
        ac.setBackgroundColor(self._app, *self._background)

        self._set_label("banner", screen.banner, "error")
        self._set_label("title", screen.title, "normal")
        self._set_label("subtitle", screen.subtitle, "normal")
        self._set_label("detail", screen.detail, screen.detail_level)
        self._set_label("timer", screen.timer if layout["timer"] else "", screen.timer_level)

        shown = dict(screen.buttons)
        for button_id, button in self._buttons.items():
            visible = button_id in shown and button_id in layout["buttons"]
            ac.setVisible(button, 1 if visible else 0)
            if visible:
                ac.setText(button, shown[button_id])

    def _apply_layout(self, layout):
        ac = self._ac
        self._layout = layout
        width, height = layout["size"]
        ac.setSize(self._app, self._px(width), self._px(height))

        for name in LABELS:
            spec = layout[name]
            label = self._labels[name]
            if spec is None:
                ac.setVisible(label, 0)
                continue
            x, y, font_size, alignment = spec
            ac.setVisible(label, 1)
            ac.setPosition(label, self._px(x), self._px(y))
            ac.setFontSize(label, self._px(font_size))
            ac.setFontAlignment(label, alignment)

        for button_id, (x, y, w, h) in layout["buttons"].items():
            button = self._buttons[button_id]
            ac.setPosition(button, self._px(x), self._px(y))
            ac.setSize(button, self._px(w), self._px(h))
            ac.setFontSize(button, self._px(layout["button_font"]))

    def _set_label(self, name, text, level):
        label = self._labels[name]
        self._ac.setText(label, text)
        self._ac.setFontColor(label, *TEXT_COLORS.get(level, TEXT_COLORS["normal"]))

    def _on_render(self, delta_t):
        # AC resets the background when the mouse hovers the window, so re-apply it every frame
        self._ac.setBackgroundColor(self._app, *self._background)
        self._ac.setBackgroundOpacity(self._app, self._opacity)

    def _make_listener(self, button_id):
        def on_click(*args):
            self._on_button(button_id)

        return on_click

    def _px(self, value):
        return int(round(value * self._scale))
