#!/usr/bin/env python3
"""
Backend Client for Race Interceptor.

Handles REST API calls and Socket.IO real-time communication with the control server.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, Optional

import requests
import socketio

from config import config

if TYPE_CHECKING:
    from requests import Response


# Module-level constants
DEBUG_WEBSOCKET = False  # Set to True to enable verbose WebSocket logging

# Type aliases for clarity
RigData = dict[str, Any]
PlayerData = dict[str, Any]
QueueUpdateCallback = Callable[[RigData], None]
ConnectionChangeCallback = Callable[[bool], None]


def _setup_logging(debug: bool = False) -> logging.Logger:
    """
    Configure and return a logger for the backend client.

    Args:
        debug: Enable debug-level logging if True.

    Returns:
        Configured logger instance.
    """
    logging.basicConfig(
        level=logging.DEBUG if debug else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    if debug:
        logging.getLogger("socketio").setLevel(logging.DEBUG)
        logging.getLogger("engineio").setLevel(logging.DEBUG)

    return logging.getLogger("BackendClient")


logger = _setup_logging(DEBUG_WEBSOCKET)


@dataclass
class ConnectionState:
    """Tracks the current connection state and reconnection attempts."""

    connected: bool = False
    reconnect_attempts: int = 0


@dataclass
class RigState:
    """Tracks the current rig state received from Socket.IO events."""

    state: Optional[str] = None
    current_player: Optional[PlayerData] = None
    queue_length: int = 0


class BackendClient:
    """
    Client for communicating with the control server backend.

    Provides both REST API calls and Socket.IO real-time communication
    for managing racing rig queues and sessions.

    Attributes:
        base_url: The backend server URL.
        rig_id: The ID of this racing rig.
        on_queue_update: Callback invoked when queue-update events are received.
        on_connection_change: Callback invoked when connection status changes.
    """

    # Class-level constants
    MAX_RECONNECT_DELAY = 30  # seconds
    RECONNECTION_DELAY = 1  # seconds
    CONNECTION_TIMEOUT = 10  # seconds
    REQUEST_TIMEOUT = 5  # seconds
    DEFAULT_MAX_RETRIES = 3
    RETRY_DELAY = 1  # seconds

    __slots__ = (
        "base_url",
        "rig_id",
        "on_queue_update",
        "on_connection_change",
        "_connection_state",
        "_rig_state",
        "_sio",
    )

    def __init__(self, on_queue_update: Optional[QueueUpdateCallback] = None) -> None:
        """
        Initialize the backend client.

        Args:
            on_queue_update: Callback function invoked when queue-update events are received.
        """
        self.base_url: str = config.BACKEND_BASE_URL
        self.rig_id: int = config.RIG_ID
        self.on_queue_update: Optional[QueueUpdateCallback] = on_queue_update
        self.on_connection_change: Optional[ConnectionChangeCallback] = None

        self._connection_state = ConnectionState()
        self._rig_state = RigState()

        self._sio = self._create_socket_client()
        self._register_socket_handlers()

        logger.debug("BackendClient initialized")
    
    # -------------------------------------------------------------------------
    # Properties for backward compatibility
    # -------------------------------------------------------------------------

    @property
    def connected(self) -> bool:
        """Whether the client is currently connected to the server."""
        return self._connection_state.connected

    @property
    def reconnect_attempts(self) -> int:
        """Number of reconnection attempts since last successful connection."""
        return self._connection_state.reconnect_attempts

    @property
    def current_rig_state(self) -> Optional[str]:
        """Current state of this rig (FREE or RACING)."""
        return self._rig_state.state

    @property
    def current_player(self) -> Optional[PlayerData]:
        """Current player assigned to this rig."""
        return self._rig_state.current_player

    @property
    def queue_length(self) -> int:
        """Number of players in this rig's queue."""
        return self._rig_state.queue_length

    @property
    def sio(self) -> socketio.Client:
        """The underlying Socket.IO client instance."""
        return self._sio

    # -------------------------------------------------------------------------
    # Socket.IO Client Setup
    # -------------------------------------------------------------------------

    def _create_socket_client(self) -> socketio.Client:
        """
        Create and configure a Socket.IO client instance.

        Returns:
            Configured Socket.IO client.
        """
        logger.debug("Creating Socket.IO client with reconnection settings:")
        logger.debug("  - reconnection: True")
        logger.debug("  - reconnection_attempts: 0 (infinite)")
        logger.debug("  - reconnection_delay: %ds", self.RECONNECTION_DELAY)
        logger.debug("  - reconnection_delay_max: %ds", self.MAX_RECONNECT_DELAY)

        return socketio.Client(
            reconnection=True,
            reconnection_attempts=0,  # Infinite attempts
            reconnection_delay=self.RECONNECTION_DELAY,
            reconnection_delay_max=self.MAX_RECONNECT_DELAY,
            logger=DEBUG_WEBSOCKET,
            engineio_logger=DEBUG_WEBSOCKET,
        )

    def _register_socket_handlers(self) -> None:
        """Register all Socket.IO event handlers."""
        logger.debug("Setting up Socket.IO event handlers...")

        self._sio.on("connect", self._on_connect)
        self._sio.on("disconnect", self._on_disconnect)
        self._sio.on("connect_error", self._on_connect_error)
        self._sio.on("*", self._on_catch_all)
        self._sio.on("queue-update", self._on_queue_update)

        logger.debug("Socket.IO event handlers registered")

    # -------------------------------------------------------------------------
    # Socket.IO Event Handlers
    # -------------------------------------------------------------------------

    def _on_connect(self) -> None:
        """Handle successful Socket.IO connection."""
        self._connection_state.connected = True
        self._connection_state.reconnect_attempts = 0

        logger.info("✓ Socket.IO CONNECTED to %s", self.base_url)
        logger.debug("  - Session ID (sid): %s", self._sio.sid)
        logger.debug("  - Transport: %s", self._sio.transport())
        print(f"✓ Connected to control server at {self.base_url}")

        self._notify_connection_change(connected=True)

    def _on_disconnect(self) -> None:
        """Handle Socket.IO disconnection."""
        self._connection_state.connected = False

        logger.warning("✗ Socket.IO DISCONNECTED")
        logger.debug("  - Was connected to: %s", self.base_url)
        print("✗ Disconnected from control server")

        self._notify_connection_change(connected=False)

    def _on_connect_error(self, data: Any) -> None:
        """
        Handle Socket.IO connection error.

        Args:
            data: Error data from the connection attempt.
        """
        self._connection_state.connected = False
        self._connection_state.reconnect_attempts += 1

        attempts = self._connection_state.reconnect_attempts
        delay = min(2 ** min(attempts, 5), self.MAX_RECONNECT_DELAY)

        logger.error("✗ Socket.IO CONNECTION ERROR (attempt %d)", attempts)
        logger.debug("  - Error data: %s", data)
        logger.debug("  - Next retry in: %ds", delay)
        logger.debug("  - Target URL: %s", self.base_url)
        print(f"✗ Connection error (attempt {attempts}), retrying in {delay}s...")

    def _on_catch_all(self, event: str, data: Any) -> None:
        """
        Handle unknown Socket.IO events for debugging.

        Args:
            event: The event name.
            data: The event payload.
        """
        logger.debug("📨 Received unknown event: '%s'", event)
        logger.debug("  - Data: %s", data)

    def _on_queue_update(self, data: dict[str, Any]) -> None:
        """
        Handle queue-update events from the backend.

        Expected payload format:
        {
            "rigs": [
                {
                    "id": 1,
                    "state": "FREE" | "RACING",
                    "currentPlayer": { "id": "...", "name": "...", "joinedAt": "..." } | null,
                    "queue": [...]
                }
            ]
        }

        Args:
            data: The queue update payload.
        """
        logger.debug("📨 Received 'queue-update' event")
        logger.debug("  - Raw data: %s", data)

        rigs = data.get("rigs", [])
        logger.debug("  - Total rigs in payload: %d", len(rigs))
        logger.debug("  - Looking for rig ID: %d", self.rig_id)

        my_rig = self._find_rig_in_payload(rigs)

        if my_rig is None:
            logger.warning("⚠ Rig %d not found in queue-update payload!", self.rig_id)
            logger.debug("  - Available rig IDs: %s", [r.get("id") for r in rigs])
            return

        self._update_rig_state(my_rig)
        self._notify_queue_update(my_rig)

    # -------------------------------------------------------------------------
    # Helper Methods
    # -------------------------------------------------------------------------

    def _find_rig_in_payload(self, rigs: list[RigData]) -> Optional[RigData]:
        """
        Find this rig's data in a list of rigs.

        Args:
            rigs: List of rig data dictionaries.

        Returns:
            This rig's data or None if not found.
        """
        return next((r for r in rigs if r["id"] == self.rig_id), None)

    def _update_rig_state(self, rig_data: RigData) -> None:
        """
        Update internal rig state from rig data.

        Args:
            rig_data: The rig data to update from.
        """
        logger.info(
            "📨 Queue update for rig %d: state=%s, queue_length=%d",
            self.rig_id,
            rig_data["state"],
            len(rig_data["queue"]),
        )
        logger.debug("  - Full rig data: %s", rig_data)

        self._rig_state.state = rig_data["state"]
        self._rig_state.current_player = rig_data["currentPlayer"]
        self._rig_state.queue_length = len(rig_data["queue"])

    def _notify_connection_change(self, connected: bool) -> None:
        """
        Notify the UI of a connection status change.

        Args:
            connected: The new connection status.
        """
        if self.on_connection_change:
            logger.debug("Notifying UI of connection status change (connected=%s)", connected)
            self.on_connection_change(connected)

    def _notify_queue_update(self, rig_data: RigData) -> None:
        """
        Notify the UI of a queue update.

        Args:
            rig_data: The updated rig data.
        """
        if self.on_queue_update:
            logger.debug("Calling on_queue_update callback...")
            self.on_queue_update(rig_data)
        else:
            logger.warning("No on_queue_update callback registered!")

    # -------------------------------------------------------------------------
    # Public Connection Methods
    # -------------------------------------------------------------------------

    def connect(self) -> bool:
        """
        Connect to the Socket.IO server.

        Returns:
            True if connection was successful, False otherwise.
        """
        try:
            logger.info("Attempting Socket.IO connection to %s...", self.base_url)
            logger.debug("  - Rig ID: %d", self.rig_id)
            logger.debug("  - Wait timeout: %ds", self.CONNECTION_TIMEOUT)

            self._sio.connect(self.base_url, wait_timeout=self.CONNECTION_TIMEOUT)

            logger.info("✓ Socket.IO connect() returned successfully")
            logger.debug("  - Connected: %s", self._sio.connected)
            logger.debug("  - Session ID: %s", self._sio.sid)

            return True

        except socketio.exceptions.ConnectionError as e:
            logger.error("❌ Socket.IO ConnectionError: %s", e)
            logger.debug("  - Target URL: %s", self.base_url)
            print(f"❌ Failed to connect to backend: {e}")
            return False

        except Exception as e:
            logger.error("❌ Unexpected error during connect: %s: %s", type(e).__name__, e)
            import traceback

            logger.debug("  - Traceback:\n%s", traceback.format_exc())
            print(f"❌ Failed to connect to backend: {e}")
            return False

    def disconnect(self) -> None:
        """Disconnect from the Socket.IO server."""
        logger.info("Disconnecting from Socket.IO server...")
        logger.debug("  - Currently connected: %s", self._sio.connected)

        if self._sio.connected:
            self._sio.disconnect()
            logger.info("Socket.IO disconnect() called")
        else:
            logger.debug("Already disconnected, skipping disconnect()")

    # -------------------------------------------------------------------------
    # HTTP Request Methods
    # -------------------------------------------------------------------------

    def _make_request(
        self,
        method: str,
        endpoint: str,
        json_data: Optional[dict[str, Any]] = None,
        max_retries: Optional[int] = None,
    ) -> Optional[dict[str, Any]]:
        """
        Make an HTTP request with retry logic.

        Args:
            method: HTTP method (GET, POST, etc.).
            endpoint: API endpoint (appended to base_url).
            json_data: JSON body for POST requests.
            max_retries: Maximum retry attempts (defaults to DEFAULT_MAX_RETRIES).

        Returns:
            Response JSON data or None if all retries failed.
        """
        if max_retries is None:
            max_retries = self.DEFAULT_MAX_RETRIES

        url = f"{self.base_url}{endpoint}"
        logger.debug("HTTP Request: %s %s", method, url)

        if json_data:
            logger.debug("  - Body: %s", json_data)

        for attempt in range(max_retries):
            result = self._attempt_request(method, url, json_data, attempt, max_retries)
            if result is not None:
                return result

            # Wait before retry (except on last attempt)
            if attempt < max_retries - 1:
                logger.debug("  - Waiting %ds before retry...", self.RETRY_DELAY)
                time.sleep(self.RETRY_DELAY)

        logger.error("❌ Request failed after %d attempts: %s %s", max_retries, method, endpoint)
        print(f"❌ Request failed after {max_retries} attempts: {method} {endpoint}")
        return None

    def _attempt_request(
        self,
        method: str,
        url: str,
        json_data: Optional[dict[str, Any]],
        attempt: int,
        max_retries: int,
    ) -> Optional[dict[str, Any]]:
        """
        Attempt a single HTTP request.

        Args:
            method: HTTP method.
            url: Full URL to request.
            json_data: JSON body for POST requests.
            attempt: Current attempt number (0-indexed).
            max_retries: Total number of retries allowed.

        Returns:
            Response JSON data, None if request failed but should retry,
            or None with error logged if request should not be retried.
        """
        try:
            logger.debug("  - Attempt %d/%d", attempt + 1, max_retries)

            response = requests.request(
                method=method,
                url=url,
                json=json_data,
                timeout=self.REQUEST_TIMEOUT,
            )

            return self._handle_response(response)

        except requests.exceptions.Timeout:
            self._log_retry_error("Request timeout", attempt, max_retries)
        except requests.exceptions.ConnectionError as e:
            self._log_retry_error(f"Connection error: {e}", attempt, max_retries)
        except Exception as e:
            self._log_retry_error(f"{type(e).__name__}: {e}", attempt, max_retries)

        return None

    def _handle_response(self, response: Response) -> Optional[dict[str, Any]]:
        """
        Handle an HTTP response.

        Args:
            response: The requests Response object.

        Returns:
            Parsed JSON data or None if response indicates an error.
        """
        logger.debug("  - Response status: %d", response.status_code)

        data = response.json()
        logger.debug("  - Response body: %s", data)

        if response.status_code >= 400:
            error_msg = data.get("message", "Unknown error")
            logger.error("❌ API Error (%d): %s", response.status_code, error_msg)
            print(f"❌ API Error ({response.status_code}): {error_msg}")
            return None

        logger.debug("  - Request successful")
        return data

    def _log_retry_error(self, message: str, attempt: int, max_retries: int) -> None:
        """
        Log a retry-able error.

        Args:
            message: Error message.
            attempt: Current attempt number (0-indexed).
            max_retries: Total number of retries allowed.
        """
        logger.warning("⚠ %s (attempt %d/%d)", message, attempt + 1, max_retries)
        print(f"⚠ {message} (attempt {attempt + 1}/{max_retries})")

    # -------------------------------------------------------------------------
    # Public API Methods
    # -------------------------------------------------------------------------

    def start_session(self, player_id: str) -> bool:
        """
        Start a racing session, transitioning the rig from FREE to RACING.

        Args:
            player_id: ID of the player starting the session.

        Returns:
            True if successful, False otherwise.
        """
        endpoint = f"/rigs/{self.rig_id}/state"
        data = {"state": "RACING", "playerId": player_id}

        response = self._make_request("POST", endpoint, json_data=data)

        if response and response.get("success"):
            print(f"✓ Session started for player ID: {player_id}")
            return True

        return False

    def complete_session(self) -> bool:
        """
        Complete the racing session, removing current player and setting rig to FREE.

        Returns:
            True if successful, False otherwise.
        """
        endpoint = f"/queue/complete/{self.rig_id}"
        response = self._make_request("POST", endpoint)

        if response and response.get("success"):
            print("✓ Session completed")
            return True

        return False

    def skip_player(self) -> bool:
        """
        Skip the current player in queue, removing them from queue and memory.

        Returns:
            True if successful, False otherwise.
        """
        endpoint = f"/queue/skip/{self.rig_id}"
        response = self._make_request("POST", endpoint)

        if response and response.get("success"):
            print("✓ Player skipped")
            return True

        return False

    def get_next_player(self) -> Optional[PlayerData]:
        """
        Get the next player in queue (fallback if Socket.IO is not working).

        Returns:
            Player data dictionary or None if no player available.
        """
        endpoint = f"/queue/next/{self.rig_id}"
        response = self._make_request("GET", endpoint)

        if response and response.get("success"):
            return response.get("responseObject", {}).get("player")

        return None

    def fetch_rig_state(self) -> Optional[RigData]:
        """
        Fetch current rig state from backend (used on startup to get initial state).

        Returns:
            Rig data dictionary or None if request failed.
        """
        endpoint = "/queue"
        response = self._make_request("GET", endpoint)

        if not response or not response.get("success"):
            return None

        rigs = response.get("responseObject", {}).get("rigs", [])
        my_rig = self._find_rig_in_payload(rigs)

        if my_rig:
            self._update_rig_state(my_rig)
            self._notify_queue_update(my_rig)

        return my_rig


# ---------------------------------------------------------------------------
# Main Entry Point (for testing)
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    def on_update(rig_data: RigData) -> None:
        """Handle queue updates during testing."""
        print(f"Queue update received: {rig_data}")

    client = BackendClient(on_queue_update=on_update)

    if client.connect():
        print("Client connected successfully")
        print("Press Ctrl+C to exit...")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down...")
            client.disconnect()
    else:
        print("Failed to connect to backend")
