#!/usr/bin/env python3
"""
Configuration loader for Race Interceptor
Loads and validates environment variables from .env file
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv


def get_executable_dir() -> Path:
    """
    Get the directory where the executable or script is located.
    
    When running as a PyInstaller bundle, sys.executable points to the .exe file.
    When running as a script, __file__ points to this .py file.
    """
    if getattr(sys, 'frozen', False):
        # Running as compiled executable (PyInstaller)
        # sys.executable is the path to the .exe file
        return Path(sys.executable).parent
    else:
        # Running as normal Python script
        return Path(__file__).parent


# Load .env file from the same directory as the executable/script
env_path = get_executable_dir() / '.env'
load_dotenv(dotenv_path=env_path)


class Config:
    """Configuration class for Race Interceptor"""
    
    def __init__(self):
        self.BACKEND_URL = self._get_required_env('BACKEND_URL')
        self.BACKEND_PORT = self._get_required_env('BACKEND_PORT')
        self.RIG_ID = self._get_required_env('RIG_ID')
        
        # Assetto Corsa server configuration
        self.AC_SERVER_IP = self._get_required_env('AC_SERVER_IP')
        self.AC_SERVER_PORT = self._get_optional_env('AC_SERVER_PORT', '9600')
        self.AC_SERVER_HTTP_PORT = self._get_required_env('AC_SERVER_HTTP_PORT')
        self.AC_SERVER_NAME = self._get_optional_env('AC_SERVER_NAME', 'Race Server')
        self.AC_CAR_ID = self._get_required_env('AC_CAR_ID')
        self.AC_STEAM_ID = self._get_required_env('AC_STEAM_ID')
        
        # Validate and parse RIG_ID as integer
        try:
            self.RIG_ID = int(self.RIG_ID)
            if self.RIG_ID < 1:
                raise ValueError("RIG_ID must be a positive integer")
        except ValueError as e:
            print(f"❌ Error: Invalid RIG_ID value '{self.RIG_ID}'. Must be a positive integer (1, 2, 3, etc.)")
            print(f"   Details: {e}")
            sys.exit(1)
        
        # Validate and parse BACKEND_PORT as integer
        try:
            self.BACKEND_PORT = int(self.BACKEND_PORT)
            if not (1 <= self.BACKEND_PORT <= 65535):
                raise ValueError("Port must be between 1 and 65535")
        except ValueError as e:
            print(f"❌ Error: Invalid BACKEND_PORT value '{self.BACKEND_PORT}'")
            print(f"   Details: {e}")
            sys.exit(1)
        
        # Construct full backend URL
        self.BACKEND_BASE_URL = f"{self.BACKEND_URL}:{self.BACKEND_PORT}"
        
        # Parse AC server ports as integers
        try:
            self.AC_SERVER_PORT = int(self.AC_SERVER_PORT)
        except ValueError:
            print(f"❌ Error: Invalid AC_SERVER_PORT value '{self.AC_SERVER_PORT}'")
            sys.exit(1)
        
        try:
            self.AC_SERVER_HTTP_PORT = int(self.AC_SERVER_HTTP_PORT)
        except ValueError:
            print(f"❌ Error: Invalid AC_SERVER_HTTP_PORT value '{self.AC_SERVER_HTTP_PORT}'")
            sys.exit(1)
    
    def _get_required_env(self, key: str) -> str:
        """Get required environment variable or exit with error"""
        value = os.getenv(key)
        if not value:
            print(f"❌ Error: Required environment variable '{key}' is not set")
            print(f"   Please create a .env file based on .env.example")
            print(f"   Expected location: {env_path}")
            sys.exit(1)
        return value
    
    def _get_optional_env(self, key: str, default: str) -> str:
        """Get optional environment variable with default value"""
        return os.getenv(key, default)
    
    def get_server_config(self, driver_name: str) -> dict:
        """
        Get server configuration dictionary for AssettoCorsaServerJoiner
        
        Args:
            driver_name: Name of the driver to use
            
        Returns:
            Server configuration dictionary
        """
        return {
            'server_ip': self.AC_SERVER_IP,
            'server_port': self.AC_SERVER_PORT,
            'server_http_port': self.AC_SERVER_HTTP_PORT,
            'server_name': self.AC_SERVER_NAME,
            'car_id': self.AC_CAR_ID,
            'steam_id': self.AC_STEAM_ID,
            'driver_name': driver_name,
        }
    
    def __repr__(self):
        return f"Config(BACKEND_BASE_URL='{self.BACKEND_BASE_URL}', RIG_ID={self.RIG_ID})"


# Create singleton config instance
config = Config()

if __name__ == "__main__":
    # Test configuration loading
    print("Configuration loaded successfully:")
    print(f"  Backend URL: {config.BACKEND_BASE_URL}")
    print(f"  Rig ID: {config.RIG_ID}")
