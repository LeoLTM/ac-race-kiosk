#!/usr/bin/env python3
"""
Assetto Corsa Race Cafe Kiosk
==============================
A kiosk-style interface for race cafes where multiple players can quickly
register their nickname before racing.

This works by:
1. Player enters their nickname
2. Monitoring race.ini for changes
3. Immediately replacing the driver name when CM writes the file
4. Auto-clearing the field for the next player

Usage:
    python ac_nickname_interceptor.py
    
Perfect for race cafes, LAN parties, and shared racing setups!
"""

import os
import sys
import time
import configparser
import tkinter as tk
from tkinter import ttk, messagebox
from pathlib import Path
import json
import threading
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler


class RaceIniHandler(FileSystemEventHandler):
    """Handles race.ini file modification events"""
    
    def __init__(self, get_nickname_callback, on_complete_callback):
        self.get_nickname = get_nickname_callback
        self.on_complete = on_complete_callback
        self.last_modified_time = 0
        
    def on_modified(self, event):
        if event.is_directory:
            return
        
        if event.src_path.endswith('race.ini'):
            # Debounce multiple events
            current_time = time.time()
            if current_time - self.last_modified_time < 0.5:
                return
            
            self.last_modified_time = current_time
            print(f"race.ini modified, intercepting...")
            
            # Small delay to ensure CM finished writing
            time.sleep(0.15)
            
            # Get the current nickname
            nickname = self.get_nickname()
            if nickname:
                self.modify_race_ini(nickname)
                if self.on_complete:
                    self.on_complete()
    
    def modify_race_ini(self, nickname):
        """Modify the race.ini file with the new nickname"""
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
                    print(f"Changed driver name: '{old_name}' -> '{nickname}'")
                # Modify NAME in REMOTE section
                elif current_section == 'REMOTE' and line.strip().startswith('NAME='):
                    modified_lines.append(f'NAME={nickname}\n')
                    print(f"Changed remote name to: '{nickname}'")
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
            
            print("Successfully intercepted and modified race.ini!")
            
        except Exception as e:
            print(f"Error modifying race.ini: {e}")
            import traceback
            traceback.print_exc()


class NicknameInterceptorUI:
    def __init__(self):
        self.window = tk.Tk()
        self.window.title("Assetto Corsa Race Kiosk")
        self.window.geometry("800x700")
        self.window.resizable(True, True)
        self.window.minsize(750, 650)
        
        # Kiosk mode styling
        self.window.configure(bg='#1a1a2e')
        
        # Center window
        self.window.update_idletasks()
        x = (self.window.winfo_screenwidth() // 2) - (800 // 2)
        y = (self.window.winfo_screenheight() // 2) - (700 // 2)
        self.window.geometry(f'+{x}+{y}')
        
        # Paths
        self.documents_path = Path(os.path.expanduser("~")) / "Documents" / "Assetto Corsa"
        self.race_ini_path = self.documents_path / "cfg" / "race.ini"
        self.config_path = Path(__file__).parent / "nickname_config.json"
        
        # State
        self.observer = None
        self.monitoring = False
        self.nickname_set = False
        self.race_count = 0
        self.current_racer = ""
        self.event_handler = None
        
        # Load config
        self.saved_nicknames = self.load_saved_nicknames()
        
        # Configure styles
        self.setup_styles()
        
        self.setup_ui()
        
        # Auto-start monitoring on launch
        self.window.after(500, self.auto_start_monitoring)
        
    def load_saved_nicknames(self):
        """Load previously saved nicknames"""
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data.get('nicknames', [])
            except:
                pass
        return []
    
    def save_nicknames_list(self, nickname):
        """Save nickname to history"""
        if nickname not in self.saved_nicknames:
            self.saved_nicknames.insert(0, nickname)
            self.saved_nicknames = self.saved_nicknames[:20]
        
        try:
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump({'nicknames': self.saved_nicknames}, f, indent=2)
        except Exception as e:
            print(f"Warning: Could not save nicknames: {e}")
    
    def setup_styles(self):
        """Configure kiosk-style theme"""
        style = ttk.Style()
        style.theme_use('clam')
        
        # Custom colors for race cafe theme
        bg_color = '#1a1a2e'
        frame_bg = '#16213e'
        accent_color = '#0f3460'
        text_color = '#e94560'
        success_color = '#00ff41'
        
        style.configure('Kiosk.TFrame', background=bg_color)
        style.configure('KioskInner.TFrame', background=frame_bg)
        style.configure('Kiosk.TLabel', 
                       background=bg_color, 
                       foreground='white',
                       font=('Arial', 10))
        style.configure('Title.TLabel',
                       background=bg_color,
                       foreground=text_color,
                       font=('Arial Black', 24, 'bold'))
        style.configure('Subtitle.TLabel',
                       background=bg_color,
                       foreground='white',
                       font=('Arial', 11))
        style.configure('KioskInner.TLabel',
                       background=frame_bg,
                       foreground='white')
        style.configure('Status.TLabel',
                       background=frame_bg,
                       foreground='#aaaaaa',
                       font=('Arial', 11))
        style.configure('Success.TLabel',
                       background=frame_bg,
                       foreground=success_color,
                       font=('Arial', 12, 'bold'))
        style.configure('Count.TLabel',
                       background=bg_color,
                       foreground=text_color,
                       font=('Arial', 14, 'bold'))
        
        style.configure('Kiosk.TLabelframe',
                       background=frame_bg,
                       foreground='white',
                       borderwidth=2,
                       relief='solid')
        style.configure('Kiosk.TLabelframe.Label',
                       background=frame_bg,
                       foreground=text_color,
                       font=('Arial', 12, 'bold'))
    
    def setup_ui(self):
        """Create the kiosk-style user interface"""
        main_frame = ttk.Frame(self.window, padding="25", style='Kiosk.TFrame')
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        main_frame.columnconfigure(0, weight=1)
        
        # Title
        title_label = ttk.Label(
            main_frame,
            text="Assetto Corsa Race Cafe Kiosk",
            style='Title.TLabel'
        )
        title_label.grid(row=0, column=0, pady=(0, 5))
        
        # Subtitle
        subtitle_label = ttk.Label(
            main_frame,
            text="Enter Your Racing Name",
            style='Subtitle.TLabel'
        )
        subtitle_label.grid(row=1, column=0, pady=(0, 25))
        
        # Nickname input frame
        nickname_frame = ttk.LabelFrame(
            main_frame, 
            text="RACER NAME", 
            padding="20",
            style='Kiosk.TLabelframe'
        )
        nickname_frame.grid(row=2, column=0, sticky=(tk.W, tk.E), pady=(0, 20))
        nickname_frame.columnconfigure(0, weight=1)
        
        self.nickname_var = tk.StringVar()
        self.nickname_entry = tk.Entry(
            nickname_frame,
            textvariable=self.nickname_var,
            font=('Arial Black', 18),
            bg='#0f3460',
            fg='white',
            insertbackground='white',
            relief='flat',
            justify='center',
            bd=3
        )
        self.nickname_entry.grid(row=0, column=0, sticky=(tk.W, tk.E), ipady=12)
        self.nickname_entry.focus()
        
        # Bind Enter key
        self.nickname_entry.bind('<Return>', lambda e: self.register_player())
        
        # Quick select frame (recent players)
        if self.saved_nicknames:
            quick_frame = ttk.LabelFrame(
                main_frame,
                text="RECENT RACERS",
                padding="15",
                style='Kiosk.TLabelframe'
            )
            quick_frame.grid(row=3, column=0, sticky=(tk.W, tk.E), pady=(0, 20))
            quick_frame.columnconfigure(0, weight=1)
            
            # Create buttons for recent nicknames
            button_container = ttk.Frame(quick_frame, style='KioskInner.TFrame')
            button_container.grid(row=0, column=0, sticky=(tk.W, tk.E))
            
            for i, nickname in enumerate(self.saved_nicknames[:6]):
                btn = tk.Button(
                    button_container,
                    text=nickname,
                    command=lambda n=nickname: self.quick_select(n),
                    bg='#0f3460',
                    fg='white',
                    font=('Arial', 10, 'bold'),
                    relief='raised',
                    bd=2,
                    padx=15,
                    pady=8,
                    cursor='hand2'
                )
                btn.grid(row=i//3, column=i%3, padx=5, pady=5, sticky=(tk.W, tk.E))
                button_container.columnconfigure(i%3, weight=1)
        
        # Status display
        status_frame = ttk.LabelFrame(
            main_frame,
            text="STATUS",
            padding="20",
            style='Kiosk.TLabelframe'
        )
        status_frame.grid(row=4, column=0, sticky=(tk.W, tk.E), pady=(0, 20))
        
        self.status_label = ttk.Label(
            status_frame,
            text="Ready - Waiting for racer...",
            style='Status.TLabel',
            justify=tk.CENTER
        )
        self.status_label.grid(row=0, column=0, sticky=(tk.W, tk.E))
        
        # Progress bar
        self.progress = ttk.Progressbar(
            status_frame,
            mode='indeterminate',
            length=400
        )
        
        # Race counter
        self.counter_label = ttk.Label(
            main_frame,
            text=f"Races Today: {self.race_count}",
            style='Count.TLabel'
        )
        self.counter_label.grid(row=5, column=0, pady=(10, 0))
        
        # Instructions
        instructions = ttk.Label(
            main_frame,
            text="Type your name and press ENTER or click a recent name\n" +
                 "The system will automatically update your name when you start racing!",
            style='Kiosk.TLabel',
            justify=tk.CENTER
        )
        instructions.grid(row=6, column=0, pady=(15, 0))
        
        # Configure grid
        self.window.columnconfigure(0, weight=1)
        self.window.rowconfigure(0, weight=1)
        main_frame.rowconfigure(3, weight=1)
    
    
    def quick_select(self, nickname):
        """Quick select a recent nickname"""
        self.nickname_var.set(nickname)
        self.nickname_entry.focus()
        self.register_player()
    
    def auto_start_monitoring(self):
        """Auto-start monitoring on launch"""
        if not self.monitoring:
            self.start_monitoring_silent()
    
    def register_player(self):
        """Register current player and prepare for race"""
        nickname = self.nickname_var.get().strip()
        
        if not nickname:
            self.nickname_entry.configure(bg='#8b0000')
            self.window.after(200, lambda: self.nickname_entry.configure(bg='#0f3460'))
            return
        
        # Store current racer
        self.current_racer = nickname
        
        # Save nickname
        self.save_nicknames_list(nickname)
        
        # Ensure monitoring is running
        if not self.monitoring:
            self.start_monitoring_silent()
        
        # Update UI for active racer
        self.status_label.config(
            text=f"{nickname} registered - Start your race in Content Manager!",
            style='Success.TLabel'
        )
        
        print(f">>> Racer registered: {nickname}")
        print(f">>> Waiting for Content Manager to start race...")
    
    def get_current_nickname(self):
        """Get the currently registered nickname"""
        return self.current_racer if self.current_racer else self.nickname_var.get().strip()
    
    def prepare_for_next_player(self):
        """Clear the field and prepare for the next player"""
        # Clear current racer
        self.current_racer = ""
        
        # Clear nickname field
        self.nickname_var.set('')
        
        # Reset UI
        self.status_label.config(
            text="Ready - Waiting for next racer...",
            style='Status.TLabel'
        )
        
        # Focus on entry
        self.nickname_entry.focus()
        
        print(">>> Ready for next racer")
    
    def start_monitoring_silent(self):
        """Start monitoring without UI changes (background mode)"""
        if self.monitoring:
            return
            
        # Ensure directory exists
        cfg_dir = self.race_ini_path.parent
        cfg_dir.mkdir(parents=True, exist_ok=True)
        
        # Setup file watcher with callback to get current nickname
        self.event_handler = RaceIniHandler(
            get_nickname_callback=self.get_current_nickname,
            on_complete_callback=self.on_race_started
        )
        self.observer = Observer()
        self.observer.schedule(self.event_handler, str(cfg_dir), recursive=False)
        self.observer.start()
        
        self.monitoring = True
        print(f">>> Background monitoring active...")
    
    def start_monitoring(self):
        """Start monitoring race.ini for changes"""
        nickname = self.nickname_var.get().strip()
        
        if not nickname:
            messagebox.showwarning("No Nickname", "Please enter a nickname first!")
            return
        
        # Store current racer
        self.current_racer = nickname
        
        # Save nickname
        self.save_nicknames_list(nickname)
        
        # Ensure directory exists
        cfg_dir = self.race_ini_path.parent
        cfg_dir.mkdir(parents=True, exist_ok=True)
        
        # Setup file watcher
        self.event_handler = RaceIniHandler(
            get_nickname_callback=self.get_current_nickname,
            on_complete_callback=self.on_race_started
        )
        self.observer = Observer()
        self.observer.schedule(self.event_handler, str(cfg_dir), recursive=False)
        self.observer.start()
        
        self.monitoring = True
        self.nickname_set = False
        
        # Update UI
        self.status_label.config(
            text=f"{nickname} is ready to race!",
            style='Success.TLabel'
        )
        self.progress.grid(row=1, column=0, pady=(10, 0))
        self.progress.start(10)
        
        print(f">>> Monitoring race.ini for changes...")
        print(f">>> Will change driver name to: {nickname}")
        print(">>> Now click 'Start' in Content Manager!")
    
    def on_race_started(self):
        """Called when race starts (file intercepted)"""
        self.nickname_set = True
        self.race_count += 1
        self.window.after(100, self.update_after_race_start)
    
    def update_after_race_start(self):
        """Update UI after race starts"""
        self.progress.stop()
        self.progress.grid_remove()
        
        racer_name = self.current_racer if self.current_racer else "Racer"
        
        self.status_label.config(
            text=f"{racer_name} is racing! Good luck!",
            style='Success.TLabel'
        )
        
        # Update counter
        self.counter_label.config(text=f"Races Today: {self.race_count}")
        
        print(f">>> {racer_name} is now racing!")
        
        # Prepare for next racer after a delay
        self.window.after(4000, self.prepare_for_next_player)
    
    def stop_monitoring(self):
        """Stop monitoring race.ini"""
        if self.observer:
            self.observer.stop()
            self.observer.join()
            self.observer = None
        
        self.monitoring = False
        print("Monitoring stopped")
    
    def run(self):
        """Run the application"""
        # Handle window close
        self.window.protocol("WM_DELETE_WINDOW", self.on_closing)
        self.window.mainloop()
    
    def on_closing(self):
        """Handle window close event"""
        self.stop_monitoring()
        self.window.destroy()


def check_dependencies():
    """Check if required dependencies are installed"""
    try:
        import watchdog
    except ImportError:
        print("ERROR: Required package 'watchdog' is not installed!")
        print("\nPlease install it using:")
        print("    pip install watchdog")
        print("\nOr:")
        print("    python -m pip install watchdog")
        return False
    return True


def main():
    """Main entry point"""
    if not check_dependencies():
        input("\nPress Enter to exit...")
        return 1
    
    app = NicknameInterceptorUI()
    app.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
