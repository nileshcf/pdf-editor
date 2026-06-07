import os
import sys
import subprocess
import time

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")

    print("=== AeroPDF Starter Orchestrator ===")

    # 1. Install Python dependencies using the current interpreter
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
            # Use shell=True with a string command for cross-platform compatibility
            subprocess.run(
                "npm install",
                cwd=frontend_dir,
                check=True,
                shell=True
            )
            print("[OK] Node packages installed.")
        except Exception as e:
            print(f"[ERROR] Failed to run npm install: {e}")
            sys.exit(1)
    else:
        print("[OK] node_modules already present. Skipping npm install.")

    # 3. Start Backend — use sys.executable -m uvicorn so it runs inside the
    #    current Python environment regardless of PATH.
    print("\n[3/4] Launching FastAPI Backend on http://127.0.0.1:8000 ...")
    backend_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app",
         "--host", "127.0.0.1", "--port", "8000", "--reload"],
        cwd=backend_dir,
        # Do NOT use shell=True here — we pass a proper list so Python finds
        # uvicorn inside the active venv/environment without relying on PATH.
    )
    time.sleep(2)  # Give uvicorn a moment to bind the port

    # Check the backend actually started
    if backend_proc.poll() is not None:
        print("[ERROR] Backend failed to start. Check that uvicorn and pymupdf are installed.")
        sys.exit(1)

    # 4. Start Frontend Vite dev server
    print("\n[4/4] Launching React Vite Frontend on http://localhost:5173 ...")
    frontend_proc = subprocess.Popen(
        "npm run dev",
        cwd=frontend_dir,
        shell=True
    )

    print("\n==============================================")
    print("  AeroPDF Editor is running!")
    print("  Backend API  →  http://127.0.0.1:8000")
    print("  Web Editor   →  http://localhost:5173")
    print("==============================================")
    print("Press Ctrl+C to stop both servers.\n")

    try:
        while True:
            if backend_proc.poll() is not None:
                print("[ERROR] Backend terminated unexpectedly.")
                break
            if frontend_proc.poll() is not None:
                print("[ERROR] Frontend dev server terminated unexpectedly.")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down gracefully...")
    finally:
        # Kill the entire process trees on all platforms
        try:
            if os.name == 'nt':
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(backend_proc.pid)],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(frontend_proc.pid)],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
            else:
                import signal
                os.killpg(os.getpgid(backend_proc.pid), signal.SIGTERM)
                os.killpg(os.getpgid(frontend_proc.pid), signal.SIGTERM)
        except Exception:
            backend_proc.terminate()
            frontend_proc.terminate()
        print("Servers stopped. Goodbye!")

if __name__ == "__main__":
    main()
