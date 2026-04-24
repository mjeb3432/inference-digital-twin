from __future__ import annotations

from pathlib import Path


SPACE_TITLE = Path.cwd() / "desktop" / "screens" / "space_title_screen.py"
WBR_TITLE = Path.cwd() / "desktop" / "screens" / "wbr_title_screen.py"


def test_space_title_screen_uses_pixel_earth_and_calgary_lock_copy() -> None:
    source = SPACE_TITLE.read_text(encoding="utf-8-sig")

    assert "earthspin-sheet-citylights.png" in source
    assert "Qt.TransformationMode.FastTransformation" in source
    assert "CALGARY // AB // CANADA" in source
    assert "WATT-BIT INTELLIGENCE" in source


def test_wbr_title_screen_uses_requested_brand_phrase() -> None:
    source = WBR_TITLE.read_text(encoding="utf-8-sig")

    assert "WATT-BIT INTELLIGENCE" in source
    assert "INFERENCE DIGITAL TWIN" in source
    assert "Simulate before you spend." in source
