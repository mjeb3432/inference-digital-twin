# THE FORGE — Agent Handoff Spec

**Repo:** `mjeb3432/inference-digital-twin`
**Working dir:** `C:\Users\micha\OneDrive\Desktop\GStack\inference-digital-twin\`
**Owner:** Michael Brown (Simply Silicon / Augur)
**Last updated:** 2026-04-23

> **Status change:** The frontend was migrated from vanilla JS to React + Vite + TypeScript + Tailwind + shadcn. See `docs/MIGRATION.md` for the full story. The rest of this document describes the new stack.

---

## 1. Stack (after migration)

| Layer | Tech |
|---|---|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind + shadcn/ui + framer-motion + @react-three/fiber + three.js r168 (WebGPU with WebGL fallback) |
| **Frontend build** | `cd frontend && npm run build` → writes to `app/static/dist/` |
| **Dev server** | Vite on `:5173` with proxy to FastAPI `:8000` (use `dev.bat`) |
| **Backend** | FastAPI, uvicorn, serves SPA from `app/static/dist/index.html` at `/forge` |
| **Database** | SQLite (`inference_digital_twin.db` next to the exe) |
| **Desktop shell** | PyQt6 + QWebEngineView loading `http://127.0.0.1:8000/forge` |
| **Launch (prod)** | `launch.bat` — builds frontend if missing, then runs desktop_main |
| **Launch (dev)** | `dev.bat` — Vite HMR + FastAPI in parallel |

---

## 2. What Michael wants

Five components from 21st.dev need to live natively in the app:

| # | Component | Status | Location |
|---|---|---|---|
| 1 | **hero-futuristic** (WebGPU depth-parallax + red scan, used as intro) | **DONE** — ported with data-center image | `frontend/src/components/hero-futuristic.tsx` |
| 2 | **cpu-architecture** (animated SVG motherboard) | STUB placeholder | `frontend/src/components/cpu-architecture.tsx` |
| 3 | **flickering-grid-hero** (canvas flickering grid) | STUB placeholder | `frontend/src/components/flickering-grid.tsx` |
| 4 | **interactive-logs-table** (framer-motion expandable rows) | STUB placeholder with wiring | `frontend/src/components/interactive-logs-table.tsx` |
| 5 | **Spline 3D scene** (iframe embed of spline.design scene) | STUB placeholder | `frontend/src/components/spline-scene.tsx` |

To paste the real version of any stub, replace the file contents with the 21st.dev source and run `npm install <missing-deps>` + `npx shadcn add <missing-ui>`. Then `npm run build`.

### Aesthetic target (from `DESIGN.md`)

- **Colors:** bg `#08090B`, amber accent `#F5A623`, nominal green `#4ADE80`, teal `#14B8A6`, red accent `#EF4444`. Tokens exposed as Tailwind classes (`bg-forge-bg`, `text-forge-amber`, etc.) and as shadcn CSS vars.
- **Typography:** Comfortaa (display, titles — rounded geometric face), Plus Jakarta Sans (body), IBM Plex Mono (data/kickers). Loaded from Google Fonts in `index.html`.
- **Feel:** "Calm control-room energy. Precise, trustworthy, operationally focused. NOT flashy."
- **Anti-pattern:** rectangles labelled "SERVER RACK". Flat gradients with emoji icons. Drafts A/B/C failed because they read as "AI slop."

---

## 3. What was done this session

### Migration commits
- Added `frontend/` directory with complete Vite/React/TS/Tailwind/shadcn scaffold
- Ported `hero-futuristic` React component (WebGPU + TSL shader graph) — only two changes vs the 21st.dev reference: texture URL points at a data-center photo, title reads "THE FORGE"
- Created stub files for the other four components so the layout compiles today
- Modified `app/main.py`: `/forge` now serves `app/static/dist/index.html` if present, falls back to Jinja template otherwise
- Rewrote `launch.bat` to run `npm install` + `npm run build` on first run
- Added `dev.bat` for dual-server development with Vite HMR
- Wrote `docs/MIGRATION.md` with full setup + rollback instructions

### What is explicitly preserved
- All FastAPI routes other than `/forge`
- Scenario JSON contracts (`contracts/v1/`)
- SQLite schema + migrations
- PyQt desktop shell — still loads `http://127.0.0.1:8000/forge`, same URL
- Jinja templates — still present as fallback, still render if SPA isn't built

### What remains undone
- **PyQt title screens** still show before the web intro. `SpaceTitleScreen` (Earth zoom) + `WBRTitleScreen` (Watt-Bit splash) take ~4.4s (FAST_INTRO=1) or ~13s to play through. They don't match the new amber aesthetic. Decision pending: shorten, replace, or remove entirely.
- **Four component ports** are stubs. See table above.
- **No CDHI-01 photo yet.** Placeholder Unsplash data-center image in `hero-futuristic.tsx`. Swap `TEXTUREMAP.src`.
- **No real depth map.** Still pointing at the reference `postimg.cc/raw-4.webp`. Generate one with MiDaS once the hero image is finalized.
- **shadcn components not yet added.** `frontend/src/components/ui/` is empty. Run `npx shadcn add button card dialog tabs` etc. as needed.

---

## 4. Known issues / risks

1. **Node must be installed.** `launch.bat` degrades gracefully (falls back to Jinja) if `npm install` fails, but the React experience requires Node 18+.
2. **PyQt title chain still runs before the web intro.** Probably what Michael will perceive as "the title page" — not the React hero.
3. **WebGPU availability.** Three.js r168 WebGPURenderer works great in Chrome/Edge, degrades to WebGL in Firefox/Safari. Our `hero-futuristic.tsx` tries WebGPU first then retries with `forceWebGL: true` on failure.
4. **Build output is gitignored.** `app/static/dist/` is NOT committed. Every agent/dev must run `npm run build` or use `dev.bat`.
5. **When editing the vanilla fallback files** (`app/static/forge.js`, `app/static/intro.js`, etc.): note that those are only served if `app/static/dist/index.html` is absent. In production you'll usually be hitting the React SPA.
6. **Cache busting is automatic** now — Vite hashes filenames. No more `?v=YYYYMMDD` query strings needed.

---

## 5. Priority todo list

### P0 — Close the loop on the intro
- [ ] Decide on PyQt title screens. Recommendation: **delete `SpaceTitleScreen` + `WBRTitleScreen`**, have `AppManager` load `MainAppWindow` immediately. The React intro IS the title. Edit `desktop/desktop_main.py` lines 55-73 and `desktop/app_manager.py`.
- [ ] Run `npm install` + `npm run build` at least once to produce `app/static/dist/`. Verify `launch.bat` lands on the React SPA, not the Jinja fallback.
- [ ] Get a real CDHI-01 or similar data-center photograph. Host in `frontend/public/hero/` (bundled with build) or `app/static/img/` (served by FastAPI). Update `TEXTUREMAP.src` in `hero-futuristic.tsx`.
- [ ] Generate depth map with MiDaS-Hybrid. Host alongside the image. Update `DEPTHMAP.src`.

### P1 — Paste the real components
For each of `flickering-grid.tsx`, `cpu-architecture.tsx`, `interactive-logs-table.tsx`:
1. Replace the stub contents with the 21st.dev source.
2. `cd frontend && npm install <missing deps>`.
3. For any shadcn imports: `npx shadcn@latest add <name>`.
4. `npm run build` to verify.

### P2 — Spline scene
Get a Spline scene embed URL from Michael (requires designing the scene in spline.design). Pass it to `<SplineScene src={url} />` in `forge-shell.tsx`.

### P3 — Wire frontend to FastAPI
The stubs currently show hardcoded seed data. Replace with `fetch('/api/…')` calls. Endpoints already exist in `app/api/routes.py`. Consider adding React Query (`@tanstack/react-query`) if data fetching gets complex.

### P4 — shadcn component library
Add `button`, `card`, `dialog`, `tabs`, `tooltip`, `select`, `input`, `sheet` — the core set the Forge will need. One-line each via `npx shadcn add`.

---

## 6. Local verification

```bat
cd C:\Users\micha\OneDrive\Desktop\GStack\inference-digital-twin

:: first-time build
cd frontend
npm install
npm run build
cd ..

:: run the desktop app
launch.bat
```

Should result in:
1. PyQt title screens play (Earth zoom → Watt-Bit splash), ~4.4s total if FAST_INTRO=1.
2. `MainAppWindow` loads `/forge`.
3. FastAPI serves `app/static/dist/index.html` (the React SPA).
4. React mounts, `HeroFuturistic` renders the WebGPU intro with data-center image + red scan line.
5. After 7s OR on click/Enter/Esc/Space, the intro dismisses.
6. `ForgeShell` is visible — 3-rail layout (decision | canvas | inspector) with the stub components in the center.
7. DevTools console: zero uncaught errors. Acceptable: a warning like `[hero] WebGPU unavailable, falling back to WebGL` on non-Chrome browsers.

For iterative development:
```bat
dev.bat
:: Opens FastAPI on :8000 in a new window, Vite dev server on :5173 in current.
:: Open http://127.0.0.1:5173 in Chrome. Edit .tsx files → hot reload.
```

---

## 7. Red flags for the next agent

- **DO** paste `.tsx` files directly — the toolchain now supports them.
- **DO** use Tailwind classes (`bg-forge-amber`, `text-white/70`, etc.) — all configured.
- **DO** run `npx shadcn@latest add <name>` when a component references `@/components/ui/*`.
- **DO** hash-refresh the browser after `npm run build` if you're using `launch.bat`, or just use `dev.bat` for hot reload.
- **DON'T** add `app/static/dist/` to git — it's the build output.
- **DON'T** break the Jinja fallback by removing `app/templates/forge.html` or the vanilla CSS/JS — the app relies on it when `npm run build` hasn't been run.
- **DON'T** use `localStorage` / `sessionStorage` — the Forge uses React state + server-side SQLite. Artifacts in Claude's environment also don't support browser storage.
- **DON'T** wire intro dismiss handlers inside async effects that might fail — set them up synchronously in `App.tsx` so they always attach. (This was the root cause of last session's "stuck on title page" bug.)
- **DON'T** assume WebGPU availability. Use the try-WebGPU-then-fallback pattern already in `hero-futuristic.tsx`.
- **DON'T** touch the FastAPI routes other than `/forge` unless you really mean to.

---

## 8. File reference

```
inference-digital-twin/
├── frontend/                       ← React SPA source (npm project)
│   ├── package.json
│   ├── vite.config.ts              ← outputs to ../app/static/dist/
│   ├── tailwind.config.ts          ← Forge design tokens
│   ├── components.json             ← shadcn CLI config
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx                ← React root
│       ├── App.tsx                 ← Intro + shell composition
│       ├── index.css               ← Tailwind + CSS vars
│       ├── lib/utils.ts            ← cn() helper
│       └── components/
│           ├── hero-futuristic.tsx ← DONE
│           ├── forge-shell.tsx     ← DONE (layout only)
│           ├── flickering-grid.tsx ← STUB
│           ├── cpu-architecture.tsx ← STUB
│           ├── interactive-logs-table.tsx ← STUB
│           ├── spline-scene.tsx    ← STUB
│           └── ui/                 ← shadcn components go here
├── app/
│   ├── main.py                     ← /forge serves SPA or Jinja fallback
│   ├── api/routes.py               ← FastAPI endpoints (unchanged)
│   ├── static/
│   │   ├── dist/                   ← gitignored — Vite build output
│   │   ├── forge.css               ← legacy fallback (don't delete yet)
│   │   ├── forge.js                ← legacy fallback
│   │   ├── intro.css               ← legacy fallback
│   │   └── intro.js                ← legacy fallback
│   └── templates/
│       └── forge.html              ← legacy fallback
├── desktop/
│   ├── desktop_main.py             ← edit to skip PyQt titles (P0)
│   ├── app_manager.py              ← signal chain for title screens
│   └── screens/
│       ├── space_title_screen.py   ← candidate to delete (P0)
│       ├── wbr_title_screen.py     ← candidate to delete (P0)
│       └── main_app_window.py      ← loads /forge in QWebEngineView
├── launch.bat                      ← prod runner (builds frontend if missing)
├── dev.bat                         ← dev runner (Vite HMR + FastAPI)
├── run.py                          ← web-only, uvicorn 127.0.0.1:8000
├── DESIGN.md                       ← design tokens + aesthetic brief
└── docs/
    ├── AGENT_HANDOFF.md            ← this file
    └── MIGRATION.md                ← full migration story + rollback
```

---

## 9. Contact

- Michael Brown — `michaelbrownyyc@gmail.com`, (587) 969-1978
- Repo: `mjeb3432/inference-digital-twin`
- Design brief: `DESIGN.md`, `docs/designs/ui-startup-performance.md`
- Drafts A/B/C analysis: `C:\Users\micha\OneDrive\Desktop\GStack\plan.md`
- Original React components: 21st.dev

End of handoff.
