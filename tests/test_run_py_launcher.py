"""
Regression tests for run.py -- the local-dev launcher.

The launcher has bitten users in several specific ways:

  Win  - Non-ASCII characters in the banner crashed on cp1252
         consoles BEFORE uvicorn could bind, so the browser tab
         opened to a connection-refused page.
  Win  - The browser opened on a hardcoded 1.2s delay, regardless
         of whether the server had actually started.
  Mac  - macOS Monterey+ binds port 8000 to AirPlay Receiver by
         default. A vanilla `python run.py` got "port in use" with
         no explanation.
  Lin  - On headless / WSL boxes webbrowser.open() may silently
         no-op, leaving the user staring at a server with no
         obvious URL.
  All  - Stale Python interpreters get cryptic SyntaxError because
         the codebase uses PEP-604 union syntax.

Each test below pins one specific guard so a regression is
caught fast.
"""

from __future__ import annotations

import importlib
import os
import re
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
RUN_PY = REPO_ROOT / "run.py"


# --------------------------------------------------------------------------
# Source-level invariants (cheap, run on every CI matrix).
# --------------------------------------------------------------------------

def test_run_py_is_ascii_only() -> None:
    """The launcher must be safe to print under cp1252 / latin-1.

    Anything in the source that gets printed to a stream MUST encode
    cleanly under cp1252 -- that's the default on every fresh Windows
    install. Catching non-ASCII characters at the source-text level
    is a coarse-but-bulletproof check: even if the string is built
    via concatenation, it has to live somewhere as a literal.
    """
    text = RUN_PY.read_text(encoding="utf-8")
    offenders = sorted({c for c in text if ord(c) > 127})
    assert not offenders, (
        f"run.py contains non-ASCII characters that may crash on Windows "
        f"cp1252 consoles: {offenders!r}"
    )
    text.encode("cp1252")  # belt-and-braces


def test_run_py_has_python_version_check() -> None:
    """Stale interpreters must get a clear human message, not a
    cryptic SyntaxError from a PEP-604 union."""
    text = RUN_PY.read_text(encoding="utf-8")
    assert "MIN_PYTHON" in text, "missing min-Python constant"
    assert "_check_python_version" in text, "missing version guard"
    assert re.search(r"requires Python", text, re.IGNORECASE), (
        "missing human-readable version diagnostic"
    )


def test_run_py_has_port_fallback() -> None:
    """macOS users hit AirPlay-on-:8000 constantly. Make sure we
    can roll forward to the next free port."""
    text = RUN_PY.read_text(encoding="utf-8")
    assert "_pick_port" in text, "missing port-picker helper"
    assert "MAX_PORT_FALLBACK" in text, "missing fallback cap"
    assert re.search(r"AirPlay", text), (
        "no AirPlay mention -- the macOS user-facing hint is gone"
    )


def test_run_py_has_env_overrides() -> None:
    """FORGE_HOST / FORGE_PORT / FORGE_NO_BROWSER are escape hatches
    for users with non-standard setups (Docker, WSL, custom DNS)."""
    text = RUN_PY.read_text(encoding="utf-8")
    for env_name in ("FORGE_HOST", "FORGE_PORT", "FORGE_NO_BROWSER"):
        assert env_name in text, f"missing env override: {env_name}"


def test_run_py_waits_for_server_before_opening_browser() -> None:
    """No hardcoded sleep before browser open -- poll the actual port."""
    text = RUN_PY.read_text(encoding="utf-8")
    assert "_wait_for_server" in text, "missing wait-for-server helper"
    assert "time.sleep(1.2)" not in text, (
        "regression: run.py reverted to hardcoded browser-open delay"
    )


def test_run_py_browser_open_is_robust() -> None:
    """webbrowser.open() can fail or return False on headless /
    WSL / weird $BROWSER configs. Make sure we print the URL
    prominently as a fallback so the user always has a path."""
    text = RUN_PY.read_text(encoding="utf-8")
    assert "_print_url_banner" in text, "missing URL fallback banner"
    assert re.search(r"webbrowser\.open\(", text), (
        "lost the actual webbrowser.open() call"
    )
    # webbrowser.open returns False on failure -- we must handle that.
    assert re.search(r"if not opened", text) or re.search(r"opened = False", text), (
        "doesn't handle webbrowser.open() returning False"
    )


# --------------------------------------------------------------------------
# Behavioural tests -- actually exercise the helpers.
# --------------------------------------------------------------------------

def _load_run_mod():
    """Import run.py as a module without triggering main()."""
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    # Force fresh import so test ordering doesn't matter.
    sys.modules.pop("run", None)
    return importlib.import_module("run")


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_run_py_imports_cleanly() -> None:
    """No side effects on `import run`."""
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


def test_run_py_banner_prints_under_cp1252() -> None:
    """Re-wrap stdout in cp1252 and run the banner -- the original
    code raised UnicodeEncodeError here. The fix passes."""
    script = """
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="cp1252", errors="strict")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="cp1252", errors="strict")
import run
run._safe_stdout()
print("  The Forge > " + run._forge_url(run.HOST, run.PORT))
print("BANNER_OK")
"""
    proc = subprocess.run(
        [sys.executable, "-c", script],
        cwd=REPO_ROOT,
        capture_output=True,
        text=False,
        timeout=10,
    )
    stdout_bytes = proc.stdout or b""
    assert proc.returncode == 0, (
        f"banner under cp1252 raised:\n"
        f"  stdout: {stdout_bytes!r}\n"
        f"  stderr: {(proc.stderr or b'')!r}"
    )
    assert b"BANNER_OK" in stdout_bytes


def test_pick_port_returns_preferred_when_free() -> None:
    """If the preferred port is free, _pick_port should just return it."""
    run_mod = _load_run_mod()
    port = _find_free_port()
    assert run_mod._pick_port("127.0.0.1", port) == port


def test_pick_port_falls_forward_when_preferred_busy() -> None:
    """The marquee macOS bugfix: when port 8000 is bound by AirPlay,
    we should silently roll forward to the next free port."""
    run_mod = _load_run_mod()
    held = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    held.bind(("127.0.0.1", 0))
    held.listen(1)
    held_port = held.getsockname()[1]
    try:
        picked = run_mod._pick_port("127.0.0.1", held_port)
        assert picked is not None, "fallback returned None"
        assert picked != held_port, "fallback didn't actually move off the busy port"
        assert held_port < picked <= held_port + run_mod.MAX_PORT_FALLBACK, (
            f"fallback walked outside the documented range: {picked}"
        )
    finally:
        held.close()


def test_wait_for_server_succeeds_when_socket_starts() -> None:
    """_wait_for_server should return True quickly once a listener
    appears on the target port."""
    run_mod = _load_run_mod()
    port = _find_free_port()
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    def start_listening() -> None:
        time.sleep(0.4)
        sock.bind(("127.0.0.1", port))
        sock.listen(1)

    threading.Thread(target=start_listening, daemon=True).start()
    try:
        assert run_mod._wait_for_server("127.0.0.1", port, timeout_s=5.0) is True
    finally:
        try:
            sock.close()
        except OSError:
            pass


def test_wait_for_server_times_out_quickly_when_nothing_starts() -> None:
    """Don't hang the test suite -- a 1.0s timeout should bail."""
    run_mod = _load_run_mod()
    port = _find_free_port()
    started = time.monotonic()
    assert run_mod._wait_for_server("127.0.0.1", port, timeout_s=1.0) is False
    elapsed = time.monotonic() - started
    assert elapsed < 2.0, f"wait-for-server took {elapsed:.2f}s, expected <2s"


def test_forge_no_browser_env_disables_auto_open() -> None:
    """Users on headless boxes should be able to opt out of the
    browser auto-open via env var."""
    # Re-import with the env var set; the module reads it at import.
    proc = subprocess.run(
        [
            sys.executable,
            "-c",
            "import run; print('AUTO=', run.AUTO_OPEN_BROWSER)",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=10,
        env={**os.environ, "FORGE_NO_BROWSER": "1"},
    )
    assert proc.returncode == 0, proc.stderr
    assert "AUTO= False" in proc.stdout


def test_forge_port_env_overrides_default() -> None:
    """FORGE_PORT should change the preferred port at import time."""
    proc = subprocess.run(
        [sys.executable, "-c", "import run; print('PORT=', run.PORT)"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=10,
        env={**os.environ, "FORGE_PORT": "9123"},
    )
    assert proc.returncode == 0, proc.stderr
    assert "PORT= 9123" in proc.stdout


def test_forge_host_env_overrides_default() -> None:
    """FORGE_HOST should change the bind host at import time."""
    proc = subprocess.run(
        [sys.executable, "-c", "import run; print('HOST=', run.HOST)"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=10,
        env={**os.environ, "FORGE_HOST": "0.0.0.0"},
    )
    assert proc.returncode == 0, proc.stderr
    assert "HOST= 0.0.0.0" in proc.stdout


def test_python_version_helper_accepts_current_interpreter() -> None:
    """The interpreter running pytest is by definition >=3.11 (since
    that's the project minimum), so the helper must NOT raise here."""
    run_mod = _load_run_mod()
    # Should run without sys.exit().
    run_mod._check_python_version()


def test_print_url_banner_is_printable_under_cp1252() -> None:
    """The fallback URL banner must also be cp1252-safe -- it's the
    PRIMARY signal on headless boxes where the auto-open fails."""
    run_mod = _load_run_mod()
    script = """
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="cp1252", errors="strict")
import run
run._print_url_banner("http://127.0.0.1:8000/forge")
print("BANNER_OK")
"""
    proc = subprocess.run(
        [sys.executable, "-c", script],
        cwd=REPO_ROOT,
        capture_output=True,
        text=False,
        timeout=10,
    )
    assert proc.returncode == 0, (
        f"URL fallback banner raised under cp1252:\n"
        f"  stdout: {proc.stdout!r}\n  stderr: {proc.stderr!r}"
    )
    assert b"BANNER_OK" in (proc.stdout or b"")
