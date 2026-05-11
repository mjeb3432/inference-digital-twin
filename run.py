"""
Local dev launcher for The Forge.

Designed to "just work" on Windows, macOS, Linux, and WSL with a
default `python run.py`. Every footgun we've seen reported is
handled defensively here -- the user should never need to know
about any of these.

Failure modes covered (and how):

  - **Windows cp1252 consoles.** Default Windows shells can't print
    arbitrary Unicode. The banner is ASCII-only and we best-effort
    upgrade stdout to UTF-8 on Py 3.7+ so later non-ASCII output
    (uvicorn logs, app tracebacks) is also safe.

  - **macOS AirPlay Receiver on port 8000.** Since macOS Monterey
    Apple has bound port 8000 to AirPlay Receiver by default. That
    means a vanilla `python run.py` on Mac is greeted by "port in
    use" with no obvious cause. Solution: if our preferred port is
    taken, auto-fallback to the next free one (up to ten tries)
    rather than exit -- and tell the user what we picked.

  - **Linux + headless / WSL / `webbrowser` errors.** On a server
    box or WSL the `webbrowser` module may either silently no-op
    or throw. We catch the failure, print a big obvious URL line
    the user can copy-paste, and keep serving. Setting
    FORGE_NO_BROWSER=1 skips the auto-open entirely.

  - **Wrong Python.** A clear "needs Python 3.11+" message before
    any imports happen, so users on a stale interpreter don't see
    a cryptic SyntaxError from the typed code below.

  - **Missing dependencies.** A clear "run `pip install -e .`"
    message if either the app or uvicorn can't be imported.

  - **Browser opens before server is ready.** Old version slept a
    hardcoded 1.2s, which is often too short on a cold start. We
    poll the bound port every 200ms (15s cap) before opening.

Optional env overrides:

  FORGE_HOST          bind address (default 127.0.0.1)
  FORGE_PORT          preferred port (default 8000; auto-fallback)
  FORGE_NO_BROWSER=1  skip auto-opening the browser
"""

from __future__ import annotations

import os
import socket
import sys
import threading
import time

MIN_PYTHON = (3, 11)


# --------------------------------------------------------------------------
# Pre-imports: things that must run on ALL interpreters, including stale
# ones that would choke on the modern syntax further down.
# --------------------------------------------------------------------------

def _check_python_version() -> None:
    """Fail fast on Python < 3.11 with a clear human message.

    The rest of the codebase uses PEP 604 unions (`int | None`) and
    other 3.10+ syntax. Without this check the user gets a confusing
    SyntaxError from somewhere deep in the import graph; with it they
    get a one-line fix-it.
    """
    if sys.version_info < MIN_PYTHON:
        sys.stderr.write(
            "ERROR: The Forge requires Python "
            f"{MIN_PYTHON[0]}.{MIN_PYTHON[1]}+. "
            f"You are running {sys.version_info.major}."
            f"{sys.version_info.minor}.\n"
        )
        sys.stderr.write(
            "       Install a newer Python from "
            "https://www.python.org/downloads/ and re-run.\n"
        )
        sys.exit(1)


_check_python_version()

# Safe to use modern syntax from here on -- we've gated above.


# --------------------------------------------------------------------------
# Configuration -- env-var-overridable so the user has an escape hatch.
# --------------------------------------------------------------------------

HOST: str = os.environ.get("FORGE_HOST", "127.0.0.1")
PORT: int = int(os.environ.get("FORGE_PORT", "8000"))
AUTO_OPEN_BROWSER: bool = os.environ.get(
    "FORGE_NO_BROWSER", "0"
).strip().lower() not in ("1", "true", "yes", "y")

# How many sequential ports we'll try if the preferred one is busy.
# 10 is plenty -- covers macOS AirPlay (8000) + a small Docker stack.
MAX_PORT_FALLBACK = 10


def _forge_url(host: str, port: int) -> str:
    return f"http://{host}:{port}/forge"


# --------------------------------------------------------------------------
# Encoding -- best-effort UTF-8 stdout. Banner is ASCII anyway so the
# Windows cp1252 default still works even if this is a no-op.
# --------------------------------------------------------------------------

def _safe_stdout() -> None:
    """Make stdout/stderr UTF-8 if the running Python supports it.

    No-op on platforms where stdout is already UTF-8 (macOS, most
    Linux distros). On Windows cmd.exe (cp1252) this lets uvicorn's
    later non-ASCII output print without an encoding crash.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                # Can't change encoding (e.g. piped to a non-TTY that
                # has already been wrapped). Survive via ASCII banner.
                pass


# --------------------------------------------------------------------------
# Port detection + fallback. On macOS Monterey+, port 8000 is bound
# to AirPlay Receiver by default, so we MUST be willing to use a
# different port without exploding.
# --------------------------------------------------------------------------

def _port_in_use(host: str, port: int) -> bool:
    """True if something is already listening on (host, port).

    We do a TCP connect (not just bind-probe) because on Windows a
    bind attempt to an in-use port can succeed under SO_REUSEADDR
    semantics, giving us a false negative.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            return sock.connect_ex((host, port)) == 0
    except OSError:
        return False


def _can_bind(host: str, port: int) -> bool:
    """True if we can actually bind (host, port) right now.

    Some processes hold a port without responding to a connect probe
    (e.g. AirPlay can be in a weird state). The authoritative test
    is whether `bind()` succeeds.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
            sock.bind((host, port))
            return True
    except OSError:
        return False


def _pick_port(host: str, preferred: int) -> int | None:
    """Return the first free port at preferred..preferred+N.

    Tries the preferred port first; if that's taken, walks forward
    up to MAX_PORT_FALLBACK candidates. Returns None if nothing in
    that range can be bound (rare -- something seriously wrong with
    the machine if this happens).
    """
    for offset in range(MAX_PORT_FALLBACK):
        candidate = preferred + offset
        if _can_bind(host, candidate):
            return candidate
    return None


def _wait_for_server(host: str, port: int, timeout_s: float = 15.0) -> bool:
    """Poll the bound port every 200ms until something answers."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if _port_in_use(host, port):
            return True
        time.sleep(0.2)
    return False


# --------------------------------------------------------------------------
# Browser opener -- robust to headless / WSL / weird $BROWSER configs.
# --------------------------------------------------------------------------

def _print_url_banner(url: str) -> None:
    """Print the URL prominently so the user can copy-paste it.

    This is the fallback for environments where webbrowser.open()
    silently does nothing or errors (headless Linux, WSL without
    wslu, Docker container, ssh session).
    """
    bar = "=" * (len(url) + 6)
    print("")
    print("  " + bar)
    print(f"  || {url} ||")
    print("  " + bar)
    print("  Copy the URL above into a browser if it didn't open automatically.")
    print("")


def _open_browser_when_ready(url: str, host: str, port: int) -> None:
    """Background thread: open the browser ONCE the server is bound.

    Catches every plausible failure (no GUI, no $BROWSER, webbrowser
    raises, etc.) and falls back to printing the URL prominently so
    the user always has a path forward.
    """
    if not _wait_for_server(host, port):
        # Server never came up. Don't open a browser to a dead URL --
        # uvicorn will have printed its own error by now.
        return

    import webbrowser  # imported here so module import is light

    try:
        opened = webbrowser.open(url, new=2, autoraise=True)
    except Exception as exc:  # noqa: BLE001 -- keep launcher robust
        opened = False
        print(f"  (could not auto-open browser: {exc})")

    if not opened:
        # webbrowser.open returned False -- typical on headless Linux
        # and inside Docker. Make sure the user sees the URL plainly.
        _print_url_banner(url)


# --------------------------------------------------------------------------
# Main entry.
# --------------------------------------------------------------------------

def main() -> int:
    _safe_stdout()

    # Pick the actual port we'll bind. If the preferred port is taken
    # (macOS AirPlay being the canonical offender) we fall back, not
    # error out -- the user can always set FORGE_PORT to override.
    actual_port = _pick_port(HOST, PORT)
    if actual_port is None:
        sys.stderr.write(
            f"  ERROR: No free port in range {PORT}-{PORT + MAX_PORT_FALLBACK - 1} on {HOST}.\n"
            f"         Something is wrong with your network stack, or you have a\n"
            f"         lot of other servers running. Try FORGE_PORT=9000 python run.py\n"
        )
        return 2

    actual_url = _forge_url(HOST, actual_port)

    # ASCII-only banner so cp1252 / non-UTF-8 consoles never crash.
    print("")
    print("  The Forge > " + actual_url)
    if actual_port != PORT:
        # Tell the user we silently rerouted -- macOS users hit this
        # constantly because of AirPlay Receiver on :8000.
        print(
            f"  (Port {PORT} was busy -- using {actual_port} instead. "
            f"On macOS this is often AirPlay Receiver: "
            f"System Settings > General > AirDrop & Handoff.)"
        )
    print("  (Ctrl+C to stop)")
    print("")

    # Defer heavy imports until AFTER the banner so import errors
    # don't drown out the URL line.
    try:
        from app.main import app  # noqa: WPS433 -- intentional local import
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"  ERROR: Failed to import the app: {exc}\n")
        sys.stderr.write(
            "         Make sure you ran `pip install -e .` from the project root.\n"
        )
        return 3

    try:
        import uvicorn
    except ImportError:
        sys.stderr.write(
            "  ERROR: `uvicorn` isn't installed.\n"
            "         Run `pip install -e .` from the project root.\n"
        )
        return 4

    if AUTO_OPEN_BROWSER:
        threading.Thread(
            target=_open_browser_when_ready,
            args=(actual_url, HOST, actual_port),
            daemon=True,
        ).start()
    else:
        # User explicitly opted out -- print URL once so they know
        # where to go.
        _print_url_banner(actual_url)

    # `log_config=None` keeps uvicorn from clobbering whatever
    # encoding adjustments we just made on stdout.
    uvicorn.run(app, host=HOST, port=actual_port, log_config=None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
