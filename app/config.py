from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class Settings:
    base_dir: Path
    database_path: Path
    contracts_dir: Path
    artifacts_path: Path
    inline_execution: bool
    worker_poll_interval_seconds: float



def load_settings() -> Settings:
    # Support PyInstaller frozen bundles
    if getattr(sys, "frozen", False):
        base_dir = Path(sys._MEIPASS)
    else:
        base_dir = Path(__file__).resolve().parent.parent
    database_path = Path(os.getenv("IDT_DATABASE_PATH", base_dir / "inference_digital_twin.db"))
    contracts_dir = Path(os.getenv("IDT_CONTRACTS_DIR", base_dir / "contracts" / "v1"))
    artifacts_path = Path(os.getenv("IDT_ARTIFACTS_PATH", base_dir / "artifacts" / "coefficients.v1.json"))
    inline_execution = os.getenv("IDT_INLINE_EXECUTION", "0") == "1"
    worker_poll_interval_seconds = float(os.getenv("IDT_WORKER_POLL_SECONDS", "0.2"))

    return Settings(
        base_dir=base_dir,
        database_path=database_path,
        contracts_dir=contracts_dir,
        artifacts_path=artifacts_path,
        inline_execution=inline_execution,
        worker_poll_interval_seconds=worker_poll_interval_seconds,
    )
