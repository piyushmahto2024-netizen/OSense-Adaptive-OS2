"""OSense 2.0 — local Windows telemetry monitor (read-only).

Run on the same PC as your browser:
    pip install -r scripts/requirements.txt
    python scripts/windows_monitor.py            # http://127.0.0.1:5000/metrics
Only reads measurements via psutil; never changes processes or priorities.
"""
import json, time, argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
import psutil

MB = 1024 * 1024
BOOT = psutil.boot_time()
for p in psutil.process_iter():  # prime per-process CPU counters
    try: p.cpu_percent(None)
    except Exception: pass
psutil.cpu_percent(None)


def snapshot(top: int):
    procs, skipped = [], 0
    for p in psutil.process_iter(["pid", "name", "memory_info", "memory_percent", "status", "num_threads"]):
        try:
            info = p.info
            procs.append({
                "pid": info["pid"], "name": info["name"] or f"pid-{info['pid']}",
                "cpu_percent": p.cpu_percent(None),
                "memory_mb": round((info["memory_info"].rss if info["memory_info"] else 0) / MB, 2),
                "memory_percent": round(info["memory_percent"] or 0, 2),
                "status": info["status"], "threads": info["num_threads"],
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            skipped += 1
    procs.sort(key=lambda x: (-x["cpu_percent"], -x["memory_mb"]))
    vm = psutil.virtual_memory()
    try: disk = psutil.disk_usage("C:\\" if psutil.WINDOWS else "/").percent
    except Exception: disk = None
    io = psutil.disk_io_counters(); net = psutil.net_io_counters()
    return {
        "timestamp": time.time(),
        "cpu_percent": psutil.cpu_percent(None),
        "per_core": psutil.cpu_percent(None, percpu=True),
        "memory": {"total_mb": vm.total / MB, "used_mb": vm.used / MB, "available_mb": vm.available / MB, "percent": vm.percent},
        "disk": {"percent": disk, "read_mb": io.read_bytes / MB if io else None, "write_mb": io.write_bytes / MB if io else None},
        "network": {"sent_mb": net.bytes_sent / MB, "recv_mb": net.bytes_recv / MB},
        "uptime_sec": time.time() - BOOT,
        "processes": procs[:top],
        "skipped_processes": skipped,
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/health": return self._send(200, {"ok": True})
        if u.path != "/metrics": return self._send(404, {"error": "not found"})
        try: top = max(1, min(50, int(parse_qs(u.query).get("top", ["25"])[0])))
        except ValueError: top = 25
        self._send(200, snapshot(top))

    def log_message(self, *a): pass


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--port", type=int, default=5000)
    a = ap.parse_args()
    print(f"OSense monitor on http://127.0.0.1:{a.port}/metrics  (Ctrl+C to stop)")
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()
