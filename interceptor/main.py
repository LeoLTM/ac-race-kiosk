#!/usr/bin/env python3
"""
Assetto Corsa Race Interceptor Client
======================================
Client application for racing rigs that integrates with the control server backend.

This works by:
1. Connecting to control server via Socket.IO for real-time queue updates
2. Displaying next player from queue when available
3. When user clicks "Start Race":
   a. Starts "hot phase" watchdog to intercept race.ini writes
   b. Launches Content Manager via acmanager:// URL to join configured server
   c. Intercepts Content Manager's race.ini writes to inject queued player name
4. Returning to FREE state when user clicks "End Session"

Usage:
    python main.py
    
Requires:
    - .env file with BACKEND_URL, BACKEND_PORT, RIG_ID, and AC server config
    - Control server backend running and accessible
    - Content Manager installed and configured
"""

from __future__ import annotations

import logging
import os
import queue
import socket
import sys
import threading
import time
import tkinter as tk
from dataclasses import dataclass
from pathlib import Path
from tkinter import messagebox, ttk
from typing import TYPE_CHECKING, Any, Callable, Optional

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from backend_client import BackendClient
from config import config

if TYPE_CHECKING:
    from watchdog.observers.api import BaseObserver

# =============================================================================
# Logging Configuration
# =============================================================================

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("RaceInterceptorUI")


# =============================================================================
# Type Aliases
# =============================================================================

PlayerData = dict[str, Any]
InjectionCallback = Callable[[], None]


# =============================================================================
# Constants
# =============================================================================

@dataclass(frozen=True)
class UIColors:
    """Color palette for the dark theme UI."""

    BACKGROUND: str = "#1a1a2e"
    FRAME_BACKGROUND: str = "#16213e"
    TEXT_PRIMARY: str = "#e94560"
    TEXT_SECONDARY: str = "#aaaaaa"
    TEXT_WHITE: str = "white"
    SUCCESS: str = "#00ff41"
    WARNING: str = "#ffa500"
    ERROR: str = "#ff0000"
    BUTTON_START: str = "#00aa00"
    BUTTON_SKIP: str = "#aa5500"
    BUTTON_END: str = "#aa0000"


@dataclass(frozen=True)
class UIConfig:
    """UI configuration constants."""

    WINDOW_WIDTH: int = 600
    WINDOW_HEIGHT: int = 400
    PADDING_MAIN: str = "30"
    PADDING_STATUS: str = "25"
    FONT_TITLE: tuple[str, int, str] = ("Arial Black", 20, "bold")
    FONT_PLAYER: tuple[str, int, str] = ("Arial", 16, "bold")
    FONT_STATUS: tuple[str, int] = ("Arial", 12)
    FONT_QUEUE: tuple[str, int] = ("Arial", 11)
    FONT_CONNECTION: tuple[str, int, str] = ("Arial", 10, "bold")
    FONT_BUTTON: tuple[str, int, str] = ("Arial", 12, "bold")


@dataclass(frozen=True)
class TimingConfig:
    """Timing configuration constants."""

    UI_QUEUE_POLL_MS: int = 50
    CONNECT_DELAY_MS: int = 500
    INITIAL_STATE_DELAY_MS: int = 100
    RECONNECT_DELAY_MS: int = 5000
    WATCHDOG_LAUNCH_DELAY_MS: int = 500
    DEBOUNCE_SECONDS: float = 0.5
    FILE_WRITE_DELAY_SECONDS: float = 0.15
    FILE_RETRY_DELAY_SECONDS: float = 0.1
    MAX_FILE_RETRIES: int = 5


# Singleton instances
COLORS = UIColors()
UI_CONFIG = UIConfig()
TIMING = TimingConfig()


# =============================================================================
# Rig State Management
# =============================================================================

class RigState:
    """Enumeration of possible rig states."""

    FREE: str = "FREE"
    RACING: str = "RACING"


@dataclass
class AppState:
    """Application state container."""

    rig_state: str = RigState.FREE
    next_player: Optional[PlayerData] = None
    queue_length: int = 0

    def update_from_backend(self, rig_data: dict[str, Any]) -> None:
        """
        Update state from backend rig data.

        Args:
            rig_data: Rig state data from backend.
        """
        self.rig_state = rig_data.get("state", RigState.FREE)
        queue_list = rig_data.get("queue", [])
        self.queue_length = len(queue_list)
        self.next_player = queue_list[0] if queue_list else None


# =============================================================================
# Content Manager Launcher
# =============================================================================

def launch_content_manager(server_ip: str, http_port: int) -> None:
    """
    Launch Assetto Corsa via Content Manager with server join URL.

    Args:
        server_ip: Server IP address.
        http_port: Server HTTP port.
    """
    resolved_ip = _resolve_hostname(server_ip)
    join_url = f"acmanager://race/online/join?ip={resolved_ip}&httpPort={http_port}&autoJoin=true"

    logger.info("Opening Content Manager with URL: %s", join_url)
    os.startfile(join_url)
    logger.info("Content Manager join request sent")


def _resolve_hostname(hostname: str) -> str:
    """
    Resolve hostname to IP address if needed.

    Args:
        hostname: Hostname or IP address.

    Returns:
        Resolved IP address or original hostname on failure.
    """
    try:
        return socket.gethostbyname(hostname)
    except socket.gaierror:
        logger.warning("Failed to resolve hostname %s, using as-is", hostname)
        return hostname


# =============================================================================
# Race INI File Handler
# =============================================================================

class RaceIniHandler(FileSystemEventHandler):
    """
    Handles race.ini file modification events during 'hot phase'.

    Monitors the Assetto Corsa config directory and injects the player name
    when Content Manager writes the race.ini file.
    """

    __slots__ = (
        "_player_name",
        "_on_injection_complete",
        "_on_injection_failed",
        "_last_modified_time",
        "_injection_completed",
        "_race_ini_path",
    )

    def __init__(
        self,
        player_name: str,
        on_injection_complete: Optional[InjectionCallback] = None,
    ) -> None:
        """
        Initialize handler.

        Args:
            player_name: Name of player to inject into race.ini.
            on_injection_complete: Callback to call after successful injection.
        """
        super().__init__()
        self._player_name = player_name
        self._on_injection_complete = on_injection_complete
        self._on_injection_failed: Optional[InjectionCallback] = None
        self._last_modified_time: float = 0
        self._injection_completed = False
        self._race_ini_path = self._get_race_ini_path()

    @property
    def on_injection_failed(self) -> Optional[InjectionCallback]:
        """Get the injection failed callback."""
        return self._on_injection_failed

    @on_injection_failed.setter
    def on_injection_failed(self, callback: Optional[InjectionCallback]) -> None:
        """Set the injection failed callback."""
        self._on_injection_failed = callback

    @staticmethod
    def _get_race_ini_path() -> Path:
        """Get the path to the race.ini file."""
        return Path(os.path.expanduser("~")) / "Documents" / "Assetto Corsa" / "cfg" / "race.ini"

    def on_modified(self, event) -> None:
        """
        Handle file modification events.

        Args:
            event: The file system event.
        """
        if event.is_directory or self._injection_completed:
            return

        if not event.src_path.endswith("race.ini"):
            return

        if not self._should_process_event():
            return

        logger.info(">>> race.ini modified, intercepting...")
        time.sleep(TIMING.FILE_WRITE_DELAY_SECONDS)

        if self._inject_player_name():
            self._injection_completed = True
            if self._on_injection_complete:
                self._on_injection_complete()
        elif self._on_injection_failed:
            self._on_injection_failed()

    def _should_process_event(self) -> bool:
        """
        Check if enough time has passed since last event (debounce).

        Returns:
            True if the event should be processed.
        """
        current_time = time.time()
        if current_time - self._last_modified_time < TIMING.DEBOUNCE_SECONDS:
            return False
        self._last_modified_time = current_time
        return True

    def _inject_player_name(self) -> bool:
        """
        Inject the player name into race.ini.

        Returns:
            True if successful, False otherwise.
        """
        try:
            lines = self._read_race_ini()
            modified_lines = self._modify_lines(lines)
            self._write_race_ini(modified_lines)
            logger.info(">>> Successfully intercepted and modified race.ini!")
            return True
        except Exception as e:
            logger.exception("Error modifying race.ini: %s", e)
            return False

    def _read_race_ini(self) -> list[str]:
        """
        Read the race.ini file with retry logic.

        Returns:
            List of lines from the file.

        Raises:
            OSError: If the file cannot be read after all retries.
        """
        for attempt in range(TIMING.MAX_FILE_RETRIES):
            try:
                with open(self._race_ini_path, "r", encoding="utf-8", errors="ignore") as f:
                    return f.readlines()
            except (PermissionError, OSError):
                if attempt < TIMING.MAX_FILE_RETRIES - 1:
                    time.sleep(TIMING.FILE_RETRY_DELAY_SECONDS)
                else:
                    raise
        return []  # Unreachable, but satisfies type checker

    def _modify_lines(self, lines: list[str]) -> list[str]:
        """
        Modify the lines to inject the player name.

        Args:
            lines: Original file lines.

        Returns:
            Modified file lines.
        """
        current_section: Optional[str] = None
        modified_lines: list[str] = []

        for line in lines:
            line = line.replace("\x00", "")  # Remove null bytes

            if self._is_section_header(line):
                current_section = line.strip()[1:-1]
                modified_lines.append(line)
                continue

            modified_line = self._process_line(line, current_section)
            modified_lines.append(modified_line)

        return modified_lines

    @staticmethod
    def _is_section_header(line: str) -> bool:
        """Check if a line is an INI section header."""
        stripped = line.strip()
        return stripped.startswith("[") and stripped.endswith("]")

    def _process_line(self, line: str, section: Optional[str]) -> str:
        """
        Process a single line, modifying if necessary.

        Args:
            line: The line to process.
            section: Current INI section name.

        Returns:
            The processed (possibly modified) line.
        """
        stripped = line.strip()

        if section == "CAR_0" and stripped.startswith("DRIVER_NAME="):
            old_name = line.split("=", 1)[1].strip()
            logger.info(">>> Changed driver name: '%s' -> '%s'", old_name, self._player_name)
            return f"DRIVER_NAME={self._player_name}\n"

        if section == "REMOTE" and stripped.startswith("NAME="):
            logger.info(">>> Changed remote name to: '%s'", self._player_name)
            return f"NAME={self._player_name}\n"

        return line

    def _write_race_ini(self, lines: list[str]) -> None:
        """
        Write the modified lines back to race.ini with retry logic.

        Args:
            lines: Lines to write.

        Raises:
            OSError: If the file cannot be written after all retries.
        """
        for attempt in range(TIMING.MAX_FILE_RETRIES):
            try:
                with open(self._race_ini_path, "w", encoding="utf-8", errors="ignore") as f:
                    f.writelines(lines)
                return
            except (PermissionError, OSError):
                if attempt < TIMING.MAX_FILE_RETRIES - 1:
                    time.sleep(TIMING.FILE_RETRY_DELAY_SECONDS)
                else:
                    raise


# =============================================================================
# Watchdog Manager
# =============================================================================

class WatchdogManager:
    """Manages the file system observer for race.ini interception."""

    __slots__ = ("_observer", "_event_handler", "_cfg_dir")

    def __init__(self) -> None:
        """Initialize the watchdog manager."""
        self._observer: Optional[BaseObserver] = None
        self._event_handler: Optional[RaceIniHandler] = None
        self._cfg_dir = Path(os.path.expanduser("~")) / "Documents" / "Assetto Corsa" / "cfg"

    @property
    def is_active(self) -> bool:
        """Check if the watchdog is currently active."""
        return self._observer is not None

    def start(
        self,
        player_name: str,
        on_complete: Optional[InjectionCallback] = None,
        on_failed: Optional[InjectionCallback] = None,
    ) -> None:
        """
        Start watching for race.ini modifications.

        Args:
            player_name: Name to inject into race.ini.
            on_complete: Callback when injection succeeds.
            on_failed: Callback when injection fails.
        """
        self._cfg_dir.mkdir(parents=True, exist_ok=True)

        self._event_handler = RaceIniHandler(
            player_name=player_name,
            on_injection_complete=on_complete,
        )
        self._event_handler.on_injection_failed = on_failed

        self._observer = Observer()
        self._observer.schedule(self._event_handler, str(self._cfg_dir), recursive=False)
        self._observer.start()

        logger.info(">>> Watchdog active - waiting for Content Manager to write race.ini...")
        logger.info(">>> Will inject player name: %s", player_name)

    def stop(self, join: bool = True) -> None:
        """
        Stop the watchdog observer.

        Args:
            join: Whether to wait for observer thread to finish.
                  Set to False when called from the observer's own thread.
        """
        if self._observer is None:
            return

        self._observer.stop()
        if join:
            self._observer.join()
        self._observer = None
        self._event_handler = None
        logger.info(">>> Watchdog stopped")


# =============================================================================
# UI Style Manager
# =============================================================================

class StyleManager:
    """Manages ttk style configuration for the UI."""

    @staticmethod
    def configure_styles() -> None:
        """Configure all ttk styles for the dark theme."""
        style = ttk.Style()
        style.theme_use("clam")

        style.configure("Main.TFrame", background=COLORS.BACKGROUND)
        style.configure("Inner.TFrame", background=COLORS.FRAME_BACKGROUND)

        style.configure(
            "Title.TLabel",
            background=COLORS.BACKGROUND,
            foreground=COLORS.TEXT_PRIMARY,
            font=UI_CONFIG.FONT_TITLE,
        )
        style.configure(
            "Status.TLabel",
            background=COLORS.FRAME_BACKGROUND,
            foreground=COLORS.TEXT_SECONDARY,
            font=UI_CONFIG.FONT_STATUS,
        )
        style.configure(
            "Player.TLabel",
            background=COLORS.FRAME_BACKGROUND,
            foreground=COLORS.TEXT_WHITE,
            font=UI_CONFIG.FONT_PLAYER,
        )
        style.configure(
            "Queue.TLabel",
            background=COLORS.FRAME_BACKGROUND,
            foreground=COLORS.WARNING,
            font=UI_CONFIG.FONT_QUEUE,
        )
        style.configure(
            "Connected.TLabel",
            background=COLORS.FRAME_BACKGROUND,
            foreground=COLORS.SUCCESS,
            font=UI_CONFIG.FONT_CONNECTION,
        )
        style.configure(
            "Disconnected.TLabel",
            background=COLORS.FRAME_BACKGROUND,
            foreground=COLORS.ERROR,
            font=UI_CONFIG.FONT_CONNECTION,
        )


# =============================================================================
# Main Application UI
# =============================================================================

class RaceInterceptorUI:
    """
    Main UI for the race interceptor application.

    Provides a minimal dark-themed interface for managing racing sessions
    with backend integration via Socket.IO.
    """

    __slots__ = (
        "_window",
        "_state",
        "_backend",
        "_watchdog",
        "_ui_queue",
        "_connection_label",
        "_player_label",
        "_queue_label",
        "_state_label",
        "_start_button",
        "_skip_button",
        "_end_button",
    )

    def __init__(self) -> None:
        """Initialize the race interceptor UI."""
        self._window = self._create_window()
        self._state = AppState()
        self._ui_queue: queue.Queue[Callable[[], None]] = queue.Queue()
        self._watchdog = WatchdogManager()

        # Initialize UI labels (set by _setup_ui)
        self._connection_label: ttk.Label
        self._player_label: ttk.Label
        self._queue_label: ttk.Label
        self._state_label: ttk.Label
        self._start_button: tk.Button
        self._skip_button: tk.Button
        self._end_button: tk.Button

        # Initialize backend client
        self._backend = BackendClient(on_queue_update=self._on_queue_update)
        self._backend.on_connection_change = self._on_connection_change
        logger.debug("BackendClient created, target: %s", config.BACKEND_BASE_URL)

        # Setup UI
        StyleManager.configure_styles()
        self._setup_ui()

        # Start UI queue polling
        self._poll_ui_queue()

        # Schedule backend connection
        self._window.after(TIMING.CONNECT_DELAY_MS, self._connect_to_backend)

    def _create_window(self) -> tk.Tk:
        """
        Create and configure the main window.

        Returns:
            Configured Tk window.
        """
        window = tk.Tk()
        window.title(f"Race Interceptor - Rig {config.RIG_ID}")
        window.geometry(f"{UI_CONFIG.WINDOW_WIDTH}x{UI_CONFIG.WINDOW_HEIGHT}")
        window.resizable(False, False)
        window.configure(bg=COLORS.BACKGROUND)

        # Center window on screen
        window.update_idletasks()
        x = (window.winfo_screenwidth() - UI_CONFIG.WINDOW_WIDTH) // 2
        y = (window.winfo_screenheight() - UI_CONFIG.WINDOW_HEIGHT) // 2
        window.geometry(f"+{x}+{y}")

        return window

    def _setup_ui(self) -> None:
        """Create the UI layout and widgets."""
        main_frame = ttk.Frame(self._window, padding=UI_CONFIG.PADDING_MAIN, style="Main.TFrame")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        main_frame.columnconfigure(0, weight=1)

        self._create_title(main_frame)
        self._create_status_frame(main_frame)
        self._create_button_frame(main_frame)

        self._window.columnconfigure(0, weight=1)
        self._window.rowconfigure(0, weight=1)

    def _create_title(self, parent: ttk.Frame) -> None:
        """Create the title label."""
        ttk.Label(
            parent,
            text=f"Racing Rig {config.RIG_ID}",
            style="Title.TLabel",
        ).grid(row=0, column=0, pady=(0, 30))

    def _create_status_frame(self, parent: ttk.Frame) -> None:
        """Create the status display frame."""
        status_frame = ttk.Frame(parent, padding=UI_CONFIG.PADDING_STATUS, style="Inner.TFrame")
        status_frame.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=(0, 20))
        status_frame.columnconfigure(0, weight=1)

        self._connection_label = ttk.Label(
            status_frame,
            text="● Disconnected",
            style="Disconnected.TLabel",
        )
        self._connection_label.grid(row=0, column=0, pady=(0, 15))

        self._player_label = ttk.Label(
            status_frame,
            text="Waiting for player...",
            style="Player.TLabel",
        )
        self._player_label.grid(row=1, column=0, pady=(0, 10))

        self._queue_label = ttk.Label(
            status_frame,
            text="Queue: 0 players waiting",
            style="Queue.TLabel",
        )
        self._queue_label.grid(row=2, column=0, pady=(0, 20))

        self._state_label = ttk.Label(
            status_frame,
            text="State: FREE",
            style="Status.TLabel",
        )
        self._state_label.grid(row=3, column=0)

    def _create_button_frame(self, parent: ttk.Frame) -> None:
        """Create the button frame with action buttons."""
        button_frame = ttk.Frame(parent, style="Main.TFrame")
        button_frame.grid(row=2, column=0, sticky=(tk.W, tk.E))
        button_frame.columnconfigure(0, weight=1)
        button_frame.columnconfigure(1, weight=1)

        button_config = {
            "font": UI_CONFIG.FONT_BUTTON,
            "fg": "white",
            "relief": "raised",
            "bd": 3,
            "padx": 20,
            "pady": 15,
            "cursor": "hand2",
        }

        self._start_button = tk.Button(
            button_frame,
            text="Start Race",
            command=self._on_start_race,
            bg=COLORS.BUTTON_START,
            state="disabled",
            **button_config,
        )
        self._start_button.grid(row=0, column=0, padx=(0, 10), sticky=(tk.W, tk.E))

        self._skip_button = tk.Button(
            button_frame,
            text="Skip Player",
            command=self._on_skip_player,
            bg=COLORS.BUTTON_SKIP,
            state="disabled",
            **button_config,
        )
        self._skip_button.grid(row=0, column=1, padx=(10, 0), sticky=(tk.W, tk.E))

        self._end_button = tk.Button(
            button_frame,
            text="End Session",
            command=self._on_end_session,
            bg=COLORS.BUTTON_END,
            **button_config,
        )
        # Not gridded initially - only shown when RACING

    # -------------------------------------------------------------------------
    # Thread-Safe UI Updates
    # -------------------------------------------------------------------------

    def _poll_ui_queue(self) -> None:
        """Poll the UI queue for callbacks from background threads."""
        try:
            while True:
                callback = self._ui_queue.get_nowait()
                logger.debug("Executing queued callback: %s", getattr(callback, "__name__", "lambda"))
                callback()
        except queue.Empty:
            pass
        except Exception as e:
            logger.exception("UI queue poll error: %s", e)

        self._window.after(TIMING.UI_QUEUE_POLL_MS, self._poll_ui_queue)

    def _schedule_ui_update(self, callback: Callable[[], None]) -> None:
        """
        Thread-safe way to schedule a UI update from background threads.

        Args:
            callback: Function to call on the main thread.
        """
        logger.debug("Queueing callback: %s", getattr(callback, "__name__", "lambda"))
        self._ui_queue.put(callback)

    # -------------------------------------------------------------------------
    # Backend Connection
    # -------------------------------------------------------------------------

    def _connect_to_backend(self) -> None:
        """Connect to the backend server."""
        logger.info("Initiating connection to backend at %s...", config.BACKEND_BASE_URL)

        if self._backend.connect():
            logger.info("Backend connection successful")
            self._update_connection_status(connected=True)
            self._window.after(TIMING.INITIAL_STATE_DELAY_MS, self._fetch_initial_state)
        else:
            logger.warning("Backend connection failed, will retry in %dms", TIMING.RECONNECT_DELAY_MS)
            self._update_connection_status(connected=False)
            self._window.after(TIMING.RECONNECT_DELAY_MS, self._connect_to_backend)

    def _fetch_initial_state(self) -> None:
        """Fetch initial rig state from backend."""
        logger.info("Fetching initial queue state via REST API...")
        rig_data = self._backend.fetch_rig_state()

        if rig_data:
            state = rig_data.get("state", "UNKNOWN")
            queue_len = len(rig_data.get("queue", []))
            logger.info("Initial state received: state=%s, queue_length=%d", state, queue_len)
        else:
            logger.warning("Failed to fetch initial state, will rely on Socket.IO updates")

    def _on_connection_change(self, connected: bool) -> None:
        """
        Handle Socket.IO connection status changes.

        Args:
            connected: Whether the connection is established.
        """
        logger.info("Connection status changed: connected=%s", connected)
        self._schedule_ui_update(lambda: self._update_connection_status(connected))

    def _update_connection_status(self, connected: bool) -> None:
        """
        Update the connection status indicator.

        Args:
            connected: Whether the backend is connected.
        """
        if connected:
            self._connection_label.config(text="● Connected", style="Connected.TLabel")
        else:
            self._connection_label.config(text="● Disconnected", style="Disconnected.TLabel")

    # -------------------------------------------------------------------------
    # Queue Update Handling
    # -------------------------------------------------------------------------

    def _on_queue_update(self, rig_data: dict[str, Any]) -> None:
        """
        Handle queue-update events from the backend.

        Args:
            rig_data: Rig state data from backend.
        """
        logger.info("📨 Queue update received from Socket.IO")
        logger.debug("Rig data: %s", rig_data)

        self._state.update_from_backend(rig_data)

        player_name = self._state.next_player.get("name") if self._state.next_player else None
        logger.info(
            "State: %s, Queue length: %d, Next player: %s",
            self._state.rig_state,
            self._state.queue_length,
            player_name,
        )

        self._schedule_ui_update(self._update_ui)

    def _update_ui(self) -> None:
        """Update UI based on current application state."""
        logger.info(">>> Updating UI: state=%s, next_player=%s", self._state.rig_state, self._state.next_player)

        try:
            self._state_label.config(text=f"State: {self._state.rig_state}")
            self._queue_label.config(
                text=f"Queue: {self._state.queue_length} player{'s' if self._state.queue_length != 1 else ''} waiting"
            )

            if self._state.rig_state == RigState.RACING:
                self._show_racing_ui()
            elif self._state.next_player:
                self._show_player_available_ui()
            else:
                self._show_waiting_ui()

            self._window.update_idletasks()
            logger.info(">>> UI update complete")

        except Exception as e:
            logger.exception("UI update error: %s", e)

    def _show_racing_ui(self) -> None:
        """Configure UI for RACING state."""
        self._player_label.config(text="Racing in progress...")
        self._start_button.grid_remove()
        self._skip_button.grid_remove()
        self._end_button.grid(row=0, column=0, columnspan=2, sticky=(tk.W, tk.E))

    def _show_player_available_ui(self) -> None:
        """Configure UI when a player is available in the queue."""
        player_name = self._state.next_player.get("name", "Unknown") if self._state.next_player else "Unknown"
        self._player_label.config(text=f"Next: {player_name}")
        self._start_button.config(state="normal")
        self._skip_button.config(state="normal")
        self._end_button.grid_remove()
        self._start_button.grid(row=0, column=0, padx=(0, 10), sticky=(tk.W, tk.E))
        self._skip_button.grid(row=0, column=1, padx=(10, 0), sticky=(tk.W, tk.E))

    def _show_waiting_ui(self) -> None:
        """Configure UI when waiting for players."""
        self._player_label.config(text="Waiting for player...")
        self._start_button.config(state="disabled")
        self._skip_button.config(state="disabled")
        self._end_button.grid_remove()
        self._start_button.grid(row=0, column=0, padx=(0, 10), sticky=(tk.W, tk.E))
        self._skip_button.grid(row=0, column=1, padx=(10, 0), sticky=(tk.W, tk.E))

    # -------------------------------------------------------------------------
    # Button Actions
    # -------------------------------------------------------------------------

    def _on_start_race(self) -> None:
        """Handle Start Race button click."""
        if not self._state.next_player:
            return

        player_id = self._state.next_player.get("id")
        player_name = self._state.next_player.get("name")

        logger.info(">>> Starting race for: %s", player_name)

        self._start_button.config(state="disabled")
        self._skip_button.config(state="disabled")

        def start_session_task() -> None:
            success = self._backend.start_session(player_id)
            self._window.after(0, lambda: self._on_start_race_complete(success, player_name))

        threading.Thread(target=start_session_task, daemon=True).start()

    def _on_start_race_complete(self, success: bool, player_name: str) -> None:
        """
        Handle completion of start session request.

        Args:
            success: Whether the session started successfully.
            player_name: Name of the player.
        """
        if success:
            self._watchdog.start(
                player_name=player_name,
                on_complete=self._on_injection_complete,
                on_failed=self._on_injection_failed,
            )
            self._window.after(TIMING.WATCHDOG_LAUNCH_DELAY_MS, lambda: self._launch_game(player_name))
        else:
            messagebox.showerror("Error", "Failed to start session. Please try again.")
            self._start_button.config(state="normal")
            self._skip_button.config(state="normal")

    def _launch_game(self, player_name: str) -> None:
        """
        Launch Content Manager to join the AC server.

        Args:
            player_name: Name of the player.
        """
        try:
            launch_content_manager(
                server_ip=config.AC_SERVER_IP,
                http_port=config.AC_SERVER_HTTP_PORT,
            )
            self._player_label.config(text=f"Launching game for {player_name}...")
        except Exception as e:
            logger.exception("Error launching Content Manager: %s", e)
            messagebox.showerror("Error", f"Failed to launch game: {e}")

    def _on_skip_player(self) -> None:
        """Handle Skip Player button click."""
        if not self._state.next_player:
            return

        player_name = self._state.next_player.get("name")

        result = messagebox.askyesno(
            "Skip Player",
            f"Skip {player_name}?\n\nThis will remove them from the queue.",
        )

        if result:
            logger.info(">>> Skipping player: %s", player_name)
            if not self._backend.skip_player():
                messagebox.showerror("Error", "Failed to skip player. Please try again.")

    def _on_end_session(self) -> None:
        """Handle End Session button click."""
        logger.info(">>> Ending session")

        if self._backend.complete_session():
            logger.info(">>> Session ended, rig now FREE")
        else:
            messagebox.showerror("Error", "Failed to end session. Please try again.")

    # -------------------------------------------------------------------------
    # Watchdog Callbacks
    # -------------------------------------------------------------------------

    def _on_injection_complete(self) -> None:
        """Handle successful race.ini injection."""
        logger.info(">>> Injection complete, stopping watchdog")
        self._window.after(0, lambda: self._watchdog.stop(join=False))
        self._window.after(0, lambda: self._player_label.config(text="Name injected! Racing in progress..."))

    def _on_injection_failed(self) -> None:
        """Handle failed race.ini injection."""
        logger.info(">>> Injection failed, watchdog will retry on next file change")
        self._window.after(0, lambda: self._player_label.config(text="Injection failed, waiting to retry..."))

    # -------------------------------------------------------------------------
    # Application Lifecycle
    # -------------------------------------------------------------------------

    def run(self) -> None:
        """Run the application main loop."""
        self._window.protocol("WM_DELETE_WINDOW", self._on_closing)
        self._window.mainloop()

    def _on_closing(self) -> None:
        """Handle window close event."""
        logger.info("Window closing, shutting down...")
        self._watchdog.stop()
        self._backend.disconnect()
        logger.info("Shutdown complete")
        self._window.destroy()


# =============================================================================
# Entry Point
# =============================================================================

def main() -> int:
    """
    Main entry point.

    Returns:
        Exit code (0 for success, 1 for failure).
    """
    print("=" * 60)
    print(f"Assetto Corsa Race Interceptor - Rig {config.RIG_ID}")
    print("=" * 60)
    print(f"Backend: {config.BACKEND_BASE_URL}")
    print("=" * 60)
    print()

    app = RaceInterceptorUI()
    app.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
