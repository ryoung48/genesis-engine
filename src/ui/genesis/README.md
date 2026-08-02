# `src/ui/genesis`

The genesis world-simulation experience: procedural world generation, the
3D globe/solar-system renderer, and the panels/overlays around it. Entry
point is `view/GenesisView.tsx`, mounted at the app root.

## Subfolders

- `view` — the top-level `GenesisView` component and its orchestration
  hooks (scene sync, overlay state, map coloring/export, display data)
- `renderer` — Three.js scene, terrain, meshes, textures, and overlay
  rendering for the planet globe
- `solar-system` — multi-body solar-system view: controls, camera/orbit
  hooks, and the solar-system overlay renderer
- `political` — EU4/nation political-map concerns: province hover,
  nation border/fill overlays, government/religion display, conflict display
- `wiki-bridge` — adapters that pull wiki-article data (`src/ui/wiki`) into
  genesis world state (nation, organization, and war wiki data hooks)
- `generation` — world generation/import workflow: defaults, sliders,
  preview, session persistence, and history timeline glue
- `controls` — UI chrome: mode bar, simulation controls, overlay control
  panels
- `details` — the details drawer and its per-entity panels
- `hover` — hover/info-panel state and formatting
- `particles` — wind/ocean-current/flow particle canvas overlays
- `shared` — small cross-cutting helpers: color palettes, clock, export
  naming, screen-local constants and formatters

## What does not belong here

- Core simulation and generation algorithms (`src/model`)
- The wiki article/browsing system itself (`src/ui/wiki`)
- Generic UI components with no genesis-specific behavior
