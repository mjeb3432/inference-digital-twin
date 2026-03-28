from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, path: Path) -> None:
        self._connection = sqlite3.connect(path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._lock = threading.Lock()

    def init_schema(self) -> None:
        with self._lock:
            cursor = self._connection.cursor()
            cursor.executescript(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    run_id TEXT PRIMARY KEY,
                    scenario_json TEXT NOT NULL,
                    scenario_hash TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    report_id TEXT,
                    error_class TEXT,
                    error_message TEXT,
                    queue_wait_ms REAL,
                    total_ms REAL
                );

                CREATE TABLE IF NOT EXISTS run_stages (
                    run_id TEXT NOT NULL,
                    stage_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    latency_ms REAL,
                    error_class TEXT,
                    error_message TEXT,
                    PRIMARY KEY (run_id, stage_name)
                );

                CREATE TABLE IF NOT EXISTS reports (
                    report_id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    report_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS cache_entries (
                    cache_key TEXT PRIMARY KEY,
                    report_id TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )
            self._connection.commit()

    def insert_run(self, run_id: str, scenario: dict[str, Any], scenario_hash: str, status: str) -> None:
        now = utc_now_iso()
        with self._lock:
            self._connection.execute(
                """
                INSERT INTO runs (run_id, scenario_json, scenario_hash, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (run_id, json.dumps(scenario, separators=(",", ":")), scenario_hash, status, now, now),
            )
            self._connection.commit()

    def set_run_started(self, run_id: str) -> None:
        now = utc_now_iso()
        with self._lock:
            self._connection.execute(
                "UPDATE runs SET status = ?, started_at = ?, updated_at = ? WHERE run_id = ?",
                ("running", now, now, run_id),
            )
            self._connection.commit()

    def set_run_completed(
        self,
        run_id: str,
        status: str,
        report_id: str | None,
        queue_wait_ms: float,
        total_ms: float,
        error_class: str | None = None,
        error_message: str | None = None,
    ) -> None:
        now = utc_now_iso()
        with self._lock:
            self._connection.execute(
                """
                UPDATE runs
                SET status = ?, report_id = ?, queue_wait_ms = ?, total_ms = ?,
                    error_class = ?, error_message = ?, completed_at = ?, updated_at = ?
                WHERE run_id = ?
                """,
                (
                    status,
                    report_id,
                    queue_wait_ms,
                    total_ms,
                    error_class,
                    error_message,
                    now,
                    now,
                    run_id,
                ),
            )
            self._connection.commit()

    def upsert_stage(self, run_id: str, stage_name: str, status: str, started: bool = False) -> None:
        now = utc_now_iso()
        with self._lock:
            self._connection.execute(
                """
                INSERT INTO run_stages (run_id, stage_name, status, started_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(run_id, stage_name) DO UPDATE SET
                  status = excluded.status,
                  started_at = COALESCE(run_stages.started_at, excluded.started_at)
                """,
                (run_id, stage_name, status, now if started else None),
            )
            self._connection.commit()

    def complete_stage(
        self,
        run_id: str,
        stage_name: str,
        status: str,
        latency_ms: float,
        error_class: str | None = None,
        error_message: str | None = None,
    ) -> None:
        now = utc_now_iso()
        with self._lock:
            self._connection.execute(
                """
                UPDATE run_stages
                SET status = ?, completed_at = ?, latency_ms = ?, error_class = ?, error_message = ?
                WHERE run_id = ? AND stage_name = ?
                """,
                (status, now, latency_ms, error_class, error_message, run_id, stage_name),
            )
            self._connection.commit()

    def insert_report(self, report_id: str, run_id: str, report: dict[str, Any]) -> None:
        now = utc_now_iso()
        with self._lock:
            self._connection.execute(
                "INSERT INTO reports (report_id, run_id, report_json, created_at) VALUES (?, ?, ?, ?)",
                (report_id, run_id, json.dumps(report, separators=(",", ":")), now),
            )
            self._connection.commit()

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._connection.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
            if row is None:
                return None
            result = dict(row)
            result["scenario"] = json.loads(result.pop("scenario_json"))
            return result

    def list_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT run_id, scenario_hash, status, created_at, updated_at, report_id FROM runs ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(row) for row in rows]

    def get_run_stages(self, run_id: str) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM run_stages WHERE run_id = ? ORDER BY rowid ASC", (run_id,)
            ).fetchall()
            return [dict(row) for row in rows]

    def get_report(self, report_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._connection.execute("SELECT report_json FROM reports WHERE report_id = ?", (report_id,)).fetchone()
            if row is None:
                return None
            return json.loads(row["report_json"])

    def get_report_by_run_id(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._connection.execute("SELECT report_json FROM reports WHERE run_id = ?", (run_id,)).fetchone()
            if row is None:
                return None
            return json.loads(row["report_json"])

    def list_reports(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT report_id, run_id, created_at FROM reports ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(row) for row in rows]

    def put_cache_entry(self, cache_key: str, report_id: str) -> None:
        now = utc_now_iso()
        with self._lock:
            self._connection.execute(
                """
                INSERT INTO cache_entries (cache_key, report_id, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET report_id = excluded.report_id, created_at = excluded.created_at
                """,
                (cache_key, report_id, now),
            )
            self._connection.commit()

    def get_cached_report(self, cache_key: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._connection.execute(
                "SELECT report_id FROM cache_entries WHERE cache_key = ?", (cache_key,)
            ).fetchone()
            if row is None:
                return None
            report_row = self._connection.execute(
                "SELECT report_json FROM reports WHERE report_id = ?", (row["report_id"],)
            ).fetchone()
            if report_row is None:
                return None
            return json.loads(report_row["report_json"])

    def close(self) -> None:
        with self._lock:
            self._connection.close()
