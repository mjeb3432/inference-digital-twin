# Frontend Migration — Vanilla JS → React + Vite + TS + Tailwind + shadcn

**Date:** 2026-04-23
**Why:** The Forge needs five components from 21st.dev — hero-futuristic, cpu-architecture, flickering-grid-hero, interactive-logs-table, and a Spline 3D scene. All five are written as React + TypeScript + Tailwind. Porting them to vanilla JS is lossy, brittle, and keeps losing behaviour (the depth-parallax, the framer-motion row expansion, the TSL bloom graph). This migration restructures the frontend to run those components natively while leaving the FastAPI backend, SQLite database, PyQt desktop shell, and scenario JSON contracts untouched.

---

## 1. Before vs. after

| | Before | After |
|---|---|---|
| Template engine | Jinja2 (`app/templates/forge.html`) | React SPA (`frontend/src/`) |
| Styling | Hand-written CSS (`app/static/forge.css` + `intro.css`) | Tailwind + CSS vars |
| Component library | None | shadcn/ui (configured, ready for `npx shadcn add …`) |
| Build pipeline | None — raw ES modules via importmap | Vite → `app/static/dist/` |
| Dev loop | Edit → refresh | Vite HMR + FastAPI on two ports |
| FastAPI `/forge` | Renders Jinja template | Serves Vite `index.html` (falls back to Jinja if no build) |
| Desktop shell | PyQt loads `/forge` | **Unchanged** — same URL, different HTML under the hood |
| Scenario API / DB | **Unchanged** | **Unchanged** |

---

## 2. First-time setup

Prerequisite: **Node.js 18+** (LTS) installed on your machine. Verify with `node --version`.

```bat
:: From the repo root on Windows
cd frontend
npm install
npm run build
cd ..
launch.bat
```

`npm install` pulls ~230 MB into `frontend/node_modules/`. `npm run build` takes 10-20 seconds and writes to `app/static/dist/`. `launch.bat` starts PyQt → loads `/forge` → FastAPI serves the React SPA.

---

## 3. Development loop

Use `dev.bat` instead of `launch.bat` when iterating on the UI.

```bat
dev.bat
```

That spawns two processes:
1. **FastAPI on :8000** (in a new window) — your API, database, and scenario endpoints.
2. **Vite dev server on :5173** (in the current window) — React hot module reload.

Open `http://127.0.0.1:5173` in your browser (Chrome recommended for WebGPU). Vite proxies `/api`, `/runs`, `/static`, `/health` to FastAPI so you only ever need one URL.

When you're done iterating, run `npm run build` from `frontend/` to produce the production bundle, then `launch.bat` runs the desktop app against that bundle.

---

## 4. Where things live now

```
inference-digital-twin/
├── frontend/                           ← NEW — React SPA source
│   ├── package.json                    ← npm deps (React, Tailwind, three, framer-motion, shadcn)
│   ├── vite.config.ts                  ← Vite build → app/static/dist/
│   ├── tailwind.config.ts              ← Forge design tokens
│   ├── components.json                 ← shadcn CLI config
│   ├── index.html                      ← Vite entry
│   └── src/
│       ├── main.tsx                    ← React root
│       ├── App.tsx                     ← Intro overlay + ForgeShell
│       ├── index.css                   ← Tailwind + CSS vars
│       ├── lib/utils.ts                ← `cn()` helper for shadcn
│       └── components/
│           ├── hero-futuristic.tsx     ← FULL PORT — opening intro (WebGPU + TSL)
│           ├── forge-shell.tsx         ← Main 3-rail layout
│           ├── flickering-grid.tsx     ← STUB — replace with 21st.dev component
│           ├── cpu-architecture.tsx    ← STUB — replace with 21st.dev component
│           ├── interactive-logs-table.tsx ← STUB — has framer-motion wiring
│           ├── spline-scene.tsx        ← STUB — drop in Spline iframe URL
│           └── ui/                     ← (empty) — populate with `npx shadcn add button …`
├── app/
│   ├── main.py                         ← MODIFIED — serves SPA or Jinja fallback
│   ├── static/
│   │   ├── dist/                       ← NEW (gitignored) — Vite build output
│   │   ├── forge.css                   ← unchanged (fallback path)
│   │   ├── forge.js                    ← unchanged (fallback path)
│   │   ├── intro.css                   ← unchanged (fallback path)
│   │   └── intro.js                    ← unchanged (fallback path)
│   └── templates/
│       └── forge.html                  ← unchanged (fallback path)
├── launch.bat                          ← MODIFIED — builds frontend if missing
├── dev.bat                             ← NEW — dev-mode dual-server launcher
└── docs/
    ├── MIGRATION.md                    ← this file
    └── AGENT_HANDOFF.md                ← agent brief
```

---

## 5. Adding shadcn components

shadcn's CLI pastes components directly into your repo rather than installing them as a package. Run from `frontend/`:

```bat
cd frontend
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
npx shadcn@latest add tabs
:: ... etc
```

Each command writes to `frontend/src/components/ui/<name>.tsx`. The `components.json` at the frontend root tells shadcn where to put files, which Tailwind config to use, and which alias (`@/components/ui`) to import from.

---

## 6. Pasting the real 21st.dev components

For each of the four stubs (`flickering-grid.tsx`, `cpu-architecture.tsx`, `interactive-logs-table.tsx`, `spline-scene.tsx`):

1. Copy the full `.tsx` source from 21st.dev into the existing stub file, replacing its contents.
2. If it imports from `@/components/ui/<name>` — run `npx shadcn@latest add <name>` first.
3. If it imports a package the project doesn't have yet — `npm install <pkg>` from `frontend/`.
4. `npm run build` to verify it compiles.

`hero-futuristic.tsx` is already a faithful port of the reference component — it just points at a data-center photograph instead of the hand and reads "THE FORGE" instead of "Build Your Dreams". If you get a real CDHI-01 image + matching MiDaS depth map, swap `TEXTUREMAP.src` and `DEPTHMAP.src` at the top of the file.

---

## 7. Keeping the vanilla-JS fallback

`app/main.py` checks whether `app/static/dist/index.html` exists before serving. If `npm run build` hasn't been run — or if node_modules is broken — the old `forge.html` Jinja template still renders. This means:

- You can check out any commit pre-migration and the app still works.
- First-time users without Node installed still get a functional (if lower-fidelity) app.
- A broken frontend build never takes down the backend.

Once the React SPA is stable, you can delete `app/static/forge.js`, `app/static/intro.js`, `app/static/intro.css`, and `app/templates/forge.html` — but not before.

---

## 8. CI / deployment notes

If you add GitHub Actions CI:

```yaml
- uses: actions/setup-node@v4
  with: { node-version: '20' }
- run: cd frontend && npm ci && npm run build
- uses: actions/setup-python@v5
  with: { python-version: '3.11' }
- run: pip install -e ".[desktop]"
- run: pytest
```

For the PyInstaller bundle (if/when you produce a distributable `.exe`), add `app/static/dist/` to the PyInstaller `--add-data` list so the build output ships with the binary. Adjust `desktop/desktop_main.py`'s `_setup_frozen_paths` accordingly.

---

## 9. Rollback plan

If this migration breaks things badly and you need to roll back fast:

```bat
git revert <migration commit sha>
```

The vanilla-JS path is still fully wired. FastAPI re-renders `forge.html`, PyQt loads `/forge`, and the app runs as before. You lose the React components but nothing downstream breaks.

End of migration doc.
