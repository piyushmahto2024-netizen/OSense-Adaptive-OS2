# OSense 2.0 — Live Windows System setup

1. Install Python 3.9+ on Windows, then in the project folder:
   `pip install -r scripts/requirements.txt`
2. Start the monitor: `python scripts/windows_monitor.py` (use `--port 5001` to change port; the app expects 5000).
3. Open OSense, go to CPU Scheduling, Memory or Adaptive Engine, choose **Live Windows System**, then press the "Use live…" button.

Notes: values shown as "Measured" are real; bursts, arrivals, priorities and scaled memory sizes are **estimates** for the simulator. The monitor is read-only and listens only on 127.0.0.1. Run as Administrator to reduce "access denied" skipped processes.
