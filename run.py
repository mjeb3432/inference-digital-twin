"""
Local dev launcher for The Forge.

Plain `python run.py` should "just work" on Windows, macOS, and Linux,
which means avoiding three common Windows-on-default-shell foot-guns:

1. **Console encoding.** Windows' default console encoding is cp1252,
   which can't encode characters like the arrow used in the original
   banner. Printing a Unicode character on cp1252 raises
   `UnicodeEncodeError` BEFORE uvicorn ever starts -- uvicorn never
   binds the port, and the browser tab opened by the thread below
   lands on a connection-refused page.

   Fix: switch stdout to UTF-8 when supported (Python 3.7+ has
   `reconfigure`), and fall back to an ASCII-only banner regardless,
   so the launch path is safe on every platform.

2. **Port already in use.** A previous run that wasn't shut down
   cleanly keeps port 8000 bound. uvicorn errors during startup with
   `[Errno 10048]` on Windows. We pre-check the port and exit with a
   clear human message before the browser tab opens.

3. **Browser opens before server is ready.** The original code slept
   1.2s then opened the browser. On a cold start the FastAPI factory
   takes longer than that, so the user sees a blank/refused page.
   Fix: poll the actual port until a TCP connect succeeds, then open
   the browser. Caps at 15s to avoid hanging if startup actually
   fails.
"""

from __future__ import annotations

import socket
import sys
import threading
import time
import webbrowser

HOST = "127.0.0.1"
PORT = 8000
FORGE_URL = f"http://{HOST}:{PORT}/forge"


def _safe_stdout() -> None:
    """Make stdout UTF-8 if the running Python supports it.

    Python 3.7+ exposes `reconfigure()` on the TextIOWrapper backing
    sys.stdout. On Windows we explicitly set encoding='utf-8' so the
    banner line is safe even if the user prints non-ASCII later.
    No-op (and harmless) on platforms where stdout is already UTF-8.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                # Can't change encoding (e.g. piped to a non-TTY that
                # has already been wrapped). Not worth bailing out for.
                pass


def _port_in_use(host: str, port: int) -> bool:
    """Best-effort TCP probe -- does anything answer on (host, port)?"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            return sock.connect_ex((host, port)) == 0
    except OSError:
        return False


def _wait_for_server(host: str, port: int, timeout_s: float = 15.0) -> bool:
    """Poll the port every 200 ms until something answers, or give up."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if _port_in_use(host, port):
            return True
        time.sleep(0.2)
    return False


def _open_browser_when_ready() -> None:
    """Background thread: open the browser ONCE the server is bound.

    The old version slept a hardcoded 1.2s, which was often too short
    on a cold start -- the user got a connection-refused tab. Now we
    poll the port first.
    """
    if _wait_for_server(HOST, PORT):
        try:
            webbrowser.open(FORGE_URL)
        except Exception as exc:  # noqa: BLE001 -- keep launcher robust
            # Browser failure is a UX papercut, not a fatal error. The
            # server is up; the user can copy the URL manually.
            print(f"  (could not auto-open browser: {exc})")
            print(f"  Open this URL manually: {FORGE_URL}")


def main() -> int:
    _safe_stdout()

    # ASCII-only banner so cp1252 / non-UTF-8 consoles never crash.
    # We use '>' instead of the Unicode arrow.
    print("")
    print("  The Forge > " + FORGE_URL)
    print("  (Ctrl+C to stop)")
    print("")

    if _port_in_use(HOST, PORT):
        print(
            f"  ERROR: Port {PORT} on {HOST} is already in use.\n"
            f"         Another copy of The Forge (or some other process)\n"
            f"         is bound to it. Stop the previous run first.\n",
            file=sys.stderr,
        )
        return 2

    # Defer imports of the heavy app + uvicorn until AFTER the banner
    # and the port check, so any import error doesn't mask the actual
    # diagnostic.
    try:
        from app.main import app  # noqa: WPS433 -- local import is intentional
    except Exception as exc:  # noqa: BLE001
        print(f"  ERROR: Failed to import the app: {exc}", file=sys.stderr)
        print(
            "         Make sure you ran `pip install -e .` from the project root.",
            file=sys.stderr,
        )
        return 3

    try:
        import uvicorn
    except ImportError:
        print(
            "  ERROR: `uvicorn` isn't installed.\n"
            "         Run `pip install -e .` from the project root.",
            file=sys.stderr,
        )
        return 4

    threading.Thread(target=_open_browser_when_ready, daemon=True).start()

    # `log_config=None` keeps uvicorn from clobbering whatever encoding
    # adjustments we just made on stdout.
    uvicorn.run(app, host=HOST, port=PORT, log_config=None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
