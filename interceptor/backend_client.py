#!/usr/bin/env python3
"""
Backend Client for Race Interceptor
Handles REST API calls and Socket.IO real-time communication with control server
"""

import time
import requests
import socketio
from typing import Optional, Callable, Dict, Any
from config import config


class BackendClient:
    """Client for communicating with the control server backend"""
    
    def __init__(self, on_queue_update: Optional[Callable[[Dict[str, Any]], None]] = None):
        """
        Initialize backend client
        
        Args:
            on_queue_update: Callback function called when queue-update event is received
        """
        self.base_url = config.BACKEND_BASE_URL
        self.rig_id = config.RIG_ID
        self.on_queue_update = on_queue_update
        
        # Connection state
        self.connected = False
        self.reconnect_attempts = 0
        self.max_reconnect_delay = 30  # Maximum delay between reconnection attempts (seconds)
        
        # Current rig state (from Socket.IO events)
        self.current_rig_state = None
        self.current_player = None
        self.queue_length = 0
        
        # Socket.IO client
        self.sio = socketio.Client(
            reconnection=True,
            reconnection_attempts=0,  # Infinite attempts
            reconnection_delay=1,
            reconnection_delay_max=self.max_reconnect_delay,
            logger=False,
            engineio_logger=False
        )
        
        # Register event handlers
        self._setup_socket_handlers()
    
    def _setup_socket_handlers(self):
        """Setup Socket.IO event handlers"""
        
        @self.sio.event
        def connect():
            """Called when Socket.IO connection is established"""
            self.connected = True
            self.reconnect_attempts = 0
            print(f"✓ Connected to control server at {self.base_url}")
        
        @self.sio.event
        def disconnect():
            """Called when Socket.IO connection is lost"""
            self.connected = False
            print(f"✗ Disconnected from control server")
        
        @self.sio.event
        def connect_error(data):
            """Called when Socket.IO connection fails"""
            self.connected = False
            self.reconnect_attempts += 1
            delay = min(2 ** min(self.reconnect_attempts, 5), self.max_reconnect_delay)
            print(f"✗ Connection error (attempt {self.reconnect_attempts}), retrying in {delay}s...")
        
        @self.sio.on('queue-update')
        def on_queue_update(data):
            """
            Called when backend emits queue-update event
            
            Payload format:
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
            """
            # Find this rig's data
            rigs = data.get('rigs', [])
            my_rig = next((r for r in rigs if r['id'] == self.rig_id), None)
            
            if my_rig:
                self.current_rig_state = my_rig['state']
                self.current_player = my_rig['currentPlayer']
                self.queue_length = len(my_rig['queue'])
                
                # Call user-provided callback
                if self.on_queue_update:
                    self.on_queue_update(my_rig)
    
    def connect(self) -> bool:
        """
        Connect to Socket.IO server
        
        Returns:
            True if connection successful, False otherwise
        """
        try:
            print(f"Connecting to {self.base_url}...")
            self.sio.connect(self.base_url, wait_timeout=10)
            return True
        except Exception as e:
            print(f"❌ Failed to connect to backend: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from Socket.IO server"""
        if self.sio.connected:
            self.sio.disconnect()
    
    def _make_request(self, method: str, endpoint: str, json_data: Optional[Dict] = None, max_retries: int = 3) -> Optional[Dict]:
        """
        Make HTTP request with retry logic
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (will be appended to base_url)
            json_data: JSON body for POST requests
            max_retries: Maximum number of retry attempts
        
        Returns:
            Response JSON data or None if all retries failed
        """
        url = f"{self.base_url}{endpoint}"
        
        for attempt in range(max_retries):
            try:
                response = requests.request(
                    method=method,
                    url=url,
                    json=json_data,
                    timeout=5
                )
                
                # Parse response
                data = response.json()
                
                # Check if request was successful
                if response.status_code >= 400:
                    print(f"❌ API Error ({response.status_code}): {data.get('message', 'Unknown error')}")
                    return None
                
                return data
                
            except requests.exceptions.Timeout:
                print(f"⚠ Request timeout (attempt {attempt + 1}/{max_retries})")
            except requests.exceptions.ConnectionError:
                print(f"⚠ Connection error (attempt {attempt + 1}/{max_retries})")
            except Exception as e:
                print(f"⚠ Request error: {e} (attempt {attempt + 1}/{max_retries})")
            
            # Wait before retry (except on last attempt)
            if attempt < max_retries - 1:
                time.sleep(1)
        
        print(f"❌ Request failed after {max_retries} attempts: {method} {endpoint}")
        return None
    
    def start_session(self, player_id: str) -> bool:
        """
        Start racing session - transitions rig from FREE to RACING
        
        Args:
            player_id: ID of the player starting the session
        
        Returns:
            True if successful, False otherwise
        """
        endpoint = f"/rigs/{self.rig_id}/state"
        data = {
            "state": "RACING",
            "playerId": player_id
        }
        
        response = self._make_request("POST", endpoint, json_data=data)
        if response and response.get('success'):
            print(f"✓ Session started for player ID: {player_id}")
            return True
        
        return False
    
    def complete_session(self) -> bool:
        """
        Complete racing session - removes current player and sets rig to FREE
        
        Returns:
            True if successful, False otherwise
        """
        endpoint = f"/queue/complete/{self.rig_id}"
        
        response = self._make_request("POST", endpoint)
        if response and response.get('success'):
            print(f"✓ Session completed")
            return True
        
        return False
    
    def skip_player(self) -> bool:
        """
        Skip current player in queue - removes player from queue and memory
        
        Returns:
            True if successful, False otherwise
        """
        endpoint = f"/queue/skip/{self.rig_id}"
        
        response = self._make_request("POST", endpoint)
        if response and response.get('success'):
            print(f"✓ Player skipped")
            return True
        
        return False
    
    def get_next_player(self) -> Optional[Dict[str, Any]]:
        """
        Get next player in queue (fallback if Socket.IO not working)
        
        Returns:
            Player data dict or None if no player available
        """
        endpoint = f"/queue/next/{self.rig_id}"
        
        response = self._make_request("GET", endpoint)
        if response and response.get('success'):
            player = response.get('responseObject', {}).get('player')
            return player
        
        return None


if __name__ == "__main__":
    # Test backend client
    def on_update(rig_data):
        print(f"Queue update received: {rig_data}")
    
    client = BackendClient(on_queue_update=on_update)
    
    if client.connect():
        print("Client connected successfully")
        print("Press Ctrl+C to exit...")
        try:
            # Keep alive
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down...")
            client.disconnect()
    else:
        print("Failed to connect to backend")
