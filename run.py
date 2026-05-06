import subprocess
import os
import sys
import time

def run():
    # Start Backend using the virtual environment
    print("Starting Backend...")
    base_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(base_dir, "backend")
    venv_python = os.path.join(backend_dir, "venv", "Scripts", "python.exe")
    
    backend_process = subprocess.Popen(
        [venv_python, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"],
        cwd=backend_dir
    )

    # Start Frontend
    print("Starting Frontend...")
    frontend_process = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=base_dir,
        shell=True
    )

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping...")
        backend_process.terminate()
        frontend_process.terminate()

if __name__ == "__main__":
    run()
