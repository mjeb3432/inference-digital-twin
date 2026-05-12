from __future__ import annotations

from pathlib import Path


FORGE_JS = Path.cwd() / "app" / "static" / "forge.js"
FORGE_3D_JS = Path.cwd() / "app" / "static" / "forge-3d.js"
FORGE_CSS = Path.cwd() / "app" / "static" / "forge.css"
WORLD_PATHS_JSON = Path.cwd() / "app" / "static" / "world_paths.json"


def load_source() -> str:
    return FORGE_JS.read_text(encoding="utf-8-sig")


def load_3d_source() -> str:
    return FORGE_3D_JS.read_text(encoding="utf-8-sig")


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


def test_carrier_validation_message_shows_selected_count() -> None:
    source = load_source()

    assert "SELECT AT LEAST TWO CARRIERS (SELECTED ${facilityState.fiber.carriers.length}/2)" in source


def test_visual_context_card_shows_facility_online_at_phase_8() -> None:
    """At Phase 8 the inspector viz card flips to a clearly-marked
    FACILITY ONLINE state with the mint glow style. Earlier this card
    forked on view mode (map vs floor) but the 2D map view has been
    retired, so the label now just reflects construction vs online."""
    source = load_source()
    body = between(source, "function phaseSummaryInspect()", "function inspectFor(kind, key)")

    assert "UNDER CONSTRUCTION MODE ACTIVE" in body
    assert "FACILITY ONLINE" in body
    # The phase-8 card uses the live-state CSS class so it visually
    # pops vs the muted construction state.
    assert "viz-card-online" in body


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


def test_floor_toolbar_is_3d_only_with_recenter_and_fullscreen() -> None:
    source = load_source()
    body = between(source, "function renderFloorToolbar()", "function arcControl(x1, y1, x2, y2)")

    # Only the 3D toolbar survives — recenter + fullscreen, no 2D dim
    # toggle, no SVG export, no zoom controls, no layer presets.
    assert "data-canvas-action=\"recenter-3d\"" in body
    assert "data-canvas-action=\"fullscreen\"" in body
    assert "data-canvas-action=\"dim-mode\"" not in body
    assert "data-canvas-action=\"export-drawing\"" not in body
    assert "data-canvas-action=\"toggle-layers\"" not in body
    assert "2D PLAN" not in body


def test_gbps_to_gbps_conversion_is_explicit() -> None:
    source = load_source()
    body = between(source, "function gbpsToGBps(gbps)", "function cryptoRandomId()")

    assert "return Number(gbps || 0) / 8;" in body


def test_continuous_decision_inputs_use_lightweight_render_path() -> None:
    """The non-continuous re-render path must:
      1) Preserve left-rail scroll (so the panel doesn't snap to top)
      2) Preserve INPUT focus + caret (so typing a digit doesn't yank
         the user out of the field) — added Nov 2026 after users
         reported having to re-click the power-% inputs after each
         keystroke.
    """
    source = load_source()
    body = between(source, "function onDecisionInput(event)", "function applyRangeDelta(action, key, delta)")

    assert "const continuous =" in body
    assert "renderLeftDecisionStatus();" in body
    # Both wrappers should be in play on the non-continuous path.
    assert "withLeftRailScrollPreserved" in body
    assert "withFocusPreserved" in body
    assert "renderAll()" in body


def test_benchmark_input_preserves_focus() -> None:
    """Typing in the benchmark suite must not yank the user out of
    the field. renderBenchmarks() rebuilds the body via innerHTML;
    without focus preservation users had to re-click after every
    keystroke."""
    source = load_source()
    body = between(source, "function onBenchmarkInput(event)", "function onToggleView()")
    assert "withFocusPreserved" in body, (
        "benchmark input handler must wrap re-render in withFocusPreserved"
    )


def test_with_focus_preserved_helper_exists() -> None:
    """The focus-preservation helper itself must be present and
    invoke document.querySelector after the work() call so the new
    DOM node can be located and re-focused."""
    source = load_source()
    body = between(source, "function withFocusPreserved(work)", "function setHelpButtonState")
    assert "document.activeElement" in body
    assert "selectionStart" in body
    assert "querySelector(" in body
    assert ".focus(" in body


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
    """Range controls are - / typed-text / + with a numeric inputmode.
    We use type=text (not type=number) so that selectionStart /
    setSelectionRange work for the focus-preservation helper — Chrome
    and Firefox don't expose these on type=number inputs, which is
    what caused the "have to re-click after each digit" complaint."""
    source = load_source()
    body = between(source, "function rangeControl({ action, value, min, max, step = 1, key = null })", "function helpPopover(text, key = \"\")")

    assert "data-action=\"range-bump\"" in body
    assert "class=\"range-number\"" in body
    assert "type=\"text\"" in body
    assert "inputmode=\"numeric\"" in body
    assert "type=\"range\"" not in body
    assert body.find("data-delta=\"-${step}\"") < body.find("class=\"range-number\"")
    assert body.find("class=\"range-number\"") < body.find("data-delta=\"${step}\"")


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


def test_sawtooth_tooth_geometry_is_centered_on_both_axes() -> None:
    """QA round 5: the sawtooth teeth were shifted back by one slot
    in Z because the geometry post-rotation occupied world Z
    [-toothW, 0] relative to local origin (asymmetric). Fix translates
    on BOTH axes before rotateY so the geometry is symmetric around
    local origin, then places each tooth at the slot CENTRE rather
    than the slot start."""
    source = load_3d_source()
    body = between(
        source,
        "/* Sawtooth roof — series of triangular monitors.",
        "/* Parapet strip running around the perimeter",
    )

    # Geometry must translate on BOTH axes before rotation
    assert "toothGeo.translate(-toothW / 2, 0, -halfExtrude)" in body
    # Tooth placed at slot CENTRE, not slot start
    assert "(s + 0.5) * toothW" in body


def test_repurpose_warehouse_has_polish_details() -> None:
    """The repurposed industrial warehouse needs to read as a real
    warehouse, not just a flat tilt-up box. Beyond the sawtooth fix
    we add: a roof deck (so gaps between teeth don't look into the
    void), parapet bands around the perimeter, tilt-up panel seams,
    a raised loading dock with bay doors, rooftop HVAC condensers,
    and a faded signage band on the long wall."""
    source = load_3d_source()
    body = between(
        source,
        "/* Tilt-up warehouse buildings with sawtooth roof monitors",
        "/* A few hardy \"industrial volunteer\" trees",
    )

    assert "roofDeckMat" in body
    assert "parapetMat" in body
    assert "Tilt-up panel pilasters" in body or "panelMat" in body
    assert "dockPlatform" in body
    assert "dockDoorMat" in body
    assert "hvacMat" in body
    assert "signBand" in body


def test_underground_fiber_has_above_grade_surface_markings() -> None:
    """QA finding: the buried conduit at y=-0.6 was fully occluded by
    the site plate (top at y=-0.34) so the user couldn't see the
    fiber at all. Real DCs use utility-marking paint + raised
    handhole covers + warning signs as visible above-grade signals.
    All three must be present."""
    source = load_3d_source()
    body = between(
        source,
        "/* QA finding (this PR): the underground conduit at y=-0.6",
        "/* Carrier junction box */",
    )

    # Surface-level utility marking stripe
    assert "addSurfaceMarking(" in body
    assert "markingMat" in body
    # Raised handhole covers (not flush)
    assert "Outer rim" in body or "handholeRimMat" in body
    # Cut-away vault revealing buried conduit
    assert "vaultMat" in body or "Cut-away vault" in body
    # Warning sign on a post
    assert "warnSignMat" in body
    # Below-grade strand is preserved for orbit-from-below users
    assert "fiberBuriedMat" in body


def test_scene_wide_ibl_tuning_pass_exists() -> None:
    """High-metalness, low-roughness materials default to
    envMapIntensity=1.0 in Three.js, which is too glossy under a
    real HDRI. A scene-wide traversal pass caps untuned materials
    based on their metalness/roughness profile."""
    source = load_3d_source()
    assert "function tuneSceneIBL(" in source
    assert "tuneSceneIBL(worldGroup)" in source
    body = between(source, "function tuneSceneIBL(", "tuneSceneIBL(worldGroup)")
    # Heuristic should respect already-tuned materials
    assert "mat.envMapIntensity !== 1.0" in body
    # And differentiate by metalness/roughness
    assert "mat.metalness" in body
    assert "mat.roughness" in body


def test_gltf_loader_infrastructure_is_wired() -> None:
    """Path D — glTF asset library. The loader infrastructure is
    in place so adding a .glb to /app/static/models/ + an entry to
    FORGE_ASSETS upgrades a procedural prop. The cache layer means
    each asset is fetched once per session."""
    source = load_3d_source()
    assert "const FORGE_ASSETS = {" in source
    assert "function ensureGLTFLoader()" in source
    assert "function loadAsset(assetKey)" in source
    assert "_assetCache" in source
    assert "GLTFLoader.js" in source


def test_demo_url_param_seeds_polished_state() -> None:
    """The ?demo=repurpose-online URL param seeds a marketing-quality
    state so the floor view renders the polished repurpose phase 8
    scene without the user having to click through 8 phases. Required
    because the beforeunload handler writes in-memory state back to
    localStorage on every navigation, making it impossible to inject
    a polished state from outside the app via direct localStorage
    manipulation."""
    source = load_source()

    # Demo presets registry exists
    assert "const DEMO_PRESETS = {" in source
    assert '"repurpose-online"' in source

    # URL-param applier exists and is wired into init()
    assert "function applyDemoStateFromURL()" in source
    assert "applyDemoStateFromURL();" in source

    # The repurpose preset uses the right location + phase
    preset_body = between(source, '"repurpose-online":', "function applyDemoStateFromURL")
    assert 'locationType: "repurpose"' in preset_body
    assert "phase: 8" in preset_body
    assert "completed: [1, 2, 3, 4, 5, 6, 7]" in preset_body

    # The URL is stripped after seeding so back/forward doesn't re-seed
    applier_body = between(source, "function applyDemoStateFromURL()", "function seedDefaultDemoIfEmpty")
    assert "history.replaceState" in applier_body
    assert 'params.delete("demo")' in applier_body


def test_default_demo_seeds_polished_scene_on_empty_localstorage() -> None:
    """When localStorage is completely empty (first visit, post-reset,
    cleared browser data), seedDefaultDemoIfEmpty() runs in init()
    and writes the polished repurpose-online demo state so the
    landing experience matches the reference image. Returning users
    keep their build (the seeder bails when localStorage is set)."""
    source = load_source()

    assert "function seedDefaultDemoIfEmpty()" in source
    assert "seedDefaultDemoIfEmpty();" in source

    body = between(source, "function seedDefaultDemoIfEmpty()", "function enforceLocks")
    # The seeder must bail when state already exists (don't clobber
    # the user's build)
    assert "if (existing) return" in body
    # It uses the repurpose-online preset
    assert 'DEMO_PRESETS["repurpose-online"]' in body
    # And writes to the same key the rest of the persist path uses
    assert "FULL_STATE_KEY" in body


def test_phase_8_building_has_mint_rim_glow() -> None:
    """The reference image shows a prominent mint cyan rim along the
    top of the DC building when Phase 8 is online. This rim is what
    sells the 'facility online' state visually."""
    source = load_3d_source()
    body = between(source, "/* Phase 8 mint cap-rim", "/* Mechanical penthouse")
    # Gated on Phase 8
    assert "if (fullyOnline)" in body
    # Four rim segments wrap the building perimeter
    assert "rimGlowMat" in body
    assert "rimN" in body
    assert "rimS" in body
    # Corner point lights cast mint into the immediate scene
    assert "cornerLight" in body
    assert "0x33fbd3" in body
