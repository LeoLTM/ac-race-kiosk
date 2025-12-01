"""
Assetto Corsa Server Auto-Joiner
Automates joining AC online servers by creating race.ini and launching the game
"""

import os
import sys
import subprocess
import configparser
import time
import threading
from pathlib import Path
from typing import Optional
import socket


class AssettoCorsaServerJoiner:
    def __init__(self):
        # Find AC installation path
        self.ac_root = self.find_ac_installation()
        if not self.ac_root:
            raise Exception("Could not find Assetto Corsa installation")
        
        # Documents path for configuration
        self.documents_path = Path(os.path.expanduser("~")) / "Documents" / "Assetto Corsa"
        self.cfg_path = self.documents_path / "cfg"
        self.race_ini_path = self.cfg_path / "race.ini"
        
        # Ensure directories exist
        self.cfg_path.mkdir(parents=True, exist_ok=True)
    
    def find_ac_installation(self) -> Optional[Path]:
        """Try to find Assetto Corsa installation directory"""
        possible_paths = [
            Path("D:/03_Software/Steam/steamapps/common/assettocorsa"),
            Path("C:/Program Files (x86)/Steam/steamapps/common/assettocorsa"),
            Path("D:/SteamLibrary/steamapps/common/assettocorsa"),
            Path("C:/Steam/steamapps/common/assettocorsa"),
            Path(os.environ.get("AC_ROOT", "")),
        ]
        
        for path in possible_paths:
            if path.exists() and (path / "acs.exe").exists():
                print(f"Found AC installation at: {path}")
                return path
        
        return None
    
    def resolve_ip(self, hostname: str) -> str:
        """Resolve hostname to IP address"""
        try:
            return socket.gethostbyname(hostname)
        except socket.gaierror:
            return hostname
    
    def create_race_ini(self, server_config: dict):
        """
        Create race.ini file with server connection details
        
        server_config should contain:
        - server_ip: str
        - server_port: int (default 9600)
        - server_http_port: int (default 8081)
        - server_name: str
        - car_id: str
        - car_skin: str (optional)
        - steam_id: str
        - driver_name: str
        - nationality: str (optional)
        """
        
        # Resolve IP if hostname is provided
        server_ip = self.resolve_ip(server_config.get('server_ip'))
        
        config = configparser.ConfigParser()
        config.optionxform = str  # Preserve case
        
        # HEADER section
        config['HEADER'] = {
            'VERSION': '1',
            'PRESET': '0'
        }
        
        # RACE section
        config['RACE'] = {
            'CARS': '1',
            'AI_LEVEL': '100',
            'DRIFT_MODE': '0',
            'RACE_LAPS': '5',
            'REVERSED_GRID_RACE_POSITIONS': '0',
            'PENALTIES': '1',
            'DAMAGE': '100',
            'TYRE_BLANKETS': '0',
            'JUMP_START_PENALTY': '0',
            'FORCE_VIRTUAL_MIRROR': '0'
        }
        
        # REMOTE section - Server connection info
        config['REMOTE'] = {
            'ACTIVE': '1',
            'SERVER_IP': server_ip,
            'SERVER_PORT': str(server_config.get('server_port', 9600)),
            'SERVER_HTTP_PORT': str(server_config.get('server_http_port', 8081)),
            'NAME': server_config.get('server_name', 'Server'),
            'TEAM': '',
            'GUID': server_config.get('steam_id', ''),
            'REQUESTED_CAR': server_config.get('car_id', ''),
            'PASSWORD': '',
            'SERVER_NAME': server_config.get('server_name', 'Server'),
            'EXTENDED_MODE': '1'
        }
        
        # SESSION section
        config['SESSION'] = {
            'NAME': server_config.get('driver_name', 'Driver'),
            'NATIONALITY': server_config.get('nationality', ''),
            'NATION_CODE': '',
            'TEAM': '',
            'CLASS': '',
            'GUID': server_config.get('steam_id', '')
        }
        
        # AUTOSPAWN section
        config['AUTOSPAWN'] = {
            'ACTIVE': '0'
        }
        
        # CAR_0 section (Player car)
        config['CAR_0'] = {
            'MODEL': server_config.get('car_id', ''),
            'SKIN': server_config.get('car_skin', ''),
            'DRIVER_NAME': server_config.get('driver_name', 'Driver'),
            'NATIONALITY': server_config.get('nationality', ''),
            'NATION_CODE': '',
            'SETUP': '',
            'SETUP_LOAD_FROM_CLOUD': '0',
            'SETUP_SAVE_TO_CLOUD': '0',
            'BALLAST': '0',
            'RESTRICTOR': '0',
            'AI_LEVEL': '100',
            'AI_AGGRO': '50'
        }
        
        # DRIVER section
        config['DRIVER'] = {
            'GUID': server_config.get('steam_id', ''),
            'DRIVER_NAME': server_config.get('driver_name', 'Driver'),
            'NATIONALITY': server_config.get('nationality', '')
        }
        
        # SERVER section
        config['SERVER'] = {
            'NAME': server_config.get('server_name', 'Server')
        }
        
        # TEMPERATURE section
        config['TEMPERATURE'] = {
            'AMBIENT': '26',
            'ROAD': '32'
        }
        
        # WEATHER section
        config['WEATHER'] = {
            'NAME': '3_clear'
        }
        
        # LIGHTING section
        config['LIGHTING'] = {
            'SUN_ANGLE': '-16',
            'TIME_MULT': '1',
            'CLOUD_SPEED': '0.2'
        }
        
        # DYNAMIC_TRACK section
        config['DYNAMIC_TRACK'] = {
            'SESSION_START': '95',
            'RANDOMNESS': '1',
            'SESSION_TRANSFER': '90',
            'LAP_GAIN': '1'
        }
        
        # GROOVE section
        config['GROOVE'] = {
            'VIRTUAL_LAPS': '30',
            'MAX_LAPS': '30',
            'STARTING_LAPS': '0'
        }
        
        # BENCHMARK section
        config['BENCHMARK'] = {
            'ACTIVE': '0'
        }
        
        # RESTART section
        config['RESTART'] = {
            'ACTIVE': '0'
        }
        
        # REPLAY section
        config['REPLAY'] = {
            'ACTIVE': '0',
            'FILENAME': '',
            'START_ON': '0',
            'MILLISECONDS_BETWEEN_FRAMES': '200',
            'END_ON_SESSION_END': '0'
        }
        
        # Write the configuration file
        with open(self.race_ini_path, 'w') as configfile:
            config.write(configfile, space_around_delimiters=False)
        
        print(f"Created race.ini at: {self.race_ini_path}")
    
    def launch_game(self, server_config: dict):
        """Launch Assetto Corsa via Content Manager with server join URL"""
        
        server_ip = self.resolve_ip(server_config.get('server_ip'))
        http_port = server_config.get('server_http_port', 8081)
        
        # Create the acmanager:// URL for direct server join with autoJoin
        join_url = f"acmanager://race/online/join?ip={server_ip}&httpPort={http_port}&autoJoin=true"
        
        print(f"Opening Content Manager with URL: {join_url}")
        
        # Use os.startfile to open the acmanager:// URL (Windows will route to Content Manager)
        os.startfile(join_url)
        print("Content Manager join request sent")
    
    def modify_race_ini(self, driver_name: str) -> bool:
        """
        Modify the race.ini file with the driver name
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Read the file as text to preserve exact formatting
            lines = []
            max_retries = 5
            for attempt in range(max_retries):
                try:
                    with open(str(self.race_ini_path), 'r', encoding='utf-8', errors='ignore') as f:
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
                    modified_lines.append(f'DRIVER_NAME={driver_name}\n')
                    print(f">>> Changed driver name: '{old_name}' -> '{driver_name}'")
                # Modify NAME in REMOTE section
                elif current_section == 'REMOTE' and line.strip().startswith('NAME='):
                    modified_lines.append(f'NAME={driver_name}\n')
                    print(f">>> Changed remote name to: '{driver_name}'")
                else:
                    # Keep line exactly as is
                    modified_lines.append(line)
            
            # Write back with exact formatting preserved - retry if file is locked
            for attempt in range(max_retries):
                try:
                    with open(str(self.race_ini_path), 'w', encoding='utf-8', errors='ignore') as f:
                        f.writelines(modified_lines)
                    break
                except (PermissionError, OSError) as e:
                    if attempt < max_retries - 1:
                        time.sleep(0.1)
                    else:
                        raise
            
            print(">>> Successfully modified race.ini!")
            return True
            
        except Exception as e:
            print(f"❌ Error modifying race.ini: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def wait_for_race_ini_and_inject(self, driver_name: str, timeout: float = 10.0) -> bool:
        """
        Wait for Content Manager to write race.ini, then inject driver name
        
        Args:
            driver_name: Name to inject
            timeout: Maximum time to wait in seconds
            
        Returns:
            True if injection successful, False otherwise
        """
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler
        
        injection_done = threading.Event()
        injection_success = [False]  # Use list to allow modification in nested function
        
        class RaceIniHandler(FileSystemEventHandler):
            def __init__(self, joiner, driver_name):
                self.joiner = joiner
                self.driver_name = driver_name
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
                    print(f">>> race.ini modified, intercepting...")
                    
                    # Small delay to ensure CM finished writing
                    time.sleep(0.15)
                    
                    # Inject driver name
                    if self.joiner.modify_race_ini(self.driver_name):
                        injection_success[0] = True
                        injection_done.set()
        
        # Ensure directory exists
        cfg_dir = self.race_ini_path.parent
        cfg_dir.mkdir(parents=True, exist_ok=True)
        
        # Start observer
        handler = RaceIniHandler(self, driver_name)
        observer = Observer()
        observer.schedule(handler, str(cfg_dir), recursive=False)
        observer.start()
        
        print(f">>> Watchdog active - waiting for Content Manager to write race.ini...")
        print(f">>> Will inject driver name: {driver_name}")
        
        # Wait for injection or timeout
        injection_done.wait(timeout=timeout)
        
        # Stop observer
        observer.stop()
        observer.join()
        
        return injection_success[0]
    
    def join_server(self, server_config: dict, launch: bool = True):
        """
        Join an AC server
        
        Args:
            server_config: Dictionary with server connection details
            launch: Whether to automatically launch the game
        """
        print("=== Assetto Corsa Server Auto-Joiner ===\n")
        
        # Validate required fields
        required_fields = ['server_ip', 'car_id', 'steam_id', 'driver_name']
        for field in required_fields:
            if field not in server_config:
                raise ValueError(f"Missing required field: {field}")
        
        driver_name = server_config.get('driver_name', 'Driver')
        
        if launch:
            # Start watchdog to intercept race.ini BEFORE launching CM
            # This runs in a background thread
            injection_thread = threading.Thread(
                target=self.wait_for_race_ini_and_inject,
                args=(driver_name, 30.0),  # 30 second timeout
                daemon=True
            )
            injection_thread.start()
            
            # Small delay to ensure watchdog is ready
            time.sleep(0.5)
            
            # Launch the game via Content Manager
            self.launch_game(server_config)
            
            print("\nWaiting for Content Manager to write race.ini...")
            
            # Wait for injection to complete
            injection_thread.join(timeout=30.0)
            
            print("\nGame should be connecting to server with your name!")
            print("Press Ctrl+C to exit this script (game will continue running)")
            
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                print("\n\nScript terminated. Game is still running.")
        else:
            # Just create race.ini manually
            self.create_race_ini(server_config)
            print("\nrace.ini created. Launch Assetto Corsa manually to join the server.")


def main():
    """Example usage"""
    
    # Server configuration
    server_config = {
        'server_ip': '79.205.108.146',
        'server_port': 9600,
        'server_http_port': 8089,
        'server_name': 'Brands Hatch Indy RD/ED',
        'car_id': 'ks_mercedes_amg_gt3',
        'steam_id': "76561198294533642",
        'driver_name': 'PenisKopf',
    }
    
    try:
        joiner = AssettoCorsaServerJoiner()
        joiner.join_server(server_config, launch=True)
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()