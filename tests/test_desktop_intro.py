from __future__ import annotations

from pathlib import Path


SPACE_TITLE  = Path.cwd() / "desktop" / "screens" / "space_title_screen.py"
WBR_TITLE    = Path.cwd() / "desktop" / "screens" / "wbr_title_screen.py"
DESKTOP_MAIN = Path.cwd() / "desktop" / "desktop_main.py"
APP_MANAGER  = Path.cwd() / "desktop" / "app_manager.py"
FORGE_HTML   = Path.cwd() / "app" / "templates" / "forge.html"


def test_space_title_screen_uses_pixel_earth_and_calgary_lock_copy() -> None:
    source = SPACE_TITLE.read_text(encoding="utf-8-sig")

    assert "earthspin-sheet-citylights.png" in source
    assert "Qt.TransformationMode.FastTransformation" in source
    assert "CALGARY // AB // CANADA" in source
    assert "WATT-BIT INTELLIGENCE" in source


def test_wbr_title_screen_brand_copy() -> None:
    source = WBR_TITLE.read_text(encoding="utf-8-sig")

    assert "WATT-BIT INTELLIGENCE" in source
    assert "INFERENCE DIGITAL TWIN" in source
    assert "Simulate before you spend." in source
    # Eyebrow with Calgary lock removed — should not appear
    assert "CALGARY LOCK" not in source
    assert "LOCAL WORLD MODEL" not in source
    # Prompt for manual dismiss
    assert "PRESS ENTER OR CLICK TO CONTINUE" in source
    # Footer branding — only Watt-Bit, no Simply Silicon or Augur
    assert "WATT-BIT INTELLIGENCE" in source
    assert "SIMPLY SILICON" not in source


def test_wbr_title_screen_no_auto_dismiss_timer() -> None:
    source = WBR_TITLE.read_text(encoding="utf-8-sig")

    # Auto-timer was removed — no single-shot dismiss timer should exist
    assert "_auto_timer" not in source
    assert "setSingleShot" not in source


def test_desktop_main_no_space_title_screen() -> None:
    source = DESKTOP_MAIN.read_text(encoding="utf-8-sig")

    # Earth opening removed — SpaceTitleScreen must not appear in main entry point
    assert "SpaceTitleScreen" not in source
    assert "space_title_screen" not in source
    # WBR screen is the entry point
    assert "WBRTitleScreen" in source


def test_app_manager_no_space_title_screen() -> None:
    source = APP_MANAGER.read_text(encoding="utf-8-sig")

    # Dead import removed — SpaceTitleScreen was deleted from the startup chain
    assert "SpaceTitleScreen" not in source
    assert "space_title_screen" not in source
    assert "space_screen" not in source


def test_forge_html_no_calgary_or_third_party_branding() -> None:
    source = FORGE_HTML.read_text(encoding="utf-8-sig")

    # Only Watt-Bit branding in the intro — no Calgary, no Simply Silicon, no Augur
    assert "CALGARY" not in source
    assert "SIMPLY SILICON" not in source
    assert "Augur" not in source


def test_forge_html_no_auto_dismiss() -> None:
    source = FORGE_HTML.read_text(encoding="utf-8-sig")

    # Auto-dismiss removed — overlay only exits on user interaction
    assert "AUTO_DISMISS_MS" not in source
    # The setTimeout dismiss call should not be present
    assert "setTimeout(dismiss" not in source
