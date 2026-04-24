from __future__ import annotations

from dataclasses import dataclass
from typing import Any


ERROR_CLASSES = {
    "validation",
    "data_missing",
    "calibration_out_of_range",
    "compute_timeout",
    "internal",
}


@dataclass
class AppError(Exception):
    error_class: str
    message: str
    details: dict[str, Any] | None = None

    def __post_init__(self) -> None:
        if self.error_class not in ERROR_CLASSES:
            raise ValueError(f"Unknown error class: {self.error_class}")
        Exception.__init__(self, self.message)


class ValidationError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__("validation", message, details)


class DataMissingError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__("data_missing", message, details)


class CalibrationOutOfRangeError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__("calibration_out_of_range", message, details)


class ComputeTimeoutError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__("compute_timeout", message, details)


class InternalError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__("internal", message, details)
