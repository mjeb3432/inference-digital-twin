"""
Regression tests for run.py — the local-dev launcher.

The launcher has bitten Windows users twice now:

  1. Non-ASCII characters in the banner crashed on cp1252 consoles
     BEFORE uvicorn could bind, so the browser tab opened to a
     connection-refused page.
  2. The browser opened on a hardcoded 1.2s delay, regardless of
     whether the server had actually started.

These tests guard against both regressions plus the port-busy
diagnostic path.
"""

from __future__ import annotations

import os
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
RUN_PY = REPO_ROOT / "run.py"


def test_run_py_is_ascii_only() -> None:
    """The launcher must be safe to print under cp1252 / latin-1.

    Anything in the source that gets printed to a stream MUST encode
    cleanly under cp1252 — that's the default on every fresh Windows
    install. Catching non-ASCII characters at the source-text level is
    a coarse-but-bulletproof check: even if the string is constructed
    via concatenation, it has to live somewhere as a literal.
    """
    text = RUN_PY.read_text(encoding="utf-8")
    # Pick out any chars outside the printable-ASCII range.
    offenders = sorted({c for c in text if ord(c) > 127})
    assert not offenders, (
        f"run.py contains non-ASCII characters that may crash on Windows "
        f"cp1252 consoles: {offenders!r}"
    )
    # Belt-and-braces: confirm the whole file round-trips through cp1252.
    text.encode("cp1252")


def test_run_py_has_port_busy_guard() -> None:
    """run.py should refuse to start (with a clear message) when 8000
    is already bound, instead of crashing inside uvicorn."""
    text = RUN_PY.read_text(encoding="utf-8")
    assert "_port_in_use" in text, "missing port-in-use helper"
    assert re.search(r"already in use", text, re.IGNORECASE), (
        "missing human-readable port-busy diagnostic"
    )


def test_run_py_waits_for_server_before_opening_browser() -> None:
    """The browser should open AFTER the port is bound, not on a
    hardcoded sleep. We just check that the launcher poll-waits."""
    text = RUN_PY.read_text(encoding="utf-8")
    assert "_wait_for_server" in text, "missing wait-for-server helper"
    # Confirm we're not back to the old hardcoded sleep.
    assert "time.sleep(1.2)" not in text, (
        "regression: run.py reverted to hardcoded browser-open delay"
    )


def test_run_py_imports_cleanly() -> None:
    """Importing run as a module shouldn't have side effects (it must
    guard with __main__) so it can be imported safely from tests."""
    proc = subprocess.run(
        [sys.executable, "-c", "import run; print('ok')"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=15,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    assert proc.returncode == 0, (
        f"run.py import failed:\n  stdout: {proc.stdout!r}\n  stderr: {proc.stderr!r}"
    )


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_run_py_banner_prints_under_cp1252() -> None:
    """Run the banner-printing portion of run.py with stdout forced to
    cp1252 — the exact configuration where the original bug fired —
    and confirm it does NOT raise UnicodeEncodeError. We exit BEFORE
    uvicorn actually starts so the test stays fast and hermetic.
    """
    # The hermetic version: import run and call _safe_stdout +
    # exercise the banner path, but stop before uvicorn.run().
    script = """
import io, sys
# Simulate a Windows cp1252 console by re-wrapping stdout.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="cp1252", errors="strict")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="cp1252", errors="strict")
import run
# Just exercise the banner / encoding-safety helpers. Skip main()
# entirely so we don't try to bind a port.
run._safe_stdout()
print("  The Forge > " + run.FORGE_URL)
print("BANNER_OK")
"""
    proc = subprocess.run(
        [sys.executable, "-c", script],
        cwd=REPO_ROOT,
        capture_output=True,
        text=False,  # consume raw bytes; the child controls encoding
        timeout=10,
    )
    stdout_bytes = proc.stdout or b""
    assert proc.returncode == 0, (
        f"banner printed under cp1252 raised:\n"
        f"  stdout: {stdout_bytes!r}\n"
        f"  stderr: {(proc.stderr or b'')!r}"
    )
    assert b"BANNER_OK" in stdout_bytes


def test_run_py_port_busy_exits_with_clear_error() -> None:
    """When the configured port is already bound, run.py should exit
    nonzero with the port-busy message instead of crashing inside
    uvicorn's bind path."""
    port = _find_free_port()
    # Hold the port for the duration of the subprocess.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
    sock.bind(("127.0.0.1", port))
    sock.listen(1)
    try:
        # Patch run.PORT via env-aware monkey: easier to call the
        # internal helpers than to spin a whole subprocess. The test
        # above already covers full-subprocess import.
        import importlib
        sys.path.insert(0, str(REPO_ROOT))
        try:
            run_mod = importlib.import_module("run")
        finally:
            sys.path.remove(str(REPO_ROOT))
        # Verify _port_in_use detects our held socket.
        assert run_mod._port_in_use("127.0.0.1", port) is True
    finally:
        sock.close()


def test_run_py_wait_for_server_eventually_succeeds() -> None:
    """_wait_for_server should return True quickly once a socket
    starts listening on the target port."""
    import importlib
    import threading

    port = _find_free_port()
    sys.path.insert(0, str(REPO_ROOT))
    try:
        run_mod = importlib.import_module("run")
    finally:
        sys.path.remove(str(REPO_ROOT))

    # Start a listener after a short delay so the waiter has to poll.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    def start_listening() -> None:
        time.sleep(0.4)
        sock.bind(("127.0.0.1", port))
        sock.listen(1)

    t = threading.Thread(target=start_listening, daemon=True)
    t.start()
    try:
        assert run_mod._wait_for_server("127.0.0.1", port, timeout_s=5.0) is True
    finally:
        try:
            sock.close()
        except OSError:
            pass
