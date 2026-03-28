from __future__ import annotations

import queue
import threading
import time
from dataclasses import dataclass
from typing import Callable


@dataclass(slots=True)
class QueueJob:
    run_id: str
    scenario: dict
    scenario_hash: str
    enqueued_at: float


class RunQueue:
    def __init__(self, poll_seconds: float = 0.2) -> None:
        self._queue: queue.Queue[QueueJob] = queue.Queue()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._poll_seconds = poll_seconds

    def start(self, handler: Callable[[QueueJob], None]) -> None:
        if self._thread and self._thread.is_alive():
            return

        def worker() -> None:
            while not self._stop_event.is_set():
                try:
                    job = self._queue.get(timeout=self._poll_seconds)
                except queue.Empty:
                    continue
                try:
                    handler(job)
                finally:
                    self._queue.task_done()

        self._thread = threading.Thread(target=worker, daemon=True, name="idt-worker")
        self._thread.start()

    def enqueue(self, job: QueueJob) -> None:
        self._queue.put(job)

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=2.0)

    @property
    def depth(self) -> int:
        return self._queue.qsize()

    def wait_until_empty(self, timeout_seconds: float = 5.0) -> bool:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            if self._queue.empty():
                return True
            time.sleep(0.05)
        return self._queue.empty()
