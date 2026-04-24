from __future__ import annotations

from pathlib import Path


FORGE_JS = Path.cwd() / "app" / "static" / "forge.js"
FORGE_CSS = Path.cwd() / "app" / "static" / "forge.css"
WORLD_PATHS_JSON = Path.cwd() / "app" / "static" / "world_paths.json"


def load_source() -> str:
    return FORGE_JS.read_text(encoding="utf-8-sig")


def load_css() -> str:
    return FORGE_CSS.read_text(encoding="utf-8-sig")


def between(source: str, start: str, end: str) -> str:
    start_idx = source.find(start)
    assert start_idx >= 0, f"Missing marker: {start}"
    end_idx = source.find(end, start_idx)
    assert end_idx >= 0, f"Missing marker: {end}"
    return source[start_idx:end_idx]


def test_no_pseudo_forge_specs_in_repo() -> None:
    pseudo_specs = sorted(Path.cwd().glob("tests/forge/*.pseudo.ts"))
    assert pseudo_specs == []


def test_pointer_pan_uses_transform_scheduler_not_full_rerender() -> None:
    source = load_source()
    body = between(source, "function onCanvasPointerMove(event)", "function onCanvasPointerUp()")

    assert "requestFloorPanTransform();" in body
    assert "renderCenterCanvas();" not in body


def test_telemetry_tick_prefers_incremental_overlay_patch() -> None:
    source = load_source()
    body = between(source, "function startTickers()", "function inspectorNeedsTelemetryRefresh()")

    assert "const refreshed = updateFloorTelemetryOverlay();" in body
    assert "if (!refreshed)" in body
    assert "renderCenterCanvas();" in body


def test_overlay_patch_updates_live_rack_nodes() -> None:
    source = load_source()
    body = between(source, "function updateFloorTelemetryOverlay()", "function onTimelineClick(event)")

    assert "querySelectorAll(\".cad-rack-meta[data-rack-id]\")" in body
    assert "querySelectorAll(\".cad-rack-led[data-rack-id]\")" in body
    assert "status-warning" in body
    assert "status-critical" in body


def test_carrier_validation_message_shows_selected_count() -> None:
    source = load_source()

    assert "SELECT AT LEAST TWO CARRIERS (SELECTED ${facilityState.fiber.carriers.length}/2)" in source


def test_visual_context_label_is_driven_by_view_mode() -> None:
    source = load_source()
    body = between(source, "function phaseSummaryInspect()", "function inspectFor(kind, key)")

    assert "ui.mode === VIEW_MODE.MAP" in body
    assert "GLOBAL TOKEN ROUTING MAP ACTIVE" in body
    assert "FACILITY FLOOR TELEMETRY ACTIVE" in body


def test_map_view_uses_geo_projection_not_hardcoded_xy_points() -> None:
    source = load_source()
    body = between(source, "function renderMapView(withTransition)", "function computeFloorplan(decisions)")

    assert "projectGeoPoint(" in source
    assert "const WORLD_LANDMASSES = Object.freeze([" in source
    assert "ui.derived.cityGeo" in body
    assert "loc.map[0]" not in body
    assert "renderMapGraticule()" in body


def test_world_paths_asset_exists_and_is_populated() -> None:
    assert WORLD_PATHS_JSON.exists()
    content = WORLD_PATHS_JSON.read_text(encoding="utf-8-sig")
    assert content.strip().startswith("[")
    assert content.count("\"M") >= 120


def test_map_view_prefers_loaded_world_path_asset() -> None:
    source = load_source()
    body = between(source, "function renderMapView(withTransition)", "function computeFloorplan(decisions)")

    assert "ui.worldPaths && ui.worldPaths.length" in body
    assert "WORLD_LANDMASSES.map" in body


def test_phase_1_requires_city_and_workload_selection() -> None:
    source = load_source()
    body = between(source, "function isPhaseComplete(phase)", "function isPhaseUnlocked(phase)")

    assert "facilityState.site.cityKey" in body
    assert "facilityState.site.workloadProfile" in body


def test_floor_toolbar_exposes_svg_export_action() -> None:
    source = load_source()
    body = between(source, "function renderFloorToolbar()", "function renderLayerPanel()")

    assert "data-canvas-action=\"export-drawing\"" in body
    assert "EXPORT SVG" in body


def test_gbps_to_gbps_conversion_is_explicit() -> None:
    source = load_source()
    body = between(source, "function gbpsToGBps(gbps)", "function cryptoRandomId()")

    assert "return Number(gbps || 0) / 8;" in body


def test_continuous_decision_inputs_use_lightweight_render_path() -> None:
    source = load_source()
    body = between(source, "function onDecisionInput(event)", "function applyRangeDelta(action, key, delta)")

    assert "const continuous =" in body
    assert "renderLeftDecisionStatus();" in body
    assert "withLeftRailScrollPreserved(() => renderAll());" in body


def test_help_popover_uses_global_overlay_layer_markup() -> None:
    source = load_source()
    body = between(source, "function helpPopover(text, key = \"\")", "function onBenchmarkInput(event)")

    assert "data-help-text=" in body
    assert "aria-haspopup=\"dialog\"" in body
    assert "inline-help-pop" not in body


def test_migrate_scenario_backfills_city_and_workload_defaults() -> None:
    source = load_source()
    body = between(source, "function migrateScenario(raw)", "function applyImportedScenario(payload)")

    assert "|| LEGACY_DEFAULT_SITE_CITY" in body
    assert "|| LEGACY_DEFAULT_WORKLOAD_PROFILE" in body


def test_left_rail_has_single_scroll_surface_and_no_nested_auto_scroll() -> None:
    css = load_css()

    forge_left = between(css, ".forge-left,\n.forge-right {", "}")
    decision_body = between(css, ".decision-body {", "}")
    build_log = between(css, ".build-log {", "}")

    assert "overflow-y: auto;" in forge_left
    assert "overflow: auto;" not in decision_body
    assert "overflow: visible;" in build_log


def test_range_control_uses_plus_minus_and_number_input_without_slider() -> None:
    source = load_source()
    body = between(source, "function rangeControl({ action, value, min, max, step = 1, key = null })", "function helpPopover(text, key = \"\")")

    assert "data-action=\"range-bump\"" in body
    assert "class=\"range-number\" type=\"number\"" in body
    assert "type=\"range\"" not in body
    assert body.find("data-delta=\"-${step}\"") < body.find("class=\"range-number\"")
    assert body.find("class=\"range-number\"") < body.find("data-delta=\"${step}\"")


def test_download_export_uses_delayed_cleanup_for_blob_url() -> None:
    source = load_source()
    body = between(source, "function downloadTextFile(filename, content, mimeType = \"application/json;charset=utf-8\")", "function parseBoundedNumber(raw, min, max)")

    assert "a.style.display = \"none\";" in body
    assert "window.setTimeout(() => {" in body
    assert "URL.revokeObjectURL(url);" in body


def test_phase_two_power_panel_uses_firm_backing_language_not_queue_wording() -> None:
    source = load_source()
    body = between(source, "function decisionPhase2()", "function decisionPhase3()")

    assert "POWER PROCUREMENT STACK" in body
    assert "FIRM BACKING:" in body
    assert "VARIABLE OVERLAY:" in body
    assert "| LEAD:" in body
    assert "| QUEUE:" not in body


def test_power_validation_blocks_variable_mix_without_firm_backing() -> None:
    source = load_source()
    body = between(source, "function recalcAll()", "function enforceLocks()")

    assert "const powerPortfolio = computePowerPortfolio(facilityState.power.sources);" in body
    assert "powerPortfolio.variablePct > powerPortfolio.firmPct" in body
    assert "VARIABLE POWER SHARE EXCEEDS FIRM BACKING." in body


def test_floor_view_renders_phase_brief_overlay_before_phase8() -> None:
    source = load_source()

    assert "function renderPhaseBriefOverlay()" in source
    body = between(source, "function renderFloorView(withTransition)", "function projectGeoPoint(lon, lat, view = MAP_VIEWBOX)")
    assert "renderPhaseBriefOverlay()" in body


def test_inspector_supports_power_source_explanations() -> None:
    source = load_source()
    body = between(source, "function inspectFor(kind, key)", "function latencyClass(latency)")

    assert 'if (kind === "power-source")' in body
    assert 'subtitle: "POWER SOURCE ROLE"' in body
    assert '["24/7 STATE", power.firmingState]' in body


def test_phase_four_decision_numbers_are_sequential() -> None:
    source = load_source()
    body = between(source, "function decisionPhase4()", "function decisionPhase5()")

    assert "DECISION 1 — DEVELOPER TYPE" in body
    assert "DECISION 2 — COOLING INFRASTRUCTURE" in body
    assert "DECISION 3 — POWER ARCHITECTURE" in body
