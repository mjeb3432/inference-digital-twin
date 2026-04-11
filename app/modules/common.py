from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class ModuleResult:
    status: str
    metrics: dict[str, dict[str, float | str | dict[str, float]]]
    error: dict[str, str] | None = None


def metric(value: float, unit: str, spread: float = 0.08) -> dict[str, float | str | dict[str, float]]:
    lower = max(0.0, value * (1 - spread))
    upper = value * (1 + spread)
    return {
        "value": round(value, 4),
        "unit": unit,
        "confidence_interval": {
            "lower": round(lower, 4),
            "upper": round(upper, 4),
        },
    }
