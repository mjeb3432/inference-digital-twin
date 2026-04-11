import socket
import threading

import uvicorn


class ServerThread(threading.Thread):
    """Runs the FastAPI/uvicorn server in a background daemon thread."""

    def __init__(self):
        super().__init__(daemon=True)
        self.port = self._find_free_port()
        self.server: uvicorn.Server | None = None
        self._ready = threading.Event()

    @staticmethod
    def _find_free_port() -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]

    def run(self) -> None:
        config = uvicorn.Config(
            "app.main:app",
            host="127.0.0.1",
            port=self.port,
            log_level="warning",
        )
        self.server = uvicorn.Server(config)

        # Patch startup to signal readiness
        original_startup = self.server.startup

        async def _patched_startup(sockets=None):
            await original_startup(sockets)
            self._ready.set()

        self.server.startup = _patched_startup
        self.server.run()

    def wait_ready(self, timeout: float = 15.0) -> bool:
        return self._ready.wait(timeout)

    def shutdown(self) -> None:
        if self.server:
            self.server.should_exit = True
