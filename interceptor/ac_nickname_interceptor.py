#!/usr/bin/env python3
"""
Assetto Corsa Race Interceptor Client
======================================
Client application for racing rigs that integrates with the control server backend.

This works by:
1. Connecting to control server via Socket.IO for real-time queue updates
2. Displaying next player from queue when available
3. Starting "hot phase" watchdog when user clicks "Start Race"
4. Intercepting Content Manager's race.ini writes to inject queued player name
5. Returning to FREE state when user clicks "End Session"

Usage:
    python ac_nickname_interceptor.py
    
Requires:
    - .env file with BACKEND_URL, BACKEND_PORT, and RIG_ID
    - Control server backend running and accessible
"""

import os
import sys
import time
import tkinter as tk
from tkinter import ttk, messagebox
from pathlib import Path
import threading
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# Import local modules
from config import config
from backend_client import BackendClient


class RaceIniHandler(FileSystemEventHandler):
    """Handles race.ini file modification events during 'hot phase'"""
    
    def __init__(self, player_name: str, on_injection_complete):
        """
        Initialize handler
        
        Args:
            player_name: Name of player to inject into race.ini
            on_injection_complete: Callback to call after successful injection
        """
        self.player_name = player_name
        self.on_injection_complete = on_injection_complete
        self.last_modified_time = 0
        self.injection_completed = False
        
    def on_modified(self, event):
        if event.is_directory or self.injection_completed:
            return
        
        if event.src_path.endswith('race.ini'):
            # Debounce multiple events
            current_time = time.time()
            if current_time - self.last_modified_time < 0.5:
                return
            
            self.last_modified_time = current_time
            print(f">>> race.ini modified, intercepting...")
            
            # Small delay to ensure CM finished writing
            time.sleep(0.15)
            
            # Inject player name
            if self.modify_race_ini(self.player_name):
                self.injection_completed = True
                if self.on_injection_complete:
                    self.on_injection_complete()
    
    def modify_race_ini(self, nickname):
        """
        Modify the race.ini file with the new nickname
        
        Returns:
            True if successful, False otherwise
        """
        race_ini_path = Path(os.path.expanduser("~")) / "Documents" / "Assetto Corsa" / "cfg" / "race.ini"
        
        try:
            # Ensure we have a proper Path object
            race_ini_path = Path(race_ini_path)
            
            # Read the file as text to preserve exact formatting
            lines = []
            max_retries = 5
            for attempt in range(max_retries):
                try:
                    with open(str(race_ini_path), 'r', encoding='utf-8', errors='ignore') as f:
                        lines = f.readlines()
                    break
                except (PermissionError, OSError) as e:
                    if attempt < max_retries - 1:
                        time.sleep(0.1)
                    else:
                        raise
            
            # Track what we're modifying
            current_section = None
            modified_lines = []
            old_name = None
            
            for line in lines:
                # Remove any null bytes or invalid characters
                line = line.replace('\x00', '')
                
                # Track current section
                if line.strip().startswith('[') and line.strip().endswith(']'):
                    current_section = line.strip()[1:-1]
                    modified_lines.append(line)
                    continue
                
                # Modify DRIVER_NAME in CAR_0 section
                if current_section == 'CAR_0' and line.strip().startswith('DRIVER_NAME='):
                    old_name = line.split('=', 1)[1].strip()
                    modified_lines.append(f'DRIVER_NAME={nickname}\n')
                    print(f">>> Changed driver name: '{old_name}' -> '{nickname}'")
                # Modify NAME in REMOTE section
                elif current_section == 'REMOTE' and line.strip().startswith('NAME='):
                    modified_lines.append(f'NAME={nickname}\n')
                    print(f">>> Changed remote name to: '{nickname}'")
                else:
                    # Keep line exactly as is
                    modified_lines.append(line)
            
            # Write back with exact formatting preserved - retry if file is locked
            for attempt in range(max_retries):
                try:
                    with open(str(race_ini_path), 'w', encoding='utf-8', errors='ignore') as f:
                        f.writelines(modified_lines)
                    break
                except (PermissionError, OSError) as e:
                    if attempt < max_retries - 1:
                        time.sleep(0.1)
                    else:
                        raise
            
            print(">>> Successfully intercepted and modified race.ini!")
            return True
            
        except Exception as e:
            print(f"❌ Error modifying race.ini: {e}")
            import traceback
            traceback.print_exc()
            return False


class RaceInterceptorUI:
    """Minimal UI for race interceptor with backend integration"""
    
    def __init__(self):
        self.window = tk.Tk()
        self.window.title(f"Race Interceptor - Rig {config.RIG_ID}")
        self.window.geometry("600x400")
        self.window.resizable(False, False)
        
        # Dark theme styling
        self.window.configure(bg='#1a1a2e')
        
        # Center window
        self.window.update_idletasks()
        x = (self.window.winfo_screenwidth() // 2) - (600 // 2)
        y = (self.window.winfo_screenheight() // 2) - (400 // 2)
        self.window.geometry(f'+{x}+{y}')
        
        # Paths
        self.documents_path = Path(os.path.expanduser("~")) / "Documents" / "Assetto Corsa"
        self.race_ini_path = self.documents_path / "cfg" / "race.ini"
        
        # State
        self.observer = None
        self.event_handler = None
        self.rig_state = "FREE"  # FREE or RACING
        self.next_player = None  # Next player in queue
        self.queue_length = 0
        
        # Backend client
        self.backend = BackendClient(on_queue_update=self.on_queue_update)
        
        # Configure styles
        self.setup_styles()
        
        # Create UI
        self.setup_ui()
        
        # Connect to backend
        self.window.after(500, self.connect_to_backend)
        
    def setup_styles(self):
        """Configure minimal dark theme"""
        style = ttk.Style()
        style.theme_use('clam')
        
        # Colors
        bg_color = '#1a1a2e'
        frame_bg = '#16213e'
        text_color = '#e94560'
        success_color = '#00ff41'
        warning_color = '#ffa500'
        
        style.configure('Main.TFrame', background=bg_color)
        style.configure('Inner.TFrame', background=frame_bg)
        style.configure('Title.TLabel',
                       background=bg_color,
                       foreground=text_color,
                       font=('Arial Black', 20, 'bold'))
        style.configure('Status.TLabel',
                       background=frame_bg,
                       foreground='#aaaaaa',
                       font=('Arial', 12))
        style.configure('Player.TLabel',
                       background=frame_bg,
                       foreground='white',
                       font=('Arial', 16, 'bold'))
        style.configure('Queue.TLabel',
                       background=frame_bg,
                       foreground=warning_color,
                       font=('Arial', 11))
        style.configure('Connected.TLabel',
                       background=frame_bg,
                       foreground=success_color,
                       font=('Arial', 10, 'bold'))
        style.configure('Disconnected.TLabel',
                       background=frame_bg,
                       foreground='#ff0000',
                       font=('Arial', 10, 'bold'))
    
    def setup_ui(self):
        """Create minimal status display UI"""
        main_frame = ttk.Frame(self.window, padding="30", style='Main.TFrame')
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        main_frame.columnconfigure(0, weight=1)
        
        # Title
        title_label = ttk.Label(
            main_frame,
            text=f"Racing Rig {config.RIG_ID}",
            style='Title.TLabel'
        )
        title_label.grid(row=0, column=0, pady=(0, 30))
        
        # Status frame
        status_frame = ttk.Frame(main_frame, padding="25", style='Inner.TFrame')
        status_frame.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=(0, 20))
        status_frame.columnconfigure(0, weight=1)
        
        # Connection status
        self.connection_label = ttk.Label(
            status_frame,
            text="● Disconnected",
            style='Disconnected.TLabel'
        )
        self.connection_label.grid(row=0, column=0, pady=(0, 15))
        
        # Player name
        self.player_label = ttk.Label(
            status_frame,
            text="Waiting for player...",
            style='Player.TLabel'
        )
        self.player_label.grid(row=1, column=0, pady=(0, 10))
        
        # Queue depth
        self.queue_label = ttk.Label(
            status_frame,
            text="Queue: 0 players waiting",
            style='Queue.TLabel'
        )
        self.queue_label.grid(row=2, column=0, pady=(0, 20))
        
        # Rig state indicator
        self.state_label = ttk.Label(
            status_frame,
            text="State: FREE",
            style='Status.TLabel'
        )
        self.state_label.grid(row=3, column=0)
        
        # Button frame
        button_frame = ttk.Frame(main_frame, style='Main.TFrame')
        button_frame.grid(row=2, column=0, sticky=(tk.W, tk.E))
        button_frame.columnconfigure(0, weight=1)
        button_frame.columnconfigure(1, weight=1)
        
        # Start Race button
        self.start_button = tk.Button(
            button_frame,
            text="Start Race",
            command=self.on_start_race,
            bg='#00aa00',
            fg='white',
            font=('Arial', 12, 'bold'),
            relief='raised',
            bd=3,
            padx=20,
            pady=15,
            cursor='hand2',
            state='disabled'
        )
        self.start_button.grid(row=0, column=0, padx=(0, 10), sticky=(tk.W, tk.E))
        
        # Skip Player button
        self.skip_button = tk.Button(
            button_frame,
            text="Skip Player",
            command=self.on_skip_player,
            bg='#aa5500',
            fg='white',
            font=('Arial', 12, 'bold'),
            relief='raised',
            bd=3,
            padx=20,
            pady=15,
            cursor='hand2',
            state='disabled'
        )
        self.skip_button.grid(row=0, column=1, padx=(10, 0), sticky=(tk.W, tk.E))
        
        # End Session button (only visible when RACING)
        self.end_button = tk.Button(
            button_frame,
            text="End Session",
            command=self.on_end_session,
            bg='#aa0000',
            fg='white',
            font=('Arial', 12, 'bold'),
            relief='raised',
            bd=3,
            padx=20,
            pady=15,
            cursor='hand2'
        )
        # Don't grid it yet - only show when RACING
        
        # Configure grid weights
        self.window.columnconfigure(0, weight=1)
        self.window.rowconfigure(0, weight=1)
    
    def connect_to_backend(self):
        """Connect to backend server"""
        print(f"Connecting to backend at {config.BACKEND_BASE_URL}...")
        if self.backend.connect():
            self.update_connection_status(True)
        else:
            self.update_connection_status(False)
            # Retry connection after 5 seconds
            self.window.after(5000, self.connect_to_backend)
    
    def update_connection_status(self, connected: bool):
        """Update connection status indicator"""
        if connected:
            self.connection_label.config(
                text="● Connected",
                style='Connected.TLabel'
            )
        else:
            self.connection_label.config(
                text="● Disconnected",
                style='Disconnected.TLabel'
            )
    
    def on_queue_update(self, rig_data):
        """
        Called when queue-update event is received from backend
        
        Args:
            rig_data: Rig state data from backend
        """
        # Update state from backend
        self.rig_state = rig_data.get('state', 'FREE')
        current_player = rig_data.get('currentPlayer')
        queue = rig_data.get('queue', [])
        
        self.queue_length = len(queue)
        self.next_player = queue[0] if queue else None
        
        # Update UI on main thread
        self.window.after(0, self.update_ui)
    
    def update_ui(self):
        """Update UI based on current state"""
        # Update state label
        self.state_label.config(text=f"State: {self.rig_state}")
        
        # Update queue depth
        self.queue_label.config(text=f"Queue: {self.queue_length} player{'s' if self.queue_length != 1 else ''} waiting")
        
        if self.rig_state == "RACING":
            # Racing state - show end session button only
            self.player_label.config(text="Racing in progress...")
            self.start_button.grid_remove()
            self.skip_button.grid_remove()
            self.end_button.grid(row=0, column=0, columnspan=2, sticky=(tk.W, tk.E))
            
        elif self.next_player:
            # Player available - show player name and enable buttons
            player_name = self.next_player.get('name', 'Unknown')
            self.player_label.config(text=f"Next: {player_name}")
            self.start_button.config(state='normal')
            self.skip_button.config(state='normal')
            self.end_button.grid_remove()
            self.start_button.grid(row=0, column=0, padx=(0, 10), sticky=(tk.W, tk.E))
            self.skip_button.grid(row=0, column=1, padx=(10, 0), sticky=(tk.W, tk.E))
            
        else:
            # No player - disable buttons
            self.player_label.config(text="Waiting for player...")
            self.start_button.config(state='disabled')
            self.skip_button.config(state='disabled')
            self.end_button.grid_remove()
            self.start_button.grid(row=0, column=0, padx=(0, 10), sticky=(tk.W, tk.E))
            self.skip_button.grid(row=0, column=1, padx=(10, 0), sticky=(tk.W, tk.E))
    
    def on_start_race(self):
        """Called when user clicks Start Race button"""
        if not self.next_player:
            return
        
        player_id = self.next_player.get('id')
        player_name = self.next_player.get('name')
        
        print(f"\n>>> Starting race for: {player_name}")
        
        # Transition to RACING state
        if self.backend.start_session(player_id):
            # Start watchdog in hot phase
            self.start_watchdog(player_name)
        else:
            messagebox.showerror("Error", "Failed to start session. Please try again.")
    
    def on_skip_player(self):
        """Called when user clicks Skip Player button"""
        if not self.next_player:
            return
        
        player_name = self.next_player.get('name')
        
        # Confirm skip
        result = messagebox.askyesno(
            "Skip Player",
            f"Skip {player_name}?\n\nThis will remove them from the queue."
        )
        
        if result:
            print(f"\n>>> Skipping player: {player_name}")
            if not self.backend.skip_player():
                messagebox.showerror("Error", "Failed to skip player. Please try again.")
    
    def on_end_session(self):
        """Called when user clicks End Session button"""
        print(f"\n>>> Ending session")
        
        if self.backend.complete_session():
            print(">>> Session ended, rig now FREE")
        else:
            messagebox.showerror("Error", "Failed to end session. Please try again.")
    
    def start_watchdog(self, player_name: str):
        """
        Start watchdog in 'hot phase' to intercept race.ini
        
        Args:
            player_name: Name of player to inject
        """
        # Ensure directory exists
        cfg_dir = self.race_ini_path.parent
        cfg_dir.mkdir(parents=True, exist_ok=True)
        
        # Create event handler
        self.event_handler = RaceIniHandler(
            player_name=player_name,
            on_injection_complete=self.on_injection_complete
        )
        
        # Start observer
        self.observer = Observer()
        self.observer.schedule(self.event_handler, str(cfg_dir), recursive=False)
        self.observer.start()
        
        print(f">>> Watchdog active - waiting for Content Manager to write race.ini...")
        print(f">>> Will inject player name: {player_name}")
    
    def stop_watchdog(self):
        """Stop watchdog observer"""
        if self.observer:
            self.observer.stop()
            self.observer.join()
            self.observer = None
            print(">>> Watchdog stopped")
    
    def on_injection_complete(self):
        """Called after successful race.ini injection"""
        print(">>> Injection complete, stopping watchdog")
        
        # Stop watchdog on main thread
        self.window.after(0, self.stop_watchdog)
        
        # Update UI to show racing in progress
        self.window.after(0, lambda: self.player_label.config(text="Name injected! Racing in progress..."))
    
    def run(self):
        """Run the application"""
        self.window.protocol("WM_DELETE_WINDOW", self.on_closing)
        self.window.mainloop()
    
    def on_closing(self):
        """Handle window close event"""
        print("\nShutting down...")
        self.stop_watchdog()
        self.backend.disconnect()
        self.window.destroy()


def check_dependencies():
    """Check if required dependencies are installed"""
    missing = []
    
    try:
        import watchdog
    except ImportError:
        missing.append("watchdog")
    
    try:
        import requests
    except ImportError:
        missing.append("requests")
    
    try:
        import dotenv
    except ImportError:
        missing.append("python-dotenv")
    
    try:
        import socketio
    except ImportError:
        missing.append("python-socketio[client]")
    
    if missing:
        print("❌ ERROR: Required packages are not installed!")
        print("\nMissing packages:")
        for pkg in missing:
            print(f"  - {pkg}")
        print("\nPlease install them using:")
        print("    pip install -r requirements.txt")
        print("\nOr:")
        print("    python -m pip install -r requirements.txt")
        return False
    
    return True


def main():
    """Main entry point"""
    print("=" * 60)
    print(f"Assetto Corsa Race Interceptor - Rig {config.RIG_ID}")
    print("=" * 60)
    print(f"Backend: {config.BACKEND_BASE_URL}")
    print("=" * 60)
    print()
    
    if not check_dependencies():
        input("\nPress Enter to exit...")
        return 1
    
    app = RaceInterceptorUI()
    app.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
