import os
import sys
import subprocess
import time
import signal

def run_command_in_dir(command, directory):
    """Runs a shell command in a specific directory."""
    print(f"Executing: {' '.join(command)} in {directory}")
    return subprocess.Popen(
        command,
        cwd=directory,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

def monitor_process(process, name):
    """Reads stdout of a process in a non-blocking way and prints it."""
    # We set stdout to non-blocking or just print lines
    for line in iter(process.stdout.readline, ''):
        print(f"[{name}] {line.strip()}")

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")

    print("=== AeroPDF Starter Orchestrator ===")
    
    # 1. Install Python dependencies
    print("\n[1/4] Installing Python dependencies...")
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"],
            cwd=backend_dir,
            check=True
        )
        print("[OK] Python dependencies installed.")
    except Exception as e:
        print(f"[ERROR] Failed to install Python dependencies: {e}")
        sys.exit(1)

    # 2. Install Node dependencies
    print("\n[2/4] Installing Node dependencies...")
    if not os.path.exists(os.path.join(frontend_dir, "node_modules")):
        try:
            subprocess.run(
                ["npm", "install"],
                cwd=frontend_dir,
                check=True,
                shell=True
            )
            print("[OK] Node packages installed.")
        except Exception as e:
            print(f"[ERROR] Failed to run npm install: {e}")
            sys.exit(1)
    else:
        print("[OK] node_modules already exists. Skipping npm install.")

    # 3. Start Backend Server
    print("\n[3/4] Launching FastAPI Backend...")
    # Use sys.executable to ensure we run FastAPI in the same python environment
    backend_cmd = ["uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"]
    backend_proc = subprocess.Popen(
        backend_cmd,
        cwd=backend_dir,
        shell=True,
        stdout=subprocess.DEVNULL, # Suppress noisy logs, uvicorn outputs directly
        stderr=subprocess.DEVNULL
    )
    time.sleep(2)  # Give backend time to start up

    # 4. Start Frontend Client Dev Server
    print("\n[4/4] Launching React Vite Server...")
    frontend_cmd = ["npm", "run", "dev"]
    frontend_proc = subprocess.Popen(
        frontend_cmd,
        cwd=frontend_dir,
        shell=True
    )

    print("\n==============================================")
    print("AeroPDF Editor is now launching!")
    print("- Backend API:  http://127.0.0.1:8000")
    print("- Web Editor:   http://localhost:5173")
    print("==============================================")
    print("Press Ctrl+C to terminate both servers.")

    try:
        # Keep running until interrupted
        while True:
            # Check if processes died
            if backend_proc.poll() is not None:
                print("Backend server terminated unexpectedly.")
                break
            if frontend_proc.poll() is not None:
                print("Frontend dev server terminated unexpectedly.")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping processes gracefully...")
    finally:
        # Terminate processes
        try:
            # On windows, taskkill might be cleaner for shell subprocesses
            if os.name == 'nt':
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(backend_proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(frontend_proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                backend_proc.terminate()
                frontend_proc.terminate()
        except:
            pass
        print("Servers stopped. Goodbye!")

if __name__ == "__main__":
    main()
